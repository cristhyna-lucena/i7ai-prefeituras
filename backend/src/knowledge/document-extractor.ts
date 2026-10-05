import { BadRequestException } from '@nestjs/common';
import { extname } from 'node:path';
import * as mammoth from 'mammoth';
import * as ExcelJS from 'exceljs';
import { ocrPdfPages } from './pdf-ocr';

export const DOCUMENT_MAX_BYTES = Math.min(100 * 1024 * 1024, Math.max(1024, Number(process.env.DOCUMENT_MAX_BYTES) || 50 * 1024 * 1024));
export const MIME_BY_EXTENSION: Record<string, string> = {
  '.txt': 'text/plain', '.md': 'text/markdown', '.log': 'text/plain', '.csv': 'text/csv',
  '.json': 'application/json', '.xml': 'application/xml', '.html': 'text/html', '.htm': 'text/html',
  '.pdf': 'application/pdf', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

export type DocumentUpload = { originalname: string; mimetype: string; size: number; buffer: Buffer };

export function validateDocument(file?: DocumentUpload): string {
  if (!file?.buffer || !file.originalname) throw new BadRequestException('Selecione um arquivo para enviar.');
  if (!file.size || !file.buffer.length) throw new BadRequestException('O arquivo está vazio.');
  if (file.size > DOCUMENT_MAX_BYTES || file.buffer.length > DOCUMENT_MAX_BYTES) throw new BadRequestException(`O arquivo excede o limite de ${Math.floor(DOCUMENT_MAX_BYTES / 1024 / 1024)} MB.`);
  const extension = extname(file.originalname).toLowerCase();
  const mimeType = MIME_BY_EXTENSION[extension];
  if (!mimeType) throw new BadRequestException('Formato não suportado. Envie PDF, DOCX, XLSX, TXT, MD, CSV, JSON, XML ou HTML.');
  const receivedMime = file.mimetype?.split(';')[0].trim().toLowerCase();
  const aliases: Record<string, string[]> = {
    '.md': ['text/plain'], '.log': ['text/plain'], '.csv': ['text/plain', 'application/vnd.ms-excel'],
    '.json': ['text/json'], '.xml': ['text/xml'],
    '.docx': ['application/zip', 'application/octet-stream'], '.xlsx': ['application/zip', 'application/octet-stream'],
  };
  if (receivedMime && receivedMime !== 'application/octet-stream' && receivedMime !== mimeType && !aliases[extension]?.includes(receivedMime)) throw new BadRequestException('O tipo MIME não corresponde à extensão do arquivo.');
  if (extension === '.pdf' && !file.buffer.subarray(0, 1024).includes(Buffer.from('%PDF-'))) throw new BadRequestException('O conteúdo não é um PDF válido.');
  if (['.docx', '.xlsx'].includes(extension) && (file.buffer.length < 4 || file.buffer.readUInt16LE(0) !== 0x4b50)) throw new BadRequestException('O conteúdo não é um documento Office válido.');
  return mimeType;
}

function stripMarkup(text: string) {
  return text.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, ' ').replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, ' ')
    .replace(/<[^>]*>/g, ' ').replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Math.min(Number(n), 0x10ffff)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(Math.min(parseInt(n, 16), 0x10ffff)))
    .replace(/&nbsp;/gi, ' ').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&quot;/gi, '"').replace(/&apos;/gi, "'").replace(/&amp;/gi, '&');
}

export async function extractDocumentText(name: string, buffer: Buffer): Promise<string> {
  const extension = extname(name).toLowerCase();
  let text: string;
  if (extension === '.pdf') {
    let PDFParse: typeof import('pdf-parse').PDFParse;
    try { ({ PDFParse } = await import('pdf-parse')); }
    catch { throw new Error('O extrator PDF está indisponível. Instale as dependências nativas opcionais de pdf-parse para a plataforma do servidor.'); }
    const parser = new PDFParse({ data: new Uint8Array(buffer) });
    try {
      const extracted = await parser.getText({ pageJoiner: '' });
      text = await ocrPdfPages(parser, extracted.pages);
    } finally { await parser.destroy(); }
  } else if (extension === '.docx') {
    text = (await mammoth.extractRawText({ buffer })).value;
  } else if (extension === '.xlsx') {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as never);
    const lines: string[] = [];
    workbook.eachSheet((sheet) => {
      lines.push(`[Planilha: ${sheet.name}]`);
      sheet.eachRow((row) => {
        const cells: string[] = [];
        row.eachCell({ includeEmpty: true }, (cell) => { cells.push(cell.text); });
        lines.push(cells.join('\t'));
      });
    });
    text = lines.join('\n');
  } else {
    text = buffer.toString('utf8');
    if (text.includes('\0')) throw new Error('O arquivo de texto contém dados binários.');
    if (['.html', '.htm', '.xml'].includes(extension)) text = stripMarkup(text);
  }
  text = text.replace(/\r\n/g, '\n').replace(/[\t ]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  if (!text) throw new Error(extension === '.pdf' ? 'PDF sem texto legível, inclusive após OCR local. Verifique a qualidade da digitalização.' : 'O documento não contém texto extraível.');
  if (text.length > 4_000_000) throw new Error('O texto extraído excede o limite de processamento de 4 milhões de caracteres.');
  return text;
}

export function chunkDocument(content: string): string[] {
  const chunks: string[] = [];
  const size = 1200; const overlap = 150;
  for (let start = 0; start < content.length; start += size - overlap) {
    const text = content.slice(start, start + size).trim();
    if (text) chunks.push(text);
    if (start + size >= content.length) break;
  }
  return chunks;
}
