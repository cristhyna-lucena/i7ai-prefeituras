import { BadGatewayException, BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import Ajv, { ValidateFunction } from 'ajv';
import { FunctionTool } from 'openai/resources/responses/responses';
import { PrismaService } from '../prisma/prisma.service';
import { ToolsService, redactToolConfig } from '../tools/tools.service';
import { McpService } from '../mcp/mcp.service';
import { querySchema } from '../tools/query-tools';

export type AgentFunction = { definition: FunctionTool; toolId: string; remoteName?: string; validate: ValidateFunction };
export type AgentToolCall = { callId: string; name: string; arguments: string };
export type AgentToolResult = { callId: string; name: string; output: string };

function assertSafeJson(value: unknown, depth = 0): void {
  if (depth > 20) throw new BadRequestException('Os argumentos da ferramenta excedem a profundidade permitida.');
  if (Array.isArray(value)) { for (const item of value) assertSafeJson(item, depth + 1); return; }
  if (value && typeof value === 'object') for (const [key, item] of Object.entries(value)) {
    if (['__proto__', 'prototype', 'constructor'].includes(key)) throw new BadRequestException('Os argumentos da ferramenta contêm uma chave insegura.');
    assertSafeJson(item, depth + 1);
  }
}

@Injectable()
export class AgentToolsService {
  constructor(private readonly prisma: PrismaService, private readonly tools: ToolsService, private readonly mcp: McpService) {}

  async load(tenantId: string, agentId: string, signal?: AbortSignal): Promise<AgentFunction[]> {
    const bindings = await this.prisma.agentTool.findMany({
      where: { agentId, enabled: true, agent: { tenantId, status: 'ACTIVE' }, tool: { tenantId, status: 'ACTIVE' } },
      include: { tool: true }, orderBy: { toolId: 'asc' },
    });
    const definitions: AgentFunction[] = [];
    for (const binding of bindings) {
      signal?.throwIfAborted();
      const tool = binding.tool;
      if (!binding.enabled || tool.tenantId !== tenantId || tool.status !== 'ACTIVE') continue;
      const alias = tool.id.replace(/-/g, '');
      if (['HTTP_REQUEST', 'WEBHOOK', 'REST_API', 'N8N'].includes(tool.type)) {
        definitions.push(this.prepare('http_' + alias, tool.id, tool.name + (tool.description ? ': ' + tool.description : ''), { type: 'object', properties: {}, additionalProperties: true }));
      } else if (tool.type === 'INTERNAL_DATABASE' || tool.type === 'EXTERNAL_SEARCH') {
        definitions.push(this.prepare((tool.type === 'INTERNAL_DATABASE' ? 'internal_' : 'search_') + alias, tool.id, tool.name + (tool.description ? ': ' + tool.description : ''), querySchema()));
      } else if (tool.type === 'MCP_SERVER') {
        const discovered = await this.mcp.discover(tool.id, agentId, tenantId, signal);
        for (const [index, remote] of discovered.entries()) {
          definitions.push(this.prepare('mcp_' + alias + '_' + index, tool.id, tool.name + ' / ' + remote.name + (remote.description ? ': ' + remote.description : ''), remote.inputSchema || { type: 'object', properties: {} }, remote.name));
        }
      }
      if (definitions.length > 64) throw new BadRequestException('O agente excede o limite de 64 funções disponíveis. Reduza as ferramentas vinculadas ou a lista MCP autorizada.');
    }
    return definitions;
  }

  private prepare(name: string, toolId: string, description: string, schema: Record<string, unknown>, remoteName?: string): AgentFunction {
    if (JSON.stringify(schema).length > 32000 || schema.type !== 'object') throw new BadGatewayException('A ferramenta MCP precisa fornecer um JSON Schema de objeto com até 32 mil caracteres.');
    let validate: ValidateFunction;
    try {
      // Local refs are supported; remote refs are never fetched from a tool's schema.
      validate = new Ajv({ allErrors: false, strict: false, validateFormats: false, ownProperties: true, coerceTypes: false, useDefaults: false, removeAdditional: false }).compile(schema);
    } catch { throw new BadGatewayException('A ferramenta possui um JSON Schema inválido ou uma versão não suportada. Use JSON Schema draft-07 com referências locais.'); }
    return { definition: { type: 'function', name, description: description.slice(0, 2000), parameters: schema, strict: false }, toolId, remoteName, validate };
  }

  async execute(tenantId: string, agentId: string, call: AgentToolCall, functions: AgentFunction[], userId?: string, signal?: AbortSignal): Promise<AgentToolResult> {
    signal?.throwIfAborted();
    const selected = functions.find((item) => item.definition.name === call.name);
    if (!selected) throw new ForbiddenException('O modelo solicitou uma ferramenta que não está vinculada e autorizada para este agente.');
    if (typeof call.callId !== 'string' || !call.callId || call.callId.length > 200 || typeof call.arguments !== 'string' || call.arguments.length > 32000) throw new BadRequestException('A chamada da ferramenta possui identificador ou argumentos inválidos.');
    let args: unknown;
    try { args = JSON.parse(call.arguments); } catch { throw new BadRequestException('O modelo retornou argumentos JSON inválidos para a ferramenta.'); }
    if (!args || typeof args !== 'object' || Array.isArray(args)) throw new BadRequestException('Os argumentos da ferramenta devem ser um objeto JSON.');
    assertSafeJson(args);
    if (!selected.validate(args)) throw new BadRequestException('Os argumentos retornados pelo modelo não correspondem ao JSON Schema da ferramenta.');
    // Both executors recheck the tenant, active agent, enabled binding and tool status
    // for every call; cached function descriptions do not grant execution permission.
    const result = selected.remoteName !== undefined
      ? await this.mcp.call(selected.toolId, agentId, tenantId, selected.remoteName, args as Record<string, unknown>, signal)
      : await this.tools.execute(tenantId, agentId, selected.toolId, args as Record<string, unknown>, signal);
    signal?.throwIfAborted();
    const sanitized = redactToolConfig(result);
    const serialized = JSON.stringify(sanitized) ?? 'null';
    const output = serialized.length <= 24000 ? serialized : JSON.stringify({ truncated: true, preview: serialized.slice(0, 23000) });
    await this.prisma.auditLog.create({ data: {
      tenantId, userId, event: 'agent.tool_executed', resource: 'tool', resourceId: selected.toolId,
      metadata: { agentId, name: call.name, ...(selected.remoteName ? { remoteName: selected.remoteName } : {}), output: JSON.parse(output) } as Prisma.InputJsonObject,
    } });
    return { callId: call.callId, name: call.name, output };
  }
}
