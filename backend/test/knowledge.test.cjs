const test = require('node:test');
const assert = require('node:assert/strict');
require('reflect-metadata');
const ExcelJS = require('exceljs');
const JSZip = require('jszip');
const { validateDocument, extractDocumentText, chunkDocument, DOCUMENT_MAX_BYTES } = require('../dist/knowledge/document-extractor');
const { RagService } = require('../dist/knowledge/rag.service');
const { KnowledgeService } = require('../dist/knowledge/knowledge.service');
const { DocumentPipelineService } = require('../dist/knowledge/document-pipeline.service');

function pdfFixture(text) {
  const stream = `BT /F1 12 Tf 40 140 Td (${text}) Tj ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
  ];
  let content = '%PDF-1.4\n'; const offsets = [0];
  objects.forEach((object, index) => { offsets.push(Buffer.byteLength(content)); content += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = Buffer.byteLength(content);
  content += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n` + offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('');
  content += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(content);
}

test('upload rejects missing, empty, oversized, unsupported and spoofed Office/PDF files', () => {
  assert.throws(() => validateDocument(), /Selecione/);
  assert.throws(() => validateDocument({ originalname: 'a.txt', size: 0, buffer: Buffer.alloc(0) }), /vazio/);
  assert.throws(() => validateDocument({ originalname: 'a.txt', size: DOCUMENT_MAX_BYTES + 1, buffer: Buffer.from('x') }), /limite/);
  assert.throws(() => validateDocument({ originalname: 'a.exe', size: 1, buffer: Buffer.from('x') }), /suportado/);
  assert.throws(() => validateDocument({ originalname: 'a.pdf', size: 1, buffer: Buffer.from('x') }), /PDF válido/);
  assert.throws(() => validateDocument({ originalname: 'a.docx', size: 1, buffer: Buffer.from('x') }), /Office válido/);
});

test('extracts actual PDF bytes on Windows without transferable Buffer failure', async () => {
  const original = pdfFixture('Municipal budget approved');
  const copy = Buffer.from(original);
  assert.match(await extractDocumentText('budget.pdf', original), /Municipal budget approved/);
  assert.deepEqual(original, copy);
  await assert.rejects(() => extractDocumentText('scan.pdf', pdfFixture('')), /OCR/);
});

