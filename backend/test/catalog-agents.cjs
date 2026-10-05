require('reflect-metadata');
const test = require('node:test');
const assert = require('node:assert/strict');
const { AgentsService } = require('../dist/agents/agents.service');
const { CatalogService } = require('../dist/catalog/catalog.service');
const { assertLicenseCapacity, assertActiveLicense, requireActiveLicense, assertStorageCapacity } = require('../dist/catalog/license-policy');

test('agent PATCH denies foreign knowledge bases before deleting bindings', async () => {
  let writes = 0;
  const tx = { agent: { findFirst: async () => ({ id: 'agent' }) }, knowledgeBase: { count: async (query) => { assert.equal(query.where.tenantId, 'tenant-a'); return 0; } }, agentKnowledgeBase: { deleteMany: async () => { writes++; } } };
  const service = new AgentsService({ $transaction: (fn) => fn(tx) });
  await assert.rejects(service.update('tenant-a', 'agent', { knowledgeBaseIds: ['foreign-base'] }), /bases não pertencem/);
  assert.equal(writes, 0);
});

test('agent PATCH denies foreign tools before deleting bindings', async () => {
  let writes = 0;
  const tx = { agent: { findFirst: async () => ({ id: 'agent' }) }, tool: { count: async (query) => { assert.equal(query.where.tenantId, 'tenant-a'); return 0; } }, agentTool: { deleteMany: async () => { writes++; } } };
  const service = new AgentsService({ $transaction: (fn) => fn(tx) });
  await assert.rejects(service.update('tenant-a', 'agent', { toolIds: ['foreign-tool'] }), /ferramentas não pertencem/);
  assert.equal(writes, 0);
});

test('agent PATCH scopes the agent lookup to its tenant', async () => {
  const tx = { agent: { findFirst: async (query) => { assert.deepEqual(query.where, { id: 'foreign-agent', tenantId: 'tenant-a' }); return null; } } };
  const service = new AgentsService({ $transaction: (fn) => fn(tx) });
  await assert.rejects(service.update('tenant-a', 'foreign-agent', { name: 'Changed' }), /Agente não encontrado/);
});

test('agent create denies a foreign department without creating an agent', async () => {
  let writes = 0;
  const tx = { department: { findFirst: async (query) => { assert.equal(query.where.tenantId, 'tenant-a'); return null; } }, agent: { create: async () => { writes++; } } };
  const service = new AgentsService({ $transaction: (fn) => fn(tx) });
  await assert.rejects(service.create('tenant-a', { name: 'Agent', systemPrompt: 'Help', departmentId: 'foreign-department' }), /Departamento não pertence/);
  assert.equal(writes, 0);
});

test('user PATCH denies assigning SUPER_ADMIN as an ordinary admin before mutation', async () => {
  let writes = 0;
  const tx = { user: { findFirst: async () => ({ id: 'user' }) }, role: { findMany: async () => [{ id: 'super-role', name: 'SUPER_ADMIN' }] }, userRole: { findFirst: async () => null, deleteMany: async () => { writes++; } } };
  const service = new CatalogService({ $transaction: (fn) => fn(tx) });
  await assert.rejects(service.updateUser('tenant-a', 'user', { roleIds: ['super-role'] }, 'ordinary-admin'), /Somente um SUPER_ADMIN/);
  assert.equal(writes, 0);
});

test('license limits cannot be increased by a tenant admin', async () => {
  const service = new CatalogService({ userRole: { findFirst: async () => null } });
  await assert.rejects(service.updateLicense('tenant-a', { maxUsers: 100000 }, 'ordinary-admin'), /Somente SUPER_ADMIN/);
});

test('user listing selects no password hash', async () => {
  const service = new CatalogService({ user: { findMany: async (query) => { assert.equal(query.where.tenantId, 'tenant-a'); assert.equal(query.select.passwordHash, undefined); return []; } } });
  assert.deepEqual(await service.users('tenant-a'), []);
});

function licenseTransaction(overrides = {}) {
  const events = [];
  const tx = { $queryRaw: async (query) => { assert.match(query.sql, /FOR UPDATE/); events.push('lock'); },
    license: { findFirst: async () => { events.push('license'); return { status: 'ACTIVE', startDate: new Date('2020-01-01'), endDate: null, maxUsers: 2, maxAgents: 2, ...overrides }; } },
    user: { count: async (query) => { assert.deepEqual(query.where.status, { not: 'SUSPENDED' }); events.push('count'); return 2; } },
    agent: { count: async (query) => { assert.deepEqual(query.where.status, { not: 'ARCHIVED' }); events.push('count'); return 2; } },
    auditLog: { create: async () => ({}) } };
  return { tx, events };
}

test('license caps serialize tenant allocation before counting users and agents', async () => {
  for (const resource of ['users', 'agents']) {
    const { tx, events } = licenseTransaction();
    await assert.rejects(assertLicenseCapacity(tx, 'tenant-a', resource), /Limite de .* da licença atingido/);
    assert.deepEqual(events, ['lock', 'license', 'count']);
  }
});

