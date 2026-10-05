ALTER TABLE "ai_usage" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'COMPLETED', ADD COLUMN "usageMeasured" BOOLEAN NOT NULL DEFAULT true;
CREATE TABLE "ai_token_reservations" (
  "id" UUID NOT NULL, "runId" UUID NOT NULL, "tenantId" UUID NOT NULL,
  "reservedTokens" BIGINT NOT NULL, "status" TEXT NOT NULL DEFAULT 'RESERVED',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "finishedAt" TIMESTAMP(3),
  CONSTRAINT "ai_token_reservations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ai_token_reservations_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "ai_token_reservations_tenantId_createdAt_status_idx" ON "ai_token_reservations"("tenantId", "createdAt", "status");
CREATE INDEX "ai_token_reservations_runId_idx" ON "ai_token_reservations"("runId");
