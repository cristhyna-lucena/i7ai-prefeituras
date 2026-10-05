-- Additive migration. Existing conversations and knowledge documents keep their scope.
ALTER TABLE "ai_models" ADD COLUMN "capabilities" JSONB;
ALTER TABLE "conversations" ADD COLUMN "modelId" UUID;
ALTER TABLE "documents" ADD COLUMN "chatOnly" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "ownerUserId" UUID;

ALTER TABLE "conversations" ADD CONSTRAINT "conversations_modelId_fkey"
  FOREIGN KEY ("modelId") REFERENCES "ai_models"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "documents" ADD CONSTRAINT "documents_ownerUserId_fkey"
  FOREIGN KEY ("ownerUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "conversations_modelId_idx" ON "conversations"("modelId");
CREATE INDEX "documents_tenantId_ownerUserId_chatOnly_createdAt_idx"
  ON "documents"("tenantId", "ownerUserId", "chatOnly", "createdAt");

CREATE TABLE "message_attachments" (
  "messageId" UUID NOT NULL,
  "documentId" UUID NOT NULL,
  CONSTRAINT "message_attachments_pkey" PRIMARY KEY ("messageId", "documentId"),
  CONSTRAINT "message_attachments_messageId_fkey" FOREIGN KEY ("messageId")
    REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "message_attachments_documentId_fkey" FOREIGN KEY ("documentId")
    REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "message_attachments_documentId_idx" ON "message_attachments"("documentId");

-- Provider names are central metadata; model identifiers are configured from the gateway catalog.
INSERT INTO "ai_providers" ("id", "name", "slug") VALUES
  (gen_random_uuid(), 'OpenAI', 'openai'),
  (gen_random_uuid(), 'Anthropic', 'anthropic'),
  (gen_random_uuid(), 'Google', 'google')
ON CONFLICT ("slug") DO NOTHING;
