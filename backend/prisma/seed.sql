CREATE EXTENSION IF NOT EXISTS vector;

INSERT INTO "ai_providers" ("id", "name", "slug")
VALUES
  ('00000000-0000-0000-0000-000000000001', 'OpenAI', 'openai'),
  ('00000000-0000-0000-0000-000000000002', 'Anthropic', 'anthropic'),
  ('00000000-0000-0000-0000-000000000003', 'Google', 'google')
ON CONFLICT ("slug") DO NOTHING;

INSERT INTO "tenants" ("id", "name", "slug", "status", "createdAt", "updatedAt")
VALUES ('00000000-0000-0000-0000-000000000001', 'Tenant de Desenvolvimento', 'dev-prefeitura', 'ACTIVE', NOW(), NOW())
ON CONFLICT ("id") DO NOTHING;
