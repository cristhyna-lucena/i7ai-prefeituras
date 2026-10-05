import { BadGatewayException, BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, ToolType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateToolDto, CredentialDto, UpdateToolDto } from './tools.dto';
import { assertAllowedUrl, normalizeDomains, safeHttpRequest } from './network-policy';
import { internalQuery, internalResources, queryInput, searchResults } from './query-tools';

const networkTypes: ToolType[] = ['HTTP_REQUEST', 'WEBHOOK', 'REST_API', 'N8N', 'MCP_SERVER', 'EXTERNAL_SEARCH'];
const restrictedHeaders = /^(host|content-length|connection|transfer-encoding|upgrade|proxy-.*|x-forwarded-.*|origin|cookie|set-cookie|authorization)$/i;
const secretKey = /password|secret|authorization|cookie|api[_-]?key|token/i;

export function redactToolConfig(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactToolConfig);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, secretKey.test(key) ? '[REDACTED]' : redactToolConfig(item)]));
  return value;
}
function rejectInlineSecrets(value: unknown) {
  if (Array.isArray(value)) return value.forEach(rejectInlineSecrets);
  if (value && typeof value === 'object') for (const [key, item] of Object.entries(value)) {
    if (secretKey.test(key)) throw new BadRequestException('Credenciais devem ser referências de ambiente, nunca segredos na configuração');
    rejectInlineSecrets(item);
  }
}
function validateCredentials(credentials: CredentialDto[] = []) {
  const labels = new Set<string>();
  for (const credential of credentials) {
    if (!/^[a-zA-Z][a-zA-Z0-9-]{0,127}$/.test(credential.label) || (restrictedHeaders.test(credential.label) && credential.label.toLowerCase() !== 'authorization')) throw new BadRequestException('Nome de cabeçalho da credencial inválido');
    if (!/^(env:)?TOOL_SECRET_[A-Z0-9_]{1,100}$/.test(credential.secretRef)) throw new BadRequestException('secretRef deve referenciar uma variável TOOL_SECRET_<NOME>');
    if (labels.has(credential.label.toLowerCase())) throw new BadRequestException('Cabeçalho de credencial duplicado');
    labels.add(credential.label.toLowerCase());
  }
}
function validatedConfig(type: ToolType, config: Record<string, unknown>, domains: string[]) {
  if (JSON.stringify(config).length > 100000) throw new BadRequestException('Configuração excede o tamanho máximo');
  rejectInlineSecrets(config);
  if (type === 'INTERNAL_DATABASE') {
    if (Object.keys(config).some(key => !['resource', 'maxResults'].includes(key)) || !internalResources.includes(config.resource as typeof internalResources[number])) throw new BadRequestException('Informe resource: documents, knowledge-bases, departments ou agents. SQL e conexões externas não são aceitos.');
  }
  if (['INTERNAL_DATABASE', 'EXTERNAL_SEARCH'].includes(type) && config.maxResults !== undefined && (!Number.isInteger(config.maxResults) || Number(config.maxResults) < 1 || Number(config.maxResults) > 20)) throw new BadRequestException('maxResults deve estar entre 1 e 20.');
  if (networkTypes.includes(type)) {
    const allowedKeys = type === 'EXTERNAL_SEARCH' ? ['endpoint', 'headers', 'timeoutMs', 'queryParam', 'maxResults'] : ['endpoint', 'url', 'method', 'headers', 'body', 'timeoutMs', 'transport', 'allowedToolNames'];
    if (Object.keys(config).some((key) => !allowedKeys.includes(key))) throw new BadRequestException('Campo desconhecido na configuração de rede');
    const endpoint = config.endpoint ?? config.url;
    if (typeof endpoint !== 'string') throw new BadRequestException('Informe config.endpoint');
    const target = assertAllowedUrl(endpoint, domains);
    if (type === 'EXTERNAL_SEARCH' && config.queryParam !== undefined && (typeof config.queryParam !== 'string' || !/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/.test(config.queryParam) || secretKey.test(config.queryParam) || /^(key|auth)$/i.test(config.queryParam))) throw new BadRequestException('Nome do parâmetro de pesquisa inválido.');
    for (const key of target.searchParams.keys()) if (secretKey.test(key) || /^(key|auth)$/i.test(key)) throw new BadRequestException('Credenciais na URL não são autorizadas; use secretRef');
    if (config.method !== undefined && !['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD'].includes(String(config.method))) throw new BadRequestException('Método HTTP inválido');
    if (config.timeoutMs !== undefined && (!Number.isInteger(config.timeoutMs) || Number(config.timeoutMs) < 100 || Number(config.timeoutMs) > 30000)) throw new BadRequestException('timeoutMs deve estar entre 100 e 30000');
    if (type === 'MCP_SERVER' && config.transport !== undefined && config.transport !== 'streamable-http') throw new BadRequestException('MCP suporta transporte streamable-http nesta versão');
    if (config.allowedToolNames !== undefined && (!Array.isArray(config.allowedToolNames) || config.allowedToolNames.some((name) => typeof name !== 'string' || name.length > 200))) throw new BadRequestException('Lista de ferramentas MCP inválida');
    if (config.headers !== undefined) {
      if (!config.headers || typeof config.headers !== 'object' || Array.isArray(config.headers)) throw new BadRequestException('Cabeçalhos inválidos');
      for (const [key, value] of Object.entries(config.headers)) {
        if (!/^[a-zA-Z][a-zA-Z0-9-]{0,127}$/.test(key) || restrictedHeaders.test(key) || typeof value !== 'string' || /[\r\n]/.test(value)) throw new BadRequestException('Cabeçalhos inválidos ou reservados');
      }
    }
  }
  return config as Prisma.InputJsonObject;
}
function redactSecrets(value: unknown, secrets: string[]): unknown {
  if (typeof value === 'string') return secrets.reduce((text, secret) => secret ? text.split(secret).join('[REDACTED]') : text, value);
  if (Array.isArray(value)) return value.map((item) => redactSecrets(item, secrets));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, redactSecrets(item, secrets)]));
  return value;
}

