const { Prisma, PrismaClient } = require('@prisma/client');
const { isEmail } = require('class-validator');
const { ROLE_NAMES, ensureRolePermissions } = require('./permissions.cjs');

class ProvisionError extends Error {}

function required(environment, key, maxLength = 160) {
  const value = environment[key]?.trim();
  if (!value) throw new ProvisionError('Configure ' + key + '.');
  if (value.length > maxLength) throw new ProvisionError(key + ' excede o tamanho permitido.');
  return value;
}

function boolean(environment, key) {
  const value = environment[key];
  if (value === undefined || value === '' || value === 'false') return false;
  if (value === 'true') return true;
  throw new ProvisionError(key + ' deve ser true ou false.');
}

function integer(environment, key, bigint = false) {
  const value = required(environment, key, 20);
  if (!/^\d+$/.test(value)) throw new ProvisionError(key + ' deve ser um inteiro não negativo.');
  const parsed = BigInt(value);
  if (parsed > (bigint ? 9223372036854775807n : 2147483647n)) throw new ProvisionError(key + ' excede o limite do banco.');
  return bigint ? parsed : Number(parsed);
}

function readProvisionConfig(environment = process.env) {
  const databaseUrl = required(environment, 'DATABASE_URL', 4096);
  let database;
  try { database = new URL(databaseUrl); } catch { throw new ProvisionError('DATABASE_URL deve ser uma URL PostgreSQL válida.'); }
  if (!['postgres:', 'postgresql:'].includes(database.protocol)) throw new ProvisionError('DATABASE_URL deve usar PostgreSQL.');
  const tenantName = required(environment, 'PROVISION_TENANT_NAME');
  const tenantSlug = required(environment, 'PROVISION_TENANT_SLUG', 63);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(tenantSlug)) throw new ProvisionError('PROVISION_TENANT_SLUG aceita letras minúsculas, números e hífens entre palavras.');
  const adminEmail = required(environment, 'PROVISION_ADMIN_EMAIL', 254).toLowerCase();
  if (!isEmail(adminEmail)) throw new ProvisionError('PROVISION_ADMIN_EMAIL deve ser um e-mail válido.');
  const adminName = required(environment, 'PROVISION_ADMIN_NAME');
  const platformAdmin = boolean(environment, 'PROVISION_PLATFORM_ADMIN');
  const createLicense = boolean(environment, 'PROVISION_CREATE_LICENSE');
  let license;
  if (createLicense) {
    license = {
      maxUsers: integer(environment, 'PROVISION_MAX_USERS'),
      maxAgents: integer(environment, 'PROVISION_MAX_AGENTS'),
      maxAutomations: integer(environment, 'PROVISION_MAX_AUTOMATIONS'),
      maxKnowledgeBases: integer(environment, 'PROVISION_MAX_KNOWLEDGE_BASES'),
      maxTokens: integer(environment, 'PROVISION_MAX_TOKENS', true),
      maxStorageBytes: integer(environment, 'PROVISION_MAX_STORAGE_BYTES', true),
    };
    if (license.maxUsers < 1) throw new ProvisionError('PROVISION_MAX_USERS deve comportar pelo menos o administrador inicial.');
    if (environment.PROVISION_LICENSE_END_DATE) {
      const value = environment.PROVISION_LICENSE_END_DATE;
      if (!/(Z|[+-]\d{2}:\d{2})$/.test(value) || Number.isNaN(Date.parse(value)) || new Date(value) <= new Date()) throw new ProvisionError('PROVISION_LICENSE_END_DATE deve ser uma data futura ISO com fuso explícito.');
      license.endDate = new Date(value);
    }
  }
  const modelSlug = environment.PROVISION_MODEL_SLUG?.trim();
  if (modelSlug && (!/^[a-zA-Z0-9._:/-]+$/.test(modelSlug) || modelSlug.length > 160)) throw new ProvisionError('PROVISION_MODEL_SLUG é inválido.');
  const modelName = environment.PROVISION_MODEL_NAME?.trim() || modelSlug;
  if (modelName && modelName.length > 160) throw new ProvisionError('PROVISION_MODEL_NAME excede o tamanho permitido.');
  return { databaseUrl, tenantName, tenantSlug, adminEmail, adminName, platformAdmin, license, modelSlug, modelName };
}

