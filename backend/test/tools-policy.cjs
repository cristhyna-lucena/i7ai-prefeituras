require('reflect-metadata');
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { assertAllowedUrl, isPublicAddress, normalizeDomains, safeHttpRequest } = require('../dist/tools/network-policy');
const { ToolsService, redactToolConfig } = require('../dist/tools/tools.service');
const { McpService } = require('../dist/mcp/mcp.service');

test('private, reserved and mapped addresses are denied', () => {
  for (const ip of ['127.0.0.1', '10.1.2.3', '169.254.169.254', '172.16.0.1', '192.168.1.1', '100.64.0.1', '198.18.1.1', '203.0.113.1', '::1', '::ffff:127.0.0.1', 'fc00::1', 'fe80::1', '2001:db8::1', '2001::1', '2002:7f00:1::']) assert.equal(isPublicAddress(ip), false, ip);
  for (const ip of ['8.8.8.8', '1.1.1.1', '2606:4700:4700::1111', '2001:4860:4860::8888']) assert.equal(isPublicAddress(ip), true, ip);
});

test('domain authorization rejects suffix confusion, credentials, protocols and alternate private notation', () => {
  assert.equal(assertAllowedUrl('https://api.example.com/path', ['*.example.com']).hostname, 'api.example.com');
  for (const endpoint of ['https://example.com.evil.test', 'https://example.com@evil.test', 'file:///etc/passwd', 'https://user:pass@example.com']) assert.throws(() => assertAllowedUrl(endpoint, ['example.com']));
  const original = process.env.TOOLS_ALLOW_PRIVATE_NETWORK; delete process.env.TOOLS_ALLOW_PRIVATE_NETWORK;
  try { assert.throws(() => assertAllowedUrl('http://2130706433/', ['127.0.0.1'])); } finally { if (original !== undefined) process.env.TOOLS_ALLOW_PRIVATE_NETWORK = original; }
  assert.throws(() => normalizeDomains(['https://example.com/path']));
});

