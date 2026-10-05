import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export function retentionDays(settings: Prisma.JsonValue | undefined): number | null {
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) return null;
  const days = settings.retentionDays;
  return typeof days === 'number' && Number.isInteger(days) && days >= 1 && days <= 3650 ? days : null;
}

@Injectable()
export class RetentionService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RetentionService.name);
  private timer?: NodeJS.Timeout;
  private running?: Promise<void>;
  private stopping = false;
  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() { this.schedule(60000); }
  private schedule(delay: number) {
    if (this.stopping) return;
    this.timer = setTimeout(() => {
      this.running = this.run().catch(() => this.logger.error('Falha na retenção automática; a próxima execução tentará novamente.')).finally(() => this.schedule(86400000));
    }, delay);
    this.timer.unref();
  }
  async onModuleDestroy() { this.stopping = true; clearTimeout(this.timer); await this.running; }

  async run(now = new Date()): Promise<void> {
    let cursor: string | undefined;
    while (!this.stopping) {
      const tenants = await this.prisma.tenant.findMany({ where: { status: 'ACTIVE' }, select: { id: true, settings: true }, orderBy: { id: 'asc' }, take: 100, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}) });
      if (!tenants.length) break;
      for (const tenant of tenants) if (retentionDays(tenant.settings)) await this.pruneTenant(tenant.id, now);
      cursor = tenants.at(-1)!.id;
    }
  }

  async pruneTenant(tenantId: string, now = new Date()) {
    return this.prisma.$transaction(async tx => {
      await tx.$queryRaw(Prisma.sql`SELECT id FROM tenants WHERE id = ${tenantId}::uuid FOR UPDATE`);
      const tenant = await tx.tenant.findUnique({ where: { id: tenantId } });
      const days = tenant?.status === 'ACTIVE' ? retentionDays(tenant.settings) : null;
      if (!days) return { conversations: 0, executions: 0 };
      const cutoff = new Date(now.getTime() - days * 86400000);
      // Active model requests can still be using an older conversation. Defer
      // conversation cleanup until those requests have finished.
      const active = await tx.aiTokenReservation.count({ where: { tenantId, status: 'RESERVED', createdAt: { gte: new Date(now.getTime() - 3600000) } } });
      let conversations = 0;
      if (!active) {
        const rows = await tx.conversation.findMany({ where: { tenantId, updatedAt: { lt: cutoff } }, select: { id: true }, orderBy: { updatedAt: 'asc' }, take: 500 });
        if (rows.length) conversations = (await tx.conversation.deleteMany({ where: { tenantId, id: { in: rows.map(row => row.id) }, updatedAt: { lt: cutoff } } })).count;
      }
      const eligible = { tenantId, status: { in: ['SUCCESS', 'FAILED', 'CANCELLED'] as const }, finishedAt: { lt: cutoff }, dataPurgedAt: null };
      const rows = await tx.automationExecution.findMany({ where: { ...eligible, status: { in: [...eligible.status.in] } }, select: { id: true }, orderBy: { finishedAt: 'asc' }, take: 500 });
      const executions = rows.length ? (await tx.automationExecution.updateMany({ where: { ...eligible, status: { in: [...eligible.status.in] }, id: { in: rows.map(row => row.id) } }, data: { input: Prisma.DbNull, output: Prisma.DbNull, error: null, dataPurgedAt: now } })).count : 0;
      if (conversations || executions) await tx.auditLog.create({ data: { tenantId, event: 'retention.applied', resource: 'settings', resourceId: tenantId, metadata: { retentionDays: days, cutoff: cutoff.toISOString(), conversations, executions } } });
      return { conversations, executions };
    });
  }
}
