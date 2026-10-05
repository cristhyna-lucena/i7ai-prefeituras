-- Demo user: admin@i7ai.gov.br / i7ai123
INSERT INTO "users" ("id", "tenantId", "name", "email", "passwordHash", "status", "createdAt", "updatedAt")
VALUES (
  '00000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000001',
  'João da Silva',
  'admin@i7ai.gov.br',
  '$2b$10$a55IDrkQf55jNwkB5.rYJ.TEY1G6BA57V0C7qG8QTk2lNrvqfEitu',
  'ACTIVE', NOW(), NOW()
)
ON CONFLICT ("email") DO NOTHING;