test('production rejects private-network opt-in', () => {
  const env = process.env.NODE_ENV; const opt = process.env.TOOLS_ALLOW_PRIVATE_NETWORK;
  process.env.NODE_ENV = 'production'; process.env.TOOLS_ALLOW_PRIVATE_NETWORK = 'true';
  try { assert.throws(() => assertAllowedUrl('http://127.0.0.1', ['127.0.0.1'])); }
  finally { if (env === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = env; if (opt === undefined) delete process.env.TOOLS_ALLOW_PRIVATE_NETWORK; else process.env.TOOLS_ALLOW_PRIVATE_NETWORK = opt; }
});

test('tool execution requires tenant-scoped enabled binding and active agent/tool', async () => {
  const service = new ToolsService({ agentTool: { findFirst: async (query) => { assert.deepEqual(query.where.agent, { tenantId: 'tenant-a', status: 'ACTIVE' }); assert.deepEqual(query.where.tool, { tenantId: 'tenant-a', status: 'ACTIVE' }); assert.equal(query.where.enabled, true); return null; } } });
  await assert.rejects(service.execute('tenant-a', 'agent', 'foreign-tool'), /não está autorizada/);
});

test('secrets are resolved from environment and omitted from public configuration/results', () => {
  const service = new ToolsService({}); process.env.TOOL_SECRET_I7AI_TEST = 'Bearer test-secret-value';
  try {
    const auth = service.resolveHeaders({ config: {}, credentials: [{ label: 'Authorization', secretRef: 'env:TOOL_SECRET_I7AI_TEST' }] });
    assert.equal(auth.headers.Authorization, 'Bearer test-secret-value');
    assert.deepEqual(service.sanitizeResult({ echo: 'value Bearer test-secret-value', apiKey: 'hidden' }, auth.secrets), { echo: 'value [REDACTED]', apiKey: '[REDACTED]' });
    assert.deepEqual(redactToolConfig({ headers: { 'X-API-Key': 'hidden' }, body: { password: 'hidden' } }), { headers: { 'X-API-Key': '[REDACTED]' }, body: { password: '[REDACTED]' } });
    assert.throws(() => service.resolveHeaders({ config: {}, credentials: [{ label: 'Authorization', secretRef: 'env:DATABASE_URL' }] }), /TOOL_SECRET/);
  } finally { delete process.env.TOOL_SECRET_I7AI_TEST; }
});

test('safe transport rejects redirects and honors cancellation without following destination', async () => {
  const env = process.env.NODE_ENV; const opt = process.env.TOOLS_ALLOW_PRIVATE_NETWORK;
  process.env.NODE_ENV = 'test'; process.env.TOOLS_ALLOW_PRIVATE_NETWORK = 'true';
  const server = http.createServer((req, res) => { if (req.url === '/redirect') { res.writeHead(302, { location: 'https://example.com' }); res.end(); } });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const endpoint = `http://127.0.0.1:${server.address().port}`;
  try {
    await assert.rejects(safeHttpRequest({ endpoint: endpoint + '/redirect', allowedDomains: ['127.0.0.1'] }), /Redirecionamentos/);
    const controller = new AbortController();
    const pending = safeHttpRequest({ endpoint, allowedDomains: ['127.0.0.1'], signal: controller.signal });
    setTimeout(() => controller.abort(), 20);
    await assert.rejects(pending, /cancelada/);
  } finally {
    server.closeAllConnections(); await new Promise((resolve) => server.close(resolve));
    if (env === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = env;
    if (opt === undefined) delete process.env.TOOLS_ALLOW_PRIVATE_NETWORK; else process.env.TOOLS_ALLOW_PRIVATE_NETWORK = opt;
  }
});

test('MCP performs initialization, session headers, SSE discovery and authorized calls', async () => {
  const env = process.env.NODE_ENV; const opt = process.env.TOOLS_ALLOW_PRIVATE_NETWORK;
  process.env.NODE_ENV = 'test'; process.env.TOOLS_ALLOW_PRIVATE_NETWORK = 'true';
  const calls = [];
  const server = http.createServer((req, res) => {
    if (req.method === 'DELETE') { assert.equal(req.headers['mcp-session-id'], 'fixture-session'); res.writeHead(204); res.end(); return; }
    let input = ''; req.on('data', (chunk) => { input += chunk; });
    req.on('end', () => {
      const message = JSON.parse(input); calls.push(message.method);
      if (message.method === 'initialize') {
        res.writeHead(200, { 'content-type': 'application/json', 'mcp-session-id': 'fixture-session' });
        res.end(JSON.stringify({ jsonrpc: '2.0', id: message.id, result: { protocolVersion: '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'fixture', version: '1' } } }));
      } else {
        assert.equal(req.headers['mcp-session-id'], 'fixture-session'); assert.equal(req.headers['mcp-protocol-version'], '2025-06-18');
        if (message.method === 'notifications/initialized') { res.writeHead(202); res.end(); }
        else if (message.method === 'tools/list') {
          res.writeHead(200, { 'content-type': 'text/event-stream' });
          res.write('event: message\ndata: ' + JSON.stringify({ jsonrpc: '2.0', id: message.id, result: { tools: [{ name: 'search', inputSchema: { type: 'object' } }, { name: 'danger', inputSchema: { type: 'object' } }] } }) + '\n\n');
        } else if (message.method === 'tools/call') {
          assert.equal(message.params.name, 'search'); res.writeHead(200, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ jsonrpc: '2.0', id: message.id, result: { content: [{ type: 'text', text: 'found' }] } }));
        } else { res.writeHead(400); res.end(); }
      }
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const tool = { id: 'mcp', type: 'MCP_SERVER', status: 'ACTIVE', allowedDomains: ['127.0.0.1'], config: { endpoint: `http://127.0.0.1:${server.address().port}/mcp`, transport: 'streamable-http', allowedToolNames: ['search'] }, credentials: [] };
  const prisma = { agentTool: { findFirst: async () => ({ tool, rateLimitPerMinute: 60 }) }, auditLog: { create: async () => ({}) } };
  const service = new McpService(prisma, new ToolsService(prisma));
  try {
    assert.deepEqual(await service.discover('mcp', 'agent', 'tenant'), [{ name: 'search', description: undefined, inputSchema: { type: 'object' } }]);
    assert.deepEqual(await service.call('mcp', 'agent', 'tenant', 'search', { query: 'document' }), { content: [{ type: 'text', text: 'found' }] });
    await assert.rejects(service.call('mcp', 'agent', 'tenant', 'danger', {}), /não foi autorizada/);
    assert.deepEqual(calls.slice(0, 3), ['initialize', 'notifications/initialized', 'tools/list']);
  } finally {
    server.closeAllConnections(); await new Promise((resolve) => server.close(resolve));
    if (env === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = env;
    if (opt === undefined) delete process.env.TOOLS_ALLOW_PRIVATE_NETWORK; else process.env.TOOLS_ALLOW_PRIVATE_NETWORK = opt;
  }
});