@Injectable()
export class ToolsService {
  constructor(private readonly prisma: PrismaService) {}
  private readonly rates = new Map<string, { minute: number; calls: number }>();

  async list(tenantId: string) {
    const tools = await this.prisma.tool.findMany({
      where: { tenantId },
      include: { credentials: { select: { label: true } }, agents: { include: { agent: { select: { id: true, name: true, status: true } } } } },
      orderBy: { name: 'asc' },
    });
    return tools.map((tool) => ({ ...tool, config: redactToolConfig(tool.config) }));
  }

  async create(tenantId: string, input: CreateToolDto, actorId?: string) {
    const allowedDomains = networkTypes.includes(input.type) ? normalizeDomains(input.allowedDomains) : [];
    const config = validatedConfig(input.type, input.config, allowedDomains);
    validateCredentials(input.credentials);
    return this.prisma.$transaction(async (tx) => {
      const tool = await tx.tool.create({ data: { tenantId, name: input.name.trim(), description: input.description, type: input.type, status: input.status ?? 'ACTIVE', allowedDomains, config,
        credentials: { create: input.credentials ?? [] } }, include: { credentials: { select: { label: true } } } });
      await tx.auditLog.create({ data: { tenantId, userId: actorId, event: 'tool.created', resource: 'tools', resourceId: tool.id, metadata: { type: tool.type, status: tool.status } } });
      return { ...tool, config: redactToolConfig(tool.config) };
    });
  }

