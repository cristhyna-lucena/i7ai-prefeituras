const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');

// Exercise the source without starting Nest, Redis, PostgreSQL or any AI provider.
require.extensions['.ts'] = (module, filename) => {
  const source = fs.readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021, experimentalDecorators: true, emitDecoratorMetadata: true } });
  module._compile(output.outputText, filename);
};
for (const [path, name] of [['../src/ai/ai-gateway.service.ts', 'AiGatewayService'], ['../src/tools/tools.service.ts', 'ToolsService']]) {
  const filename = require.resolve(path);
  require.cache[filename] = { id: filename, filename, loaded: true, exports: { [name]: class {} } };
}
const { AutomationsService } = require('../src/automations/automations.service.ts');
const { normalizeSteps, validateSchedule, scheduledExecutionId, withTimeout } = require('../src/automations/automation-validation.ts');

const tenant = '00000000-0000-4000-a000-000000000001';
const agentId = '00000000-0000-4000-a000-000000000002';
const automationId = '00000000-0000-4000-a000-000000000003';
const executionId = '00000000-0000-4000-a000-000000000004';
const toolId = '00000000-0000-4000-a000-000000000005';
const scheduleId = '00000000-0000-4000-a000-000000000006';
const automation = (steps = []) => ({ id: automationId, tenantId: tenant, agentId, name: 'Resumo', status: 'ACTIVE', retries: 1, timeoutSeconds: 3, steps, schedules: [], agent: { id: agentId, name: 'Agente', status: 'ACTIVE' } });

function harness(record, gateway = { executeAgent: async () => ({ answer: 'Pronto' }) }, tools = { execute: async () => ({ statusCode: 200, data: {} }) }) {
  const updates = [], queries = [], audits = [];
  const state = { id: executionId, tenantId: tenant, automationId, agentId, status: 'PENDING', input: { assunto: 'Licitações' }, output: null };
  const prisma = {
    $queryRaw: async () => [],
    $transaction: async (operation) => typeof operation === 'function' ? operation(prisma) : Promise.all(operation),
    license: { findFirst: async () => ({ status: 'ACTIVE', startDate: new Date(Date.now() - 1000), endDate: null, maxAutomations: 10 }) },
    automation: { findFirst: async (query) => { queries.push(query); return query.where.tenantId === tenant ? record : null; }, count: async () => 0, create: async ({ data }) => ({ ...record, ...data }) },
    agent: { findFirst: async (query) => query.where.tenantId === tenant && query.where.id === agentId ? { id: agentId, status: 'ACTIVE' } : null },
    automationExecution: {
      upsert: async () => ({ ...state }),
      create: async ({ data }) => ({ ...state, ...data }),
      update: async ({ data }) => { updates.push(data); Object.assign(state, data); return { ...state }; },
      findFirst: async ({ where }) => where.tenantId === tenant ? { ...state } : null,
    },
    auditLog: { create: async ({ data }) => { audits.push(data); return data; } },
  };
  const service = new AutomationsService(prisma, gateway, tools);
  return { service, prisma, state, updates, queries, audits };
}

test('step validation rejects unsupported actions and invalid HTTP configuration', () => {
  assert.throws(() => normalizeSteps([{ name: 'Shell', actionType: 'SHELL', configuration: {} }]), /não suportado/);
  assert.throws(() => normalizeSteps([{ name: 'HTTP', actionType: 'HTTP_TOOL', configuration: { toolId: 'foreign', input: [] } }]), /válida/);
  assert.throws(() => normalizeSteps([{ name: 'AI', actionType: 'AGENT', configuration: { prompt: ' ' } }]), /instruções/);
  const result = normalizeSteps([{ name: ' Segundo ', actionType: 'AGENT', configuration: { prompt: ' Resuma ', unexpected: true } }]);
  assert.equal(result[0].order, 0); assert.equal(result[0].name, 'Segundo');
  assert.deepEqual(result[0].configuration, { prompt: 'Resuma' });
});

test('cron dates respect Cuiabá timezone and reject invalid ranges/timezones/seconds', () => {
  const next = validateSchedule('0 8 * * 1-5', 'America/Cuiaba', new Date('2026-10-02T13:00:00Z'));
  assert.equal(next.toISOString(), '2026-10-05T12:00:00.000Z');
  assert.throws(() => validateSchedule('60 8 * * *', 'America/Cuiaba'), /cron/);
  assert.throws(() => validateSchedule('0 8 * * *', 'Invalid/Timezone'), /fuso/);
  assert.throws(() => validateSchedule('* * * * * *', 'America/Cuiaba'), /cinco campos/);
});

