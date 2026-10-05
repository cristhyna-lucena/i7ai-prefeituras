import { BadRequestException, ConflictException, Injectable, NotFoundException, ServiceUnavailableException, StreamableFile } from '@nestjs/common';
import { CreateBucketCommand, DeleteObjectCommand, GetObjectCommand, HeadBucketCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { DocumentPipelineService, readDocumentBuffer } from './document-pipeline.service';
import { CreateKnowledgeBaseDto, UpdateKnowledgeBaseDto } from './dto/knowledge.dto';
import { DocumentUpload, validateDocument } from './document-extractor';
import { assertLicenseCapacity, assertStorageCapacity } from '../catalog/license-policy';

@Injectable()
export class KnowledgeService {
  private readonly s3 = new S3Client({ endpoint: process.env.S3_ENDPOINT ?? 'http://localhost:9000', region: process.env.S3_REGION || 'us-east-1', forcePathStyle: true, credentials: { accessKeyId: process.env.S3_ACCESS_KEY ?? 'i7ai', secretAccessKey: process.env.S3_SECRET_KEY ?? 'i7ai_dev_minio' } });
  private readonly bucket = process.env.S3_BUCKET ?? 'i7ai-documents';

  constructor(private readonly prisma: PrismaService, private readonly pipeline: DocumentPipelineService) {}

  private async ensureBucket() {
    try { await this.s3.send(new HeadBucketCommand({ Bucket: this.bucket })); }
    catch (error) {
      if ((error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode !== 404) throw new ServiceUnavailableException('O armazenamento de documentos está indisponível.');
      await this.s3.send(new CreateBucketCommand({ Bucket: this.bucket }));
    }
  }

  async uploadDocument(tenantId: string, file?: DocumentUpload, knowledgeBaseId?: string, userId?: string) {
    const mimeType = validateDocument(file);
    if (knowledgeBaseId) await this.requireBase(tenantId, knowledgeBaseId);
    const selectedFile = file!;
    const storageKey = tenantId + '/' + randomUUID() + '-' + selectedFile.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    // Reserve storage under the same tenant lock used by license changes. The row also
    // makes simultaneous uploads count against the allowance before any S3 request.
    const document = await this.prisma.$transaction(async (tx) => {
      await assertStorageCapacity(tx, tenantId, BigInt(selectedFile.buffer.length));
      if (knowledgeBaseId && !await tx.knowledgeBase.findFirst({ where: { id: knowledgeBaseId, tenantId, status: 'ACTIVE' } })) {
        throw new BadRequestException('A base de conhecimento está indisponível para esta prefeitura.');
      }
      return tx.document.create({ data: { tenantId, knowledgeBaseId, name: selectedFile.originalname.slice(0, 255), mimeType, storageKey, sizeBytes: BigInt(selectedFile.buffer.length), status: 'UPLOADED' } });
    });
    try {
      await this.ensureBucket();
      await this.s3.send(new PutObjectCommand({ Bucket: this.bucket, Key: storageKey, Body: selectedFile.buffer, ContentType: mimeType }));
    } catch {
      // Release the reservation if storage fails, including an interrupted partial upload.
      await this.prisma.document.deleteMany({ where: { id: document.id, tenantId } });
      try { await this.s3.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: storageKey })); } catch { /* Cleanup can be retried by storage lifecycle policy. */ }
      throw new ServiceUnavailableException('Não foi possível salvar o arquivo. Verifique o armazenamento de documentos.');
    }
    await this.prisma.document.update({ where: { id: document.id }, data: { status: 'PROCESSING' } });
    try { await this.pipeline.enqueue(document.id, tenantId); }
    catch {
      await this.prisma.document.update({ where: { id: document.id }, data: { status: 'FAILED', errorMessage: 'Fila indisponível. Use reprocessar quando o Redis estiver disponível.' } });
      throw new ServiceUnavailableException('O arquivo foi salvo, mas a fila está indisponível. Ele aparece como falha na lista e pode ser reprocessado.');
    }
    await this.audit(tenantId, userId, 'document.uploaded', 'document', document.id);
    return { ...document, status: 'PROCESSING', sizeBytes: document.sizeBytes.toString() };
  }
  listBases(tenantId: string) {
    return this.prisma.knowledgeBase.findMany({ where: { tenantId }, include: { _count: { select: { documents: true, agents: true } } }, orderBy: { updatedAt: 'desc' } });
  }

  async createBase(tenantId: string, input: CreateKnowledgeBaseDto, userId?: string) {
    if (!input.name.trim()) throw new BadRequestException('Informe o nome da base.');
    const base = await this.prisma.$transaction(async (tx) => {
      await assertLicenseCapacity(tx, tenantId, 'knowledgeBases');
      return tx.knowledgeBase.create({ data: { tenantId, name: input.name.trim(), description: input.description } });
    });
    await this.audit(tenantId, userId, 'knowledge_base.created', 'knowledge_base', base.id);
    return base;
  }

  async updateBase(tenantId: string, id: string, input: UpdateKnowledgeBaseDto, userId?: string) {
    await this.requireBase(tenantId, id, false);
    if (input.name !== undefined && !input.name.trim()) throw new BadRequestException('Informe o nome da base.');
    const base = await this.prisma.knowledgeBase.update({ where: { id }, data: { ...input, ...(input.name ? { name: input.name.trim() } : {}) } });
    await this.audit(tenantId, userId, 'knowledge_base.updated', 'knowledge_base', id);
    return base;
  }

  async listDocuments(tenantId: string, knowledgeBaseId?: string) {
    if (knowledgeBaseId) await this.requireBase(tenantId, knowledgeBaseId, false);
    const documents = await this.prisma.document.findMany({ where: { tenantId, ...(knowledgeBaseId ? { knowledgeBaseId } : {}) }, include: { knowledgeBase: true, _count: { select: { chunks: true } } }, orderBy: { createdAt: 'desc' } });
    return documents.map((document) => ({ ...document, sizeBytes: document.sizeBytes.toString() }));
  }

  async assignBase(tenantId: string, id: string, knowledgeBaseId?: string | null, userId?: string) {
    await this.requireDocument(tenantId, id);
    if (knowledgeBaseId) await this.requireBase(tenantId, knowledgeBaseId);
    if (knowledgeBaseId === undefined) throw new BadRequestException('Informe knowledgeBaseId ou null para remover o vínculo.');
    const document = await this.prisma.document.update({ where: { id }, data: { knowledgeBaseId } });
    await this.audit(tenantId, userId, 'document.updated', 'document', id);
    return { ...document, sizeBytes: document.sizeBytes.toString() };
  }

  async download(tenantId: string, id: string) {
    const document = await this.requireDocument(tenantId, id);
    try {
      const response = await this.s3.send(new GetObjectCommand({ Bucket: this.bucket, Key: document.storageKey }));
      const content = await readDocumentBuffer(response.Body);
      return new StreamableFile(content, { type: document.mimeType, disposition: "attachment; filename*=UTF-8''" + encodeURIComponent(document.name), length: content.length });
    } catch { throw new ServiceUnavailableException('Não foi possível baixar o arquivo do armazenamento.'); }
  }

  async removeDocument(tenantId: string, id: string, userId?: string) {
    const document = await this.requireDocument(tenantId, id);
    if (document.status === 'PROCESSING' || (document.status === 'UPLOADED' && Date.now() - document.createdAt.getTime() < 10 * 60 * 1000)) throw new ConflictException('Aguarde o envio e o processamento terminarem antes de excluir o documento.');
    try { await this.s3.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: document.storageKey })); }
    catch { throw new ServiceUnavailableException('Não foi possível excluir o arquivo do armazenamento.'); }
    await this.prisma.document.deleteMany({ where: { id, tenantId } });
    await this.audit(tenantId, userId, 'document.deleted', 'document', id);
    return { id, deleted: true };
  }

  async reprocess(tenantId: string, id: string, userId?: string) {
    const document = await this.requireDocument(tenantId, id);
    if (document.status === 'PROCESSING' || (document.status === 'UPLOADED' && Date.now() - document.createdAt.getTime() < 10 * 60 * 1000)) throw new ConflictException('Este documento está sendo enviado ou processado.');
    await this.prisma.document.update({ where: { id }, data: { status: 'PROCESSING', errorMessage: null } });
    try { await this.pipeline.enqueue(id, tenantId); }
    catch {
      await this.prisma.document.update({ where: { id }, data: { status: 'FAILED', errorMessage: 'Fila indisponível. Tente reprocessar novamente.' } });
      throw new ServiceUnavailableException('A fila de processamento está indisponível.');
    }
    await this.audit(tenantId, userId, 'document.reprocessed', 'document', id);
    return { id, status: 'PROCESSING' };
  }

  private async requireBase(tenantId: string, id: string, active = true) {
    const base = await this.prisma.knowledgeBase.findFirst({ where: { id, tenantId } });
    if (!base) throw new NotFoundException('Base de conhecimento não encontrada.');
    if (active && base.status !== 'ACTIVE') throw new BadRequestException('Esta base de conhecimento está inativa.');
    return base;
  }

  private async requireDocument(tenantId: string, id: string) {
    const document = await this.prisma.document.findFirst({ where: { id, tenantId } });
    if (!document) throw new NotFoundException('Documento não encontrado.');
    return document;
  }

  private audit(tenantId: string, userId: string | undefined, event: string, resource: string, resourceId: string) {
    return this.prisma.auditLog.create({ data: { tenantId, userId, event, resource, resourceId } });
  }
}