  async update(tenantId: string, id: string, input: UpdateToolDto, actorId?: string) {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.tool.findFirst({ where: { id, tenantId } });
      if (!existing) throw new NotFoundException('Ferramenta não encontrada');
      const type = input.type ?? existing.type;
      const allowedDomains = networkTypes.includes(type) ? normalizeDomains(input.allowedDomains ?? existing.allowedDomains) : [];
      const config = validatedConfig(type, input.config ?? existing.config as Record<string, unknown>, allowedDomains);
      if (input.credentials !== undefined) {
        validateCredentials(input.credentials);
        await tx.toolCredential.deleteMany({ where: { toolId: id } });
        if (input.credentials.length) await tx.toolCredential.createMany({ data: input.credentials.map((credential) => ({ ...credential, toolId: id })) });
      }
      const tool = await tx.tool.update({ where: { id }, data: { name: input.name?.trim(), description: input.description, type, status: input.status, allowedDomains, config }, include: { credentials: { select: { label: true } } } });
      await tx.auditLog.create({ data: { tenantId, userId: actorId, event: 'tool.updated', resource: 'tools', resourceId: tool.id, metadata: { type: tool.type, status: tool.status } } });
      return { ...tool, config: redactToolConfig(tool.config) };
    });
  }

  async authorizedTool(tenantId: string, agentId: string, toolId: string) {
    const binding = await this.prisma.agentTool.findFirst({ where: { agentId, toolId, enabled: true, agent: { tenantId, status: 'ACTIVE' }, tool: { tenantId, status: 'ACTIVE' } }, include: { tool: { include: { credentials: true } } } });
    if (!binding) throw new ForbiddenException('Ferramenta não está autorizada para este agente ativo');
    const minute = Math.floor(Date.now() / 60000); const key = `${tenantId}:${agentId}:${toolId}`;
    const rate = this.rates.get(key); const calls = rate?.minute === minute ? rate.calls : 0;
    if (calls >= (binding.rateLimitPerMinute ?? 60)) throw new ForbiddenException('Limite de chamadas da ferramenta excedido');
    if (this.rates.size > 10000) for (const [id, entry] of this.rates) if (entry.minute < minute) this.rates.delete(id);
    this.rates.set(key, { minute, calls: calls + 1 });
    return binding.tool;
  }

  resolveHeaders(tool: { config: Prisma.JsonValue; credentials: { label: string; secretRef: string }[] }) {
    const config = tool.config as Record<string, unknown>;
    const headers = { ...config.headers as Record<string, string> | undefined };
    const secrets: string[] = [];
    for (const [key, value] of Object.entries(headers)) {
      if (restrictedHeaders.test(key) || secretKey.test(key) || typeof value !== 'string' || /[\r\n]/.test(value)) throw new BadRequestException('Cabeçalhos inseguros na configuração; use secretRef');
    }
    validateCredentials(tool.credentials);
    for (const credential of tool.credentials) {
      const secret = process.env[credential.secretRef.replace(/^env:/, '')];
      if (!secret || /[\r\n]/.test(secret)) throw new BadRequestException('Credencial da ferramenta não está configurada no servidor');
      headers[credential.label] = secret; secrets.push(secret);
    }
    return { headers, secrets };
  }

  sanitizeResult(data: unknown, secrets: string[]) { return redactToolConfig(redactSecrets(data, secrets)); }

  async execute(tenantId: string, agentId: string, toolId: string, input: Record<string, unknown> = {}, signal?: AbortSignal) {
    signal?.throwIfAborted();
    const tool = await this.authorizedTool(tenantId, agentId, toolId);
    if (tool.type === 'INTERNAL_DATABASE' || tool.type === 'EXTERNAL_SEARCH') {
      const config = validatedConfig(tool.type, tool.config as Record<string, unknown>, tool.allowedDomains);
      const { query, limit } = queryInput(input, Number(config.maxResults ?? 10));
      let data: unknown;
      if (tool.type === 'INTERNAL_DATABASE') {
        data = await internalQuery(this.prisma, tenantId, agentId, String(config.resource), query, limit);
      } else {
        const { headers, secrets } = this.resolveHeaders(tool);
        const target = new URL(String(config.endpoint)); target.searchParams.set(String(config.queryParam ?? 'q'), query);
        const result = await safeHttpRequest({ endpoint: target.toString(), allowedDomains: tool.allowedDomains, method: 'GET', headers, timeoutMs: Number(config.timeoutMs ?? 15000), signal });
        if (result.statusCode >= 400) throw new BadGatewayException('A pesquisa externa retornou HTTP ' + result.statusCode);
        data = this.sanitizeResult(searchResults(result.data, limit), secrets);
      }
      signal?.throwIfAborted();
      await this.prisma.auditLog.create({ data: { tenantId, event: 'tools.execute', resource: 'tools', resourceId: toolId, metadata: { agentId, type: tool.type, resultCount: Array.isArray(data) ? data.length : 0 } } });
      return { statusCode: 200, data };
    }
    if (!['HTTP_REQUEST', 'WEBHOOK', 'REST_API', 'N8N'].includes(tool.type)) throw new BadRequestException('Use o transporte MCP para servidores MCP; este tipo não possui executor HTTP');
    const config = validatedConfig(tool.type, tool.config as Record<string, unknown>, tool.allowedDomains);
    const { headers, secrets } = this.resolveHeaders(tool);
    const method = String(config.method ?? (tool.type === 'REST_API' ? 'GET' : 'POST'));
    const endpoint = String(config.endpoint ?? config.url);
    const result = await safeHttpRequest({ endpoint, allowedDomains: tool.allowedDomains, method, headers,
      body: ['GET', 'HEAD'].includes(method) ? undefined : Object.keys(input).length ? input : config.body,
      timeoutMs: Number(config.timeoutMs ?? 15000), signal });
    await this.prisma.auditLog.create({ data: { tenantId, event: 'tools.execute', resource: 'tools', resourceId: toolId, metadata: { agentId, statusCode: result.statusCode } } });
    if (result.statusCode >= 400) throw new BadGatewayException(`Ferramenta retornou HTTP ${result.statusCode}`);
    return { statusCode: result.statusCode, data: this.sanitizeResult(result.data, secrets) };
  }
}