async function provision(prisma, config) {
  return prisma.$transaction(async (tx) => {
    // Serialize concurrent onboarding calls for this slug, including a new tenant.
    await tx.$queryRaw(Prisma.sql`SELECT 1 AS acquired FROM pg_advisory_xact_lock(341709, hashtext(${`tenant:${config.tenantSlug}`}))`);
    let tenant = await tx.tenant.findUnique({ where: { slug: config.tenantSlug } });
    const tenantCreated = !tenant;
    if (!tenant) tenant = await tx.tenant.create({ data: { name: config.tenantName, slug: config.tenantSlug } });
    await tx.$queryRaw(Prisma.sql`SELECT id FROM tenants WHERE id = ${tenant.id}::uuid FOR UPDATE`);

    let admin = await tx.user.findUnique({ where: { email: config.adminEmail } });
    if (admin && admin.tenantId !== tenant.id) throw new ProvisionError('O administrador informado pertence a outra prefeitura. Nenhum dado foi alterado.');
    const adminCreated = !admin;
    let roleCreated = false;
    let adminRoleIds;
    const defaultRoleIds = {};
    const createdRoleNames = [];
    async function ensureRole(roleName) {
      await tx.$queryRaw(Prisma.sql`SELECT 1 AS acquired FROM pg_advisory_xact_lock(341709, hashtext(${`role:${roleName}`}))`);
      let role = await tx.role.findUnique({ where: { name: roleName } });
      if (!role) {
        role = await tx.role.create({ data: { name: roleName, description: roleName } });
        await ensureRolePermissions(tx, role.id, roleName);
        createdRoleNames.push(roleName);
      }
      // Existing permission policies are deliberately preserved.
      return role;
    }
    // Stable lock order keeps concurrent tenant onboarding from deadlocking.
    for (const roleName of ROLE_NAMES) {
      const role = await ensureRole(roleName);
      defaultRoleIds[roleName] = role.id;
    }
    if (!admin) {
      const roleName = config.platformAdmin ? 'SUPER_ADMIN' : 'ADMIN';
      const role = config.platformAdmin ? await ensureRole(roleName) : { id: defaultRoleIds.ADMIN };
      roleCreated = createdRoleNames.includes(roleName);
      admin = await tx.user.create({ data: { tenantId: tenant.id, name: config.adminName, email: config.adminEmail, status: 'ACTIVE' } });
      await tx.userRole.create({ data: { userId: admin.id, roleId: role.id } });
      adminRoleIds = [role.id];
    } else {
      // Existing identity, password, name, status and role bindings are preserved.
      adminRoleIds = (await tx.userRole.findMany({ where: { userId: admin.id }, select: { roleId: true } })).map((binding) => binding.roleId);
    }

    let license = await tx.license.findFirst({ where: { tenantId: tenant.id }, orderBy: { createdAt: 'desc' } });
    const existingLicensePreserved = Boolean(license);
    let licenseCreated = false;
    if (!license && config.license) {
      license = await tx.license.create({ data: { tenantId: tenant.id, status: 'ACTIVE', ...config.license } });
      licenseCreated = true;
    }

    let modelId = null, modelCreated = false;
    if (config.modelSlug) {
      await tx.$queryRaw(Prisma.sql`SELECT 1 AS acquired FROM pg_advisory_xact_lock(341709, hashtext(${`model:openai:${config.modelSlug}`}))`);
      const provider = await tx.aiProvider.upsert({ where: { slug: 'openai' }, update: {}, create: { name: 'OpenAI', slug: 'openai' } });
      let model = await tx.aiModel.findUnique({ where: { providerId_slug: { providerId: provider.id, slug: config.modelSlug } } });
      modelCreated = !model;
      if (!model) model = await tx.aiModel.create({ data: { providerId: provider.id, slug: config.modelSlug, name: config.modelName, inputPrice: null, outputPrice: null } });
      modelId = model.id;
    }

    const result = {
      tenantId: tenant.id,
      adminUserId: admin.id,
      adminRoleIds,
      defaultRoleIds,
      licenseId: license?.id || null,
      modelId,
      created: { tenant: tenantCreated, adminUser: adminCreated, role: roleCreated, roleNames: createdRoleNames, license: licenseCreated, model: modelCreated },
      existingAdminPreserved: !adminCreated,
      existingLicensePreserved,
      platformAdminGrantedThisRun: adminCreated && config.platformAdmin,
    };
    await tx.auditLog.create({ data: { tenantId: tenant.id, event: 'tenant.provisioned', resource: 'tenants', resourceId: tenant.id, metadata: { source: 'provision-cli', ...result } } });
    return result;
  }, { maxWait: 10000, timeout: 60000 });
}

async function main() {
  let prisma;
  try {
    const config = readProvisionConfig();
    prisma = new PrismaClient({ datasources: { db: { url: config.databaseUrl } } });
    const result = await provision(prisma, config);
    // Deliberately excludes passwords, hashes, connection URLs, names and emails.
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    if (error instanceof ProvisionError) console.error(error.message);
    else console.error('Falha no provisionamento. Verifique conexão, migrações e permissões do banco.' + (/^P\d{4}$/.test(error?.code || '') ? ' Código: ' + error.code : ''));
    process.exitCode = 1;
  } finally {
    try { await prisma?.$disconnect(); }
    catch { console.error('Não foi possível encerrar a conexão de provisionamento.'); process.exitCode = 1; }
  }
}

if (require.main === module) main();
module.exports = { ProvisionError, readProvisionConfig, provision, main };
