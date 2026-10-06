require('reflect-metadata');
const test = require('node:test');
const assert = require('node:assert/strict');
const { validate } = require('class-validator');
const { Prisma } = require('@prisma/client');
const { CatalogService, validateModelPrice } = require('../dist/catalog/catalog.service');
const { CreateModelDto, UpdateModelDto } = require('../dist/catalog/catalog.dto');

const providerId = '00000000-0000-4000-8000-000000000010';
const modelId = '00000000-0000-4000-8000-000000000011';
function fixture(provider = { id: providerId, name: 'OpenAI', slug: 'openai' }) {
  const writes = [];
  const record = { id: modelId, providerId, name: 'Test model', slug: 'test-model', inputPrice: null, outputPrice: null, provider, _count: { agents: 0 } };
  const tx = { aiProvider: { findUnique: async () => provider }, aiModel: {
    findUnique: async () => record,
    create: async (query) => { writes.push(query); return { ...record, ...query.data }; },
    update: async (query) => { writes.push(query); return { ...record, ...Object.fromEntries(Object.entries(query.data).filter(([, value]) => value !== undefined)) }; },
  }, auditLog: { create: async () => ({}) } };
  return { service: new CatalogService({ userRole: { findFirst: async (query) => { assert.equal(query.where.userId, 'platform-admin'); assert.equal(query.where.user.tenantId, 'tenant'); assert.equal(query.where.role.name, 'SUPER_ADMIN'); return { roleId: 'super-role' }; } }, $transaction: (fn) => fn(tx) }), tx, writes };
}

test('model pricing accepts null, zero and six decimal USD rates, rejects invalid precision/range/types', () => {
  for (const value of [null, undefined, 0, 0.000001, 0.15, 9999.999999]) assert.equal(validateModelPrice(value, 'inputPrice'), value);
  for (const value of [-1, NaN, Infinity, 10000, 0.0000001, '0.15', true]) assert.throws(() => validateModelPrice(value, 'inputPrice'), /preço em USD por milhão/);
});

test('model DTO rejects missing provider, invalid slug and invalid rates but permits explicit null clearing', async () => {
  const invalid = Object.assign(new CreateModelDto(), { name: 'Model', slug: 'bad slug', inputPrice: -1 });
  const errors = await validate(invalid);
  assert.ok(errors.some(error => error.property === 'providerId'));
  assert.ok(errors.some(error => error.property === 'slug'));
  assert.ok(errors.some(error => error.property === 'inputPrice'));
  assert.equal((await validate(Object.assign(new UpdateModelDto(), { inputPrice: null, outputPrice: 0 }))).length, 0);
  assert.ok((await validate(Object.assign(new UpdateModelDto(), { providerId: null }))).length);
});

test('model create requires an existing provider before any catalogue mutation', async () => {
  const { service, writes } = fixture(null);
  await assert.rejects(service.createModel('tenant', { providerId, name: 'Model', slug: 'test-model' }, 'platform-admin'), /Provedor não encontrado/);
  assert.equal(writes.length, 0);
});

test('model create requires a configured gateway for providers without direct integration', async () => {
  const envKeys = ['AI_GATEWAY_URL', 'AI_GATEWAY_API_KEY', 'OMNIROUTER_BASE_URL', 'OMNIROUTER_API_KEY'];
  const previous = Object.fromEntries(envKeys.map(key => [key, process.env[key]]));
  envKeys.forEach(key => delete process.env[key]);
  try {
    const { service, writes } = fixture({ id: providerId, name: 'External', slug: 'external' });
    await assert.rejects(service.createModel('tenant', { providerId, name: 'Model', slug: 'test-model' }, 'platform-admin'), /gateway de IA/);
    assert.equal(writes.length, 0);
  } finally { envKeys.forEach(key => { if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key]; }); }
});

test('model create persists supplied prices and returns numeric prices without provider credentials', async () => {
  const { service, writes } = fixture();
  const result = await service.createModel('tenant', { providerId, name: 'Model', slug: 'test-model', inputPrice: 0.15, outputPrice: 0.6 }, 'platform-admin');
  assert.equal(writes[0].data.inputPrice, 0.15); assert.equal(result.outputPrice, 0.6);
  assert.deepEqual(writes[0].include.provider.select, { id: true, name: true, slug: true });
  assert.equal(result.provider.config, undefined);
});

test('model PATCH preserves omitted prices and permits explicit null clearing', async () => {
  const { service, tx, writes } = fixture();
  tx.aiModel.findUnique = async () => ({ id: modelId, providerId });
  const result = await service.updateModel('tenant', modelId, { inputPrice: null }, 'platform-admin');
  assert.equal(writes[0].data.inputPrice, null); assert.equal(writes[0].data.outputPrice, undefined);
  assert.equal(result.inputPrice, null);
});

