export type McpToolDefinition = {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
};

export type McpServerConfig = {
  id: string;
  name: string;
  endpoint: string;
  transport: 'streamable-http' | 'sse' | 'stdio';
  tenantId: string;
  enabled: boolean;
};