test('extracts actual DOCX archive and XLSX cells including calculated values', async () => {
  const zip = new JSZip();
  zip.file('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
  zip.file('word/document.xml', '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Plano municipal de saúde</w:t></w:r></w:p></w:body></w:document>');
  assert.match(await extractDocumentText('health.docx', await zip.generateAsync({ type: 'nodebuffer' })), /Plano municipal de saúde/);
  const workbook = new ExcelJS.Workbook(); const sheet = workbook.addWorksheet('Orçamento');
  sheet.addRow(['Secretaria', 'Valor']); sheet.addRow(['Saúde', 250]); sheet.addRow(['Total', { formula: 'SUM(B2)', result: 250 }]);
  const text = await extractDocumentText('budget.xlsx', Buffer.from(await workbook.xlsx.writeBuffer()));
  assert.match(text, /Orçamento/); assert.match(text, /Saúde 250/); assert.match(text, /Total 250/);
});

test('text extraction strips scripts/markup, rejects empty and binary files, chunks with overlap', async () => {
  assert.equal(await extractDocumentText('a.html', Buffer.from('<script>ignore()</script><p>Lei &amp; gestão</p>')), 'Lei & gestão');
  await assert.rejects(() => extractDocumentText('empty.txt', Buffer.from('  ')), /texto extraível/);
  await assert.rejects(() => extractDocumentText('binary.txt', Buffer.from([1, 0, 3])), /binários/);
  const content = 'a'.repeat(1100) + 'CONTEXT' + 'b'.repeat(1300); const chunks = chunkDocument(content);
  assert.ok(chunks.length >= 2); assert.equal(chunks[0].slice(-150), chunks[1].slice(0, 150));
});

test('agent with no bases, inactive bases or bases from another tenant cannot search tenant documents', async () => {
  let rawCalls = 0;
  const prisma = { agent: { findFirst: async () => ({ knowledgeBases: [] }) }, $queryRaw: async () => { rawCalls++; return []; } };
  const rag = new RagService(prisma, { configured: false });
  assert.deepEqual(await rag.searchForAgent('tenant-a', 'agent-a', 'contrato transporte'), []);
  prisma.agent.findFirst = async () => ({ knowledgeBases: [{ knowledgeBase: { id: 'foreign', tenantId: 'tenant-b', status: 'ACTIVE' } }, { knowledgeBase: { id: 'inactive', tenantId: 'tenant-a', status: 'INACTIVE' } }] });
  assert.deepEqual(await rag.searchForAgent('tenant-a', 'agent-a', 'contrato transporte'), []);
  assert.equal(rawCalls, 0);
});

test('literal retrieval uses individual terms, linked bases, tenant and READY restrictions', async () => {
  let query;
  const prisma = { agent: { findFirst: async () => ({ knowledgeBases: [{ knowledgeBase: { id: 'base-a', tenantId: 'tenant-a', status: 'ACTIVE' } }] }) }, $queryRaw: async (sql) => { query = sql; return [{ id: 'chunk', retrieval: 'literal' }]; } };
  const rag = new RagService(prisma, { configured: false });
  assert.equal((await rag.searchForAgent('tenant-a', 'agent-a', 'Como consultar contrato transporte?', 6)).length, 1);
  assert.ok(query.values.includes('tenant-a')); assert.ok(query.values.includes('base-a'));
  assert.ok(query.values.includes('%contrato%')); assert.ok(query.values.includes('%transporte%'));
  assert.match(query.sql, /d\."status" = 'READY'/); assert.match(query.sql, /kb\."tenantId"/); assert.match(query.sql, /knowledgeBaseId.*IN/s);
});

test('upload validates knowledge base ownership before storage or queue calls', async () => {
  let queued = false;
  const service = new KnowledgeService({ knowledgeBase: { findFirst: async ({ where }) => { assert.equal(where.tenantId, 'tenant-a'); return null; } } }, { enqueue: async () => { queued = true; } });
  await assert.rejects(() => service.uploadDocument('tenant-a', { originalname: 'a.txt', mimetype: 'text/plain', size: 5, buffer: Buffer.from('hello') }, 'foreign-base'), /não encontrada/);
  assert.equal(queued, false);
});

test('semantic retrieval uses compatible embeddings and preserves READY/base/tenant filters', async () => {
  const calls = [];
  const prisma = { $queryRaw: async (sql) => { calls.push(sql); return [{ id: 'semantic-a', retrieval: 'semantic' }, { id: 'semantic-b', retrieval: 'semantic' }]; } };
  const embeddings = { configured: true, model: 'text-embedding-3-small', embed: async () => [Array(1536).fill(0.25)] };
  const rag = new RagService(prisma, embeddings);
  const result = await rag.search('tenant-a', 'resumo orçamentário', 2, ['base-a']);
  assert.equal(result.length, 2); assert.equal(calls.length, 1);
  assert.match(calls[0].sql, /<=>/); assert.match(calls[0].sql, /embeddingModel/); assert.match(calls[0].sql, /READY/);
  assert.ok(calls[0].values.includes('tenant-a')); assert.ok(calls[0].values.includes('base-a')); assert.ok(calls[0].values.includes('text-embedding-3-small'));
});

test('embedding outage falls back to literal sources rather than failing chat retrieval', async () => {
  const prisma = { $queryRaw: async (sql) => { assert.match(sql.sql, /ILIKE/); return [{ id: 'literal-a', retrieval: 'literal' }]; } };
  const rag = new RagService(prisma, { configured: true, embed: async () => { throw Error('offline'); } });
  assert.equal((await rag.search('tenant-a', 'contrato transporte', 4, ['base-a']))[0].retrieval, 'literal');
});

test('document worker writes chunk vectors and marks READY only after successful extraction/indexing', async () => {
  const status = []; const chunks = []; const vectors = [];
  const document = { id: 'document-a', name: 'lei.txt', tenantId: 'tenant-a', storageKey: 'tenant-a/file' };
  const prisma = {
    document: { findFirst: async ({ where }) => { assert.equal(where.tenantId, 'tenant-a'); return document; }, updateMany: async ({ data }) => { status.push(data.status); }, update: async ({ data }) => { status.push(data.status); } },
    documentChunk: { deleteMany: async () => ({}), create: async ({ data }) => { chunks.push(data); return { id: 'chunk-' + chunks.length }; } },
    $executeRaw: async (sql) => { vectors.push(sql); },
  };
  prisma.$transaction = async (callback) => callback(prisma);
  // Construct the worker around mocked dependencies without opening Redis/S3 connections.
  const worker = Object.create(DocumentPipelineService.prototype);
  worker.prisma = prisma; worker.s3 = { send: async () => ({ Body: Buffer.from('Lei municipal do transporte escolar.') }) }; worker.bucket = 'test-bucket';
  worker.embeddings = { model: 'text-embedding-3-small', embed: async (texts) => texts.map(() => Array(1536).fill(0.25)) };
  await worker.process({ data: { documentId: 'document-a', tenantId: 'tenant-a' }, attemptsMade: 0, opts: { attempts: 3 } });
  assert.deepEqual(status, ['PROCESSING', 'READY']); assert.equal(chunks.length, 1); assert.equal(vectors.length, 1);
  assert.equal(chunks[0].metadata.embeddingModel, 'text-embedding-3-small'); assert.equal(JSON.parse(vectors[0].values[0]).length, 1536);
  status.length = 0; chunks.length = 0;
  worker.s3.send = async () => ({ Body: Buffer.from('   ') });
  await assert.rejects(() => worker.process({ data: { documentId: 'document-a', tenantId: 'tenant-a' }, attemptsMade: 0, opts: { attempts: 3 } }), /texto extraível/);
  assert.deepEqual(status, ['PROCESSING', 'FAILED']); assert.equal(chunks.length, 0);
});

function licensedKnowledgeFixture(overrides = {}) {
  const calls = []; const rows = [];
  const license = { status: 'ACTIVE', startDate: new Date(Date.now() - 86400000), endDate: null, maxStorageBytes: 100n, maxKnowledgeBases: 1, ...overrides };
  const prisma = {
    $queryRaw: async (sql) => { assert.match(sql.sql, /FOR UPDATE/); calls.push('tenant-lock'); return []; },
    license: { findFirst: async () => { calls.push('license'); return license; } },
    document: {
      aggregate: async () => ({ _sum: { sizeBytes: 96n } }),
      create: async ({ data }) => { calls.push('reserve'); const row = { id: 'document-a', createdAt: new Date(), ...data }; rows.push(row); return row; },
      update: async ({ data }) => { calls.push(data.status); return data; },
      deleteMany: async () => { calls.push('release'); rows.length = 0; },
    },
    knowledgeBase: { count: async () => 1, create: async () => { throw Error('Quota must prevent create'); } },
    auditLog: { create: async () => ({}) },
  };
  prisma.$transaction = async (callback) => callback(prisma);
  const service = new KnowledgeService(prisma, { enqueue: async () => { calls.push('enqueue'); } });
  service.s3 = { send: async (command) => { calls.push(command.constructor.name); return {}; } };
  return { service, prisma, calls, rows };
}

test('storage and knowledge base license allowances reject capacity before external upload/create', async () => {
  const { service, calls } = licensedKnowledgeFixture();
  await assert.rejects(() => service.uploadDocument('tenant-a', { originalname: 'a.txt', mimetype: 'text/plain', size: 5, buffer: Buffer.from('hello') }), /armazenamento/i);
  assert.ok(calls.includes('tenant-lock')); assert.equal(calls.some((call) => call.endsWith('Command')), false);
  await assert.rejects(() => service.createBase('tenant-a', { name: 'Nova base' }), /base/i);
});

test('upload reserves bytes within licensed transaction and releases reservation on S3 failure', async () => {
  const { service, calls, rows } = licensedKnowledgeFixture({ maxStorageBytes: 200n });
  service.s3.send = async (command) => { calls.push(command.constructor.name); throw Error('storage-offline'); };
  await assert.rejects(() => service.uploadDocument('tenant-a', { originalname: 'a.txt', mimetype: 'text/plain', size: 5, buffer: Buffer.from('hello') }), /salvar o arquivo/);
  assert.ok(calls.indexOf('tenant-lock') < calls.indexOf('reserve'));
  assert.ok(calls.indexOf('reserve') < calls.indexOf('HeadBucketCommand'));
  assert.ok(calls.includes('release')); assert.equal(rows.length, 0); assert.equal(calls.includes('enqueue'), false);
});