test('provider responses expose capabilities metadata and omit config or credentials', async () => {
  const previous = process.env.OPENAI_API_KEY; process.env.OPENAI_API_KEY = 'must-never-leak';
  const service = new CatalogService({ aiProvider: { findMany: async () => [{ id: providerId, name: 'OpenAI', slug: 'openai', config: { apiKey: 'also-private', endpoint: 'secret-endpoint', supportsReasoning: true, supportsTemperature: false } }] } });
  try {
    const result = await service.providers();
    assert.equal(result[0].capabilities.supportsReasoning, true); assert.equal(result[0].capabilities.supportsTemperature, false);
    assert.equal(result[0].config, undefined);
    assert.ok(!JSON.stringify(result).includes('must-never-leak')); assert.ok(!JSON.stringify(result).includes('also-private')); assert.ok(!JSON.stringify(result).includes('secret-endpoint'));
  } finally { if (previous === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = previous; }
});

test('provider metadata distinguishes adapter reasoning control from model reasoning and Omni precedence', async () => {
  const envKeys = ['OMNIROUTER_BASE_URL', 'OMNIROUTER_API_KEY', 'AI_GATEWAY_URL', 'AI_GATEWAY_API_KEY'];
  const previous = Object.fromEntries(envKeys.map(key => [key, process.env[key]]));
  const cases = [
    { env: {}, slug: 'openai', supported: true },
    { env: {}, slug: 'external', supported: false },
    { env: { AI_GATEWAY_URL: 'https://fixture.invalid' }, slug: 'external', supported: true },
    { env: { OMNIROUTER_BASE_URL: 'https://fixture.invalid/v1' }, slug: 'openai', supported: false },
    { env: { OMNIROUTER_API_KEY: 'synthetic-fixture' }, slug: 'openai', supported: false },
    { env: { OMNIROUTER_BASE_URL: 'https://fixture.invalid/v1', OMNIROUTER_API_KEY: 'synthetic-fixture', AI_GATEWAY_URL: 'https://legacy.invalid' }, slug: 'external', supported: false },
  ];
  try {
    for (const { env, slug, supported } of cases) {
      envKeys.forEach(key => delete process.env[key]); Object.assign(process.env, env);
      const service = new CatalogService({ aiProvider: { findMany: async () => [{ id: providerId, name: 'Provider', slug, config: { supportsReasoning: true, apiKey: 'provider-private' } }] } });
      const [provider] = await service.providers();
      assert.equal(provider.capabilities.supportsAdvancedReasoningControl, supported);
      assert.equal(provider.capabilities.supportsReasoning, true);
      assert.ok(!JSON.stringify(provider).includes('synthetic-fixture'));
      assert.ok(!JSON.stringify(provider).includes('provider-private'));
    }
  } finally { envKeys.forEach(key => { if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key]; }); }
});

test('model catalogue exposes adapter reasoning control without inferring model reasoning or leaking provider config', async () => {
  const envKeys = ['OMNIROUTER_BASE_URL', 'OMNIROUTER_API_KEY'];
  const previous = Object.fromEntries(envKeys.map(key => [key, process.env[key]]));
  process.env.OMNIROUTER_BASE_URL = 'https://fixture.invalid/v1'; process.env.OMNIROUTER_API_KEY = 'synthetic-fixture';
  const model = { id: modelId, slug: 'claude-fixture', inputPrice: null, outputPrice: null, capabilities: { supportsReasoning: true }, provider: { id: providerId, name: 'Provider', slug: 'anthropic', config: { apiKey: 'provider-private' } } };
  const service = new CatalogService({ aiModel: { findMany: async () => [model] } });
  try {
    const [result] = await service.models();
    assert.equal(result.provider.capabilities.supportsAdvancedReasoningControl, false);
    assert.equal(result.capabilities.supportsReasoning, true);
    assert.equal(result.provider.config, undefined);
    assert.ok(!JSON.stringify(result).includes('synthetic-fixture'));
    assert.ok(!JSON.stringify(result).includes('provider-private'));
  } finally { envKeys.forEach(key => { if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key]; }); }
});

test('duplicate provider model identifiers return a clear conflict', async () => {
  const { service, tx } = fixture();
  tx.aiModel.create = async () => { throw new Prisma.PrismaClientKnownRequestError('duplicate', { code: 'P2002', clientVersion: 'test' }); };
  await assert.rejects(service.createModel('tenant', { providerId, name: 'Model', slug: 'test-model' }, 'platform-admin'), /identificador já está cadastrado/);
});

test('model PATCH rejects an unknown model before mutation', async () => {
  const { service, tx, writes } = fixture(); tx.aiModel.findUnique = async () => null;
  await assert.rejects(service.updateModel('tenant', modelId, { inputPrice: 1 }, 'platform-admin'), /Modelo não encontrado/);
  assert.equal(writes.length, 0);
});

test('tenant administrators cannot change shared models or rates even with models.write', async () => {
  let writes = 0;
  const service = new CatalogService({ userRole: { findFirst: async () => null }, $transaction: async () => { writes++; } });
  await assert.rejects(service.createModel('tenant', { providerId, name: 'Model', slug: 'test-model' }, 'tenant-admin'), /Somente SUPER_ADMIN/);
  await assert.rejects(service.updateModel('tenant', modelId, { inputPrice: 1 }, 'tenant-admin'), /Somente SUPER_ADMIN/);
  assert.equal(writes, 0);
});
