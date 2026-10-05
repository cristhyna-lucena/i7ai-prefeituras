import { BadGatewayException, BadRequestException, Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { McpToolDefinition } from './mcp.types';
import { ToolsService } from '../tools/tools.service';
import { safeHttpRequest } from '../tools/network-policy';

@Injectable()
export class McpService {
  constructor(private readonly prisma: PrismaService, private readonly tools: ToolsService) {}

  async listAgentTools(agentId: string, tenantId: string) {
    const agent = await this.prisma.agent.findFirst({
      where: { id: agentId, tenantId },
      include: { tools: { include: { tool: true } } },
    });
    if (!agent) throw new NotFoundException('Agent not found in tenant');
    return agent.tools.filter((binding) => binding.enabled && binding.tool.status === 'ACTIVE' && binding.tool.tenantId === tenantId)
      .map((binding) => ({ ...binding, tool: { id: binding.tool.id, name: binding.tool.name, type: binding.tool.type, status: binding.tool.status } }));
  }

  async assertToolAllowed(agentId: string, toolId: string, tenantId: string) {
    return this.tools.authorizedTool(tenantId, agentId, toolId);
  }

  async discover(serverToolId: string, agentId: string, tenantId: string, signal?: AbortSignal): Promise<McpToolDefinition[]> {
    return this.withConnection(serverToolId, agentId, tenantId, async (rpc, config) => this.listRemoteTools(rpc, config), signal);
  }

  async call(serverToolId: string, agentId: string, tenantId: string, name: string, args: Record<string, unknown>, signal?: AbortSignal) {
    return this.withConnection(serverToolId, agentId, tenantId, async (rpc, config) => {
      const discovered = await this.listRemoteTools(rpc, config);
      if (!discovered.some((tool) => tool.name === name)) throw new ForbiddenException('Ferramenta MCP não foi autorizada ou descoberta');
      const result = await rpc('tools/call', { name, arguments: args });
      await this.prisma.auditLog.create({ data: { tenantId, event: 'mcp.call', resource: 'tools', resourceId: serverToolId, metadata: { agentId, name, isError: result.isError === true } } });
      return result;
    }, signal);
  }

  private async listRemoteTools(rpc: (method: string, params?: Record<string, unknown>) => Promise<Record<string, any>>, config: Record<string, any>) {
    const tools: McpToolDefinition[] = []; let cursor: string | undefined;
    for (let page = 0; page < 20; page++) {
      const result = await rpc('tools/list', cursor ? { cursor } : {});
      if (!Array.isArray(result.tools)) throw new BadGatewayException('Servidor MCP retornou catálogo inválido');
      for (const tool of result.tools) {
        if (!tool || typeof tool.name !== 'string' || tool.name.length > 200 || !tool.inputSchema || typeof tool.inputSchema !== 'object') throw new BadGatewayException('Definição MCP inválida');
        if (Array.isArray(config.allowedToolNames) && !config.allowedToolNames.includes(tool.name)) continue;
        tools.push({ name: tool.name, description: typeof tool.description === 'string' ? tool.description : undefined, inputSchema: tool.inputSchema });
        if (tools.length > 1000) throw new BadGatewayException('Catálogo MCP excede limite');
      }
      if (!result.nextCursor) return tools;
      if (typeof result.nextCursor !== 'string' || result.nextCursor === cursor) throw new BadGatewayException('Paginação MCP inválida');
      cursor = result.nextCursor;
    }
    throw new BadGatewayException('Catálogo MCP excede limite de páginas');
  }

  private async withConnection<T>(serverToolId: string, agentId: string, tenantId: string,
    operation: (rpc: (method: string, params?: Record<string, unknown>) => Promise<Record<string, any>>, config: Record<string, any>) => Promise<T>, signal?: AbortSignal): Promise<T> {
    signal?.throwIfAborted();
    const tool = await this.assertToolAllowed(agentId, serverToolId, tenantId);
    if (tool.type !== 'MCP_SERVER') throw new ForbiddenException('Ferramenta não é servidor MCP');
    const config = tool.config as Record<string, any>;
    if (config.transport && config.transport !== 'streamable-http') throw new BadRequestException('Somente streamable-http é suportado nesta versão');
    const endpoint = config.endpoint ?? config.url;
    if (typeof endpoint !== 'string') throw new BadRequestException('Endpoint MCP não configurado');
    const { headers, secrets } = this.tools.resolveHeaders(tool);
    const base = { endpoint, allowedDomains: tool.allowedDomains, timeoutMs: Number(config.timeoutMs ?? 15000), signal };
    let session: string | undefined; let version = '2025-06-18'; let sequence = 0;
    const requestHeaders = () => ({ ...headers, Accept: 'application/json, text/event-stream', ...(session ? { 'Mcp-Session-Id': session } : {}), 'MCP-Protocol-Version': version });
    const rpc = async (method: string, params: Record<string, unknown> = {}) => {
      const id = ++sequence;
      const response = await safeHttpRequest({ ...base, headers: requestHeaders(), method: 'POST', body: { jsonrpc: '2.0', id, method, params }, responseId: id });
      if (response.statusCode >= 400) throw new BadGatewayException(`Servidor MCP retornou HTTP ${response.statusCode}`);
      const message = response.data as Record<string, any>;
      if (!message || message.jsonrpc !== '2.0' || message.id !== id || message.error || !message.result || typeof message.result !== 'object') throw new BadGatewayException('Resposta JSON-RPC MCP inválida ou com erro');
      if (method === 'initialize') {
        const returnedSession = response.headers['mcp-session-id'];
        if (returnedSession !== undefined && (typeof returnedSession !== 'string' || !/^[\x21-\x7e]{1,1024}$/.test(returnedSession))) throw new BadGatewayException('Sessão MCP inválida');
        session = returnedSession as string | undefined;
      }
      return message.result;
    };
    try {
      const initialized = await rpc('initialize', { protocolVersion: version, capabilities: {}, clientInfo: { name: 'i7ai', version: '0.1.0' } });
      if (!['2025-06-18', '2025-03-26'].includes(initialized.protocolVersion)) throw new BadGatewayException('Versão MCP não suportada');
      version = initialized.protocolVersion;
      if (!initialized.capabilities?.tools) throw new BadGatewayException('Servidor MCP não oferece ferramentas');
      const notified = await safeHttpRequest({ ...base, headers: requestHeaders(), method: 'POST', body: { jsonrpc: '2.0', method: 'notifications/initialized' } });
      if (notified.statusCode !== 202 && notified.statusCode !== 204) throw new BadGatewayException('Servidor MCP recusou inicialização');
      const result = await operation(rpc, config);
      return this.tools.sanitizeResult(result, secrets) as T;
    } finally {
      if (session) await safeHttpRequest({ ...base, headers: requestHeaders(), method: 'DELETE', timeoutMs: 2000, signal: undefined }).catch(() => undefined);
    }
  }
}