test('scheduled retries use the same deterministic UUID, different runs get different IDs', () => {
  const id = scheduledExecutionId(scheduleId, 'repeat:123');
  assert.match(id, /^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-a[\da-f]{3}-[\da-f]{12}$/);
  assert.equal(id, scheduledExecutionId(scheduleId, 'repeat:123'));
  assert.notEqual(id, scheduledExecutionId(scheduleId, 'repeat:124'));
});

test('tenant-scoped lookup refuses another tenant before queue insertion', async () => {
  const h = harness(automation()); let inserted = false;
  h.service.queue = { add: async () => { inserted = true; } };
  await assert.rejects(h.service.run('00000000-0000-4000-a000-000000000099', automationId), /não encontrada/);
  assert.equal(inserted, false);
  assert.equal(h.queries[0].where.tenantId, '00000000-0000-4000-a000-000000000099');
  await assert.rejects(h.service.getExecution('00000000-0000-4000-a000-000000000099', executionId), /não encontrada/);
});

test('foreign agent is rejected during automation creation', async () => {
  const h = harness(automation());
  await assert.rejects(h.service.create(tenant, { name: 'Ata', agentId: '00000000-0000-4000-a000-000000000099' }), /Agente não encontrado/);
});

test('queue failures persist FAILED instead of leaving execution pending', async () => {
  const h = harness(automation([{ id: 's1', order: 0, name: 'AI', actionType: 'AGENT', configuration: { prompt: 'Resuma' } }]));
  h.service.queue = { add: async () => { throw new Error('Redis unavailable'); } };
  await assert.rejects(h.service.run(tenant, automationId), /fila de automações está indisponível/);
  assert.equal(h.state.status, 'FAILED'); assert.ok(h.state.finishedAt);
});

test('manual runs enqueue immutable step plan with bounded retries and backoff', async () => {
  const record = automation([{ id: 's1', order: 0, name: 'AI', actionType: 'AGENT', configuration: { prompt: 'Resuma' } }]);
  const h = harness(record); let queued;
  h.service.queue = { add: async (name, data, opts) => { queued = { name, data, opts }; } };
  const result = await h.service.run(tenant, automationId, { texto: 'Ata' });
  assert.equal(result.status, 'PENDING'); assert.equal(queued.data.tenantId, tenant);
  assert.deepEqual(queued.data.plan.steps, record.steps); assert.equal(queued.opts.attempts, 2);
  assert.deepEqual(queued.opts.backoff, { type: 'exponential', delay: 2000 });
});

test('scheduler upsert uses cron pattern and timezone; paused automation removes scheduler', async () => {
  const h = harness(automation()); let upsert, removed;
  h.prisma.schedule = { update: async ({ data }) => data };
  h.service.queue = {
    upsertJobScheduler: async (...args) => { upsert = args; return { timestamp: 1000, delay: 500 }; },
    removeJobScheduler: async (key) => { removed = key; },
  };
  const schedule = { id: scheduleId, automationId, name: 'Diária', cronExpression: '0 8 * * *', timezone: 'America/Cuiaba', enabled: true };
  await h.service.syncSchedule(schedule, automation());
  assert.deepEqual(upsert[1], { pattern: '0 8 * * *', tz: 'America/Cuiaba' });
  assert.equal(upsert[2].data.scheduleId, scheduleId);
  await h.service.syncSchedule(schedule, { ...automation(), status: 'PAUSED' });
  assert.equal(removed, `schedule-${scheduleId}`);
});

test('worker completes ordered steps and persists output, timing and audit', async () => {
  const calls = [];
  const steps = [{ id: 's1', order: 0, name: 'Consultar', actionType: 'HTTP_TOOL', configuration: { toolId, input: { consulta: 'ata' } } }, { id: 's2', order: 1, name: 'Resumir', actionType: 'AGENT', configuration: { prompt: 'Resuma o resultado' } }];
  const h = harness(automation(steps), { executeAgent: async (id, scope, input) => { calls.push('ai'); assert.equal(scope, tenant); assert.match(input.message, /dados da ata/); assert.equal(input.automationId, automationId); return { answer: 'Resumo pronto' }; } }, { execute: async (scope, id, tool, input, signal) => { calls.push('http'); assert.equal(scope, tenant); assert.equal(tool, toolId); assert.equal(input.idempotencyKey, `${executionId}-s1`); assert.equal(signal.aborted, false); return { statusCode: 200, data: 'dados da ata' }; } });
  const result = await h.service.process({ id: 'manual', data: { tenantId: tenant, automationId, executionId }, opts: { attempts: 2 }, attemptsMade: 0, updateData: async () => {} });
  assert.deepEqual(calls, ['http', 'ai']); assert.equal(h.state.status, 'SUCCESS');
  assert.equal(result.result.answer, 'Resumo pronto'); assert.equal(result.steps.length, 2);
  assert.ok(h.state.startedAt); assert.ok(h.state.finishedAt); assert.ok(h.state.durationMs >= 0);
  assert.ok(h.audits.some((entry) => entry.event === 'automation.succeeded'));
});

