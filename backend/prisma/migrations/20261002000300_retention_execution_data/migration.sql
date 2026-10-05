ALTER TABLE "automation_executions" ADD COLUMN "dataPurgedAt" TIMESTAMP(3);
CREATE INDEX "conversations_tenantId_updatedAt_idx" ON "conversations"("tenantId", "updatedAt");
CREATE INDEX "automation_executions_tenantId_finishedAt_dataPurgedAt_idx" ON "automation_executions"("tenantId", "finishedAt", "dataPurgedAt");
