import { BadGatewayException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export const internalResources = ['documents', 'knowledge-bases', 'departments', 'agents'] as const;
export function querySchema() {
  return { type: 'object', properties: { query: { type: 'string', minLength: 1, maxLength: 500 }, limit: { type: 'integer', minimum: 1, maximum: 20 } }, required: ['query'], additionalProperties: false };
}
export function queryInput(input: Record<string, unknown>, configuredLimit = 10) {
  if (Object.keys(input).some(key => !['query', 'limit'].includes(key)) || typeof input.query !== 'string' || !input.query.trim() || input.query.length > 500 || (input.limit !== undefined && (!Number.isInteger(input.limit) || Number(input.limit) < 1 || Number(input.limit) > 20))) throw new BadRequestException('Informe query com até 500 caracteres e limit entre 1 e 20.');
  return { query: input.query.trim(), limit: Math.min(Number(input.limit ?? configuredLimit), configuredLimit, 20) };
}
export async function internalQuery(prisma: PrismaService, tenantId: string, agentId: string, resource: string, query: string, take: number) {
  const name = { contains: query, mode: 'insensitive' as const };
  if (resource === 'documents') return prisma.document.findMany({ where: { tenantId, name, status: 'READY', knowledgeBase: { tenantId, status: 'ACTIVE', agents: { some: { agentId, agent: { tenantId } } } } }, select: { id: true, name: true, mimeType: true, processedAt: true, knowledgeBaseId: true }, take, orderBy: { name: 'asc' } });
  if (resource === 'knowledge-bases') return prisma.knowledgeBase.findMany({ where: { tenantId, name, status: 'ACTIVE', agents: { some: { agentId, agent: { tenantId } } } }, select: { id: true, name: true, description: true, status: true }, take, orderBy: { name: 'asc' } });
  if (resource === 'departments') return prisma.department.findMany({ where: { tenantId, name, status: 'ACTIVE' }, select: { id: true, name: true, description: true }, take, orderBy: { name: 'asc' } });
  if (resource === 'agents') return prisma.agent.findMany({ where: { tenantId, name, status: 'ACTIVE' }, select: { id: true, name: true, description: true }, take, orderBy: { name: 'asc' } });
  throw new BadRequestException('Recurso de consulta interna não autorizado.');
}
export function searchResults(data: unknown, limit: number) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new BadGatewayException('A pesquisa deve retornar um objeto JSON com results ou web.results.');
  const payload = data as { results?: unknown; web?: { results?: unknown } };
  const rows = payload.results ?? payload.web?.results;
  if (!Array.isArray(rows)) throw new BadGatewayException('A pesquisa deve retornar results ou web.results como lista.');
  return rows.slice(0, limit).flatMap(row => {
    if (!row || typeof row !== 'object' || typeof row.url !== 'string') return [];
    let url: URL; try { url = new URL(row.url); } catch { return []; }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return [];
    return [{ title: String(row.title || '').slice(0, 300), url: url.toString(), description: String(row.description ?? row.snippet ?? '').slice(0, 2000) }];
  });
}