test('retry preserves a completed HTTP step and only repeats the failed AI step', async () => {
  let toolCalls = 0, aiCalls = 0;
  const steps = [{ id: 's1', order: 0, name: 'HTTP', actionType: 'HTTP_TOOL', configuration: { toolId, input: {} } }, { id: 's2', order: 1, name: 'AI', actionType: 'AGENT', configuration: { prompt: 'Resuma' } }];
  const h = harness(automation(steps), { executeAgent: async () => { aiCalls++; if (aiCalls === 1) throw new Error('Provider unavailable'); return { answer: 'Recuperado' }; } }, { execute: async () => { toolCalls++; return { statusCode: 200, data: 'ok' }; } });
  const data = { tenantId: tenant, automationId, executionId, plan: { agentId, timeoutSeconds: 3, steps } };
  await assert.rejects(h.service.process({ id: 'manual', data, opts: { attempts: 2 }, attemptsMade: 0 }), /Provider unavailable/);
  assert.equal(h.state.status, 'PENDING'); assert.equal(h.state.output.steps.length, 1);
  await h.service.process({ id: 'manual', data, opts: { attempts: 2 }, attemptsMade: 1 });
  assert.equal(h.state.status, 'SUCCESS'); assert.equal(toolCalls, 1); assert.equal(aiCalls, 2);
});

test('last failed attempt persists FAILED with error and completed partial steps', async () => {
  const h = harness(automation([{ id: 's1', order: 0, name: 'AI', actionType: 'AGENT', configuration: { prompt: 'Resuma' } }]), { executeAgent: async () => { throw new Error('Falha do modelo'); } });
  await assert.rejects(h.service.process({ id: 'manual', data: { tenantId: tenant, automationId, executionId }, opts: { attempts: 1 }, attemptsMade: 0, updateData: async () => {} }), /Falha do modelo/);
  assert.equal(h.state.status, 'FAILED'); assert.equal(h.state.error, 'Falha do modelo'); assert.ok(h.state.finishedAt);
});

test('timeout aborts in-flight work and rejects with a useful failure', async () => {
  let signal;
  await assert.rejects(withTimeout(15, (value) => { signal = value; return new Promise(() => {}); }), /Tempo limite/);
  assert.equal(signal.aborted, true);
});

test('license capacity prevents creating another automation at the quota', async () => {
  const h = harness(automation());
  h.prisma.automation.count = async () => 10;
  await assert.rejects(h.service.create(tenant, { name: 'Nova', agentId, status: 'DRAFT' }), /Limite/);
});

test('expired license fails the execution without invoking AI or retrying paid work', async () => {
  let aiCalls = 0;
  const h = harness(automation([{ id: 's1', order: 0, name: 'AI', actionType: 'AGENT', configuration: { prompt: 'Resuma' } }]), { executeAgent: async () => { aiCalls++; return { answer: 'Não deve executar' }; } });
  h.prisma.license.findFirst = async () => ({ status: 'ACTIVE', startDate: new Date(Date.now() - 10000), endDate: new Date(Date.now() - 1000) });
  await assert.rejects(h.service.process({ id: 'manual', data: { tenantId: tenant, automationId, executionId }, opts: { attempts: 5 }, attemptsMade: 0, updateData: async () => {} }), /Licença/);
  assert.equal(aiCalls, 0); assert.equal(h.state.status, 'FAILED');
});

test('pausing a running automation prevents subsequent steps and ends in FAILED', async () => {
  let aiCalls = 0;
  const record = automation([{ id: 's1', order: 0, name: 'AI 1', actionType: 'AGENT', configuration: { prompt: 'Primeira' } }, { id: 's2', order: 1, name: 'AI 2', actionType: 'AGENT', configuration: { prompt: 'Segunda' } }]);
  const h = harness(record, { executeAgent: async () => { aiCalls++; record.status = 'PAUSED'; return { answer: 'Primeira concluída' }; } });
  await assert.rejects(h.service.process({ id: 'manual', data: { tenantId: tenant, automationId, executionId }, opts: { attempts: 5 }, attemptsMade: 0, updateData: async () => {} }), /pausada/);
  assert.equal(aiCalls, 1); assert.equal(h.state.status, 'FAILED'); assert.equal(h.state.output.steps.length, 1);
});