test('expired, suspended and future licenses deny new allocations', async () => {
  for (const override of [{ endDate: new Date('2000-01-01') }, { status: 'SUSPENDED' }, { startDate: new Date('2100-01-01') }]) {
    const { tx, events } = licenseTransaction(override);
    await assert.rejects(assertLicenseCapacity(tx, 'tenant-a', 'agents'), /Licença da prefeitura/);
    assert.deepEqual(events, ['lock', 'license']);
  }
});

test('production rejects new allocations without a license', async () => {
  const previous = process.env.NODE_ENV; process.env.NODE_ENV = 'production';
  try { await assert.rejects(assertLicenseCapacity({ $queryRaw: async () => [], license: { findFirst: async () => null } }, 'tenant-a', 'users'), /sem licença ativa/); }
  finally { if (previous === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previous; }
});

test('archived agent reactivation cannot bypass capacity', async () => {
  const { tx } = licenseTransaction(); let writes = 0;
  tx.agent.findFirst = async () => ({ id: 'agent', status: 'ARCHIVED' }); tx.agent.update = async () => { writes++; };
  const service = new AgentsService({ $transaction: (fn) => fn(tx) });
  await assert.rejects(service.update('tenant-a', 'agent', { status: 'ACTIVE' }), /Limite de agentes/);
  assert.equal(writes, 0);
});

test('suspended user reactivation cannot bypass capacity', async () => {
  const { tx } = licenseTransaction(); let writes = 0;
  tx.user.findFirst = async () => ({ id: 'user', status: 'SUSPENDED' }); tx.user.update = async () => { writes++; };
  const service = new CatalogService({ $transaction: (fn) => fn(tx) });
  await assert.rejects(service.updateUser('tenant-a', 'user', { status: 'ACTIVE' }, 'admin'), /Limite de usuários/);
  assert.equal(writes, 0);
});

test('new identities are created without a local password or hash', async () => {
  const { tx } = licenseTransaction({ maxUsers: 3 });
  tx.user.create = async (query) => {
    assert.equal(Object.hasOwn(query.data, 'passwordHash'), false);
    assert.equal(query.select.passwordHash, undefined);
    return { id: 'new-user', email: query.data.email };
  };
  const service = new CatalogService({ $transaction: (fn) => fn(tx) });
  assert.deepEqual(await service.createUser('tenant-a', { name: 'User', email: 'USER@example.test' }, 'admin'), { id: 'new-user', email: 'user@example.test' });
});

test('identity updates never replace existing legacy hashes', async () => {
  const {tx}=licenseTransaction();
  tx.user.findFirst=async()=>({id:'user',status:'ACTIVE',roles:[]});
  tx.userRole={findFirst:async()=>null};
  tx.user.update=async({data})=>{assert.equal(Object.hasOwn(data,'passwordHash'),false);return{id:'user',status:'ACTIVE'};};
  const service=new CatalogService({$transaction:fn=>fn(tx)});
  await service.updateUser('tenant-a','user',{name:'Changed'},'admin');
});

test('automation capacity excludes the current automation during activation', async () => {
  const { tx, events } = licenseTransaction({ maxAutomations: 2 });
  tx.automation = { count: async (query) => { assert.deepEqual(query.where, { tenantId: 'tenant-a', status: { not: 'ARCHIVED' }, id: { not: 'own-automation' } }); events.push('count'); return 1; } };
  await assertLicenseCapacity(tx, 'tenant-a', 'automations', 'own-automation');
  assert.deepEqual(events, ['lock', 'license', 'count']);
});

test('knowledge base capacity denies allocations at the licensed limit', async () => {
  const { tx } = licenseTransaction({ maxKnowledgeBases: 2 });
  tx.knowledgeBase = { count: async (query) => { assert.deepEqual(query.where, { tenantId: 'tenant-a' }); return 2; } };
  await assert.rejects(assertLicenseCapacity(tx, 'tenant-a', 'knowledgeBases'), /Limite de bases de conhecimento/);
});

test('storage reservations serialize tenant allocation and allow exact quota', async () => {
  const { tx, events } = licenseTransaction({ maxStorageBytes: 100n });
  tx.document = { aggregate: async (query) => { assert.equal(query.where.tenantId, 'tenant-a'); events.push('storage'); return { _sum: { sizeBytes: 80n } }; } };
  await assertStorageCapacity(tx, 'tenant-a', 20n);
  assert.deepEqual(events, ['lock', 'license', 'storage']);
  await assert.rejects(assertStorageCapacity(tx, 'tenant-a', 21n), /Limite de armazenamento/);
  await assert.rejects(assertStorageCapacity(tx, 'tenant-a', -1n), /Tamanho de armazenamento/);
});

test('active license read helpers share the same expiry policy without acquiring a write lock', async () => {
  const { tx } = licenseTransaction({ endDate: new Date('2000-01-01') });
  assert.equal(requireActiveLicense, assertActiveLicense);
  await assert.rejects(requireActiveLicense({ license: tx.license }, 'tenant-a'), /Licença da prefeitura/);
});
