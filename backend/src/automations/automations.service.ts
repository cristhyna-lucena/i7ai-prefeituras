import { BadRequestException, HttpException, Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit, ServiceUnavailableException } from '@nestjs/common';
import { ExecutionStatus, Prisma } from '@prisma/client';
import { Job, Queue, UnrecoverableError, Worker } from 'bullmq';
import Redis from 'ioredis';
import { PrismaService } from '../prisma/prisma.service';
import { AiGatewayService } from '../ai/ai-gateway.service';
import { ToolsService } from '../tools/tools.service';
import { assertActiveLicense, assertLicenseCapacity } from '../catalog/license-policy';
import { AutomationStepDto, CreateAutomationDto, UpdateAutomationDto } from './dto/create-automation.dto';
import { CreateScheduleDto, UpdateScheduleDto } from './dto/schedule.dto';
import { boundedJson, normalizeSteps, scheduledExecutionId, validateSchedule, withTimeout } from './automation-validation';

type ExecutionPlan = { agentId: string; timeoutSeconds: number; steps: Array<{ id: string; order: number; name: string; actionType: string; configuration: Prisma.JsonValue }> };
type AutomationJob = { tenantId: string; automationId: string; executionId?: string; scheduleId?: string; userId?: string; plan?: ExecutionPlan };
const details = { agent: { select: { id: true, name: true, status: true } }, steps: { orderBy: { order: 'asc' as const } }, schedules: true, _count: { select: { executions: true } } };

@Injectable()
export class AutomationsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AutomationsService.name);
  private connection?: Redis;
  private queue?: Queue<AutomationJob>;
  private worker?: Worker<AutomationJob>;

  constructor(private readonly prisma: PrismaService, private readonly gateway: AiGatewayService, private readonly tools: ToolsService) {}

  async onModuleInit() {
    this.connection = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', { maxRetriesPerRequest: null });
    this.connection.on('error', (error) => this.logger.error(`Redis de automações: ${error.message}`));
    const prefix = process.env.QUEUE_PREFIX || 'bull';
    this.queue = new Queue<AutomationJob>('automation.execute', { connection: this.connection, prefix });
    this.worker = new Worker<AutomationJob>('automation.execute', (job) => this.process(job), { connection: this.connection, prefix, concurrency: 2 });
    this.worker.on('error', (error) => this.logger.error(error.message));
    await this.queue.waitUntilReady();
    await this.restoreSchedules();
  }

  async onModuleDestroy() {
    await this.worker?.close();
    await this.queue?.close();
    await this.connection?.quit();
  }

  list(tenantId: string) {
    return this.prisma.automation.findMany({ where: { tenantId, status: { not: 'ARCHIVED' } }, include: details, orderBy: { name: 'asc' } });
  }

  async get(tenantId: string, id: string) {
    const automation = await this.prisma.automation.findFirst({ where: { id, tenantId }, include: details });
    if (!automation) throw new NotFoundException('Automação não encontrada.');
    return automation;
  }

  private async assertAgent(tenantId: string, agentId: string) {
    const agent = await this.prisma.agent.findFirst({ where: { id: agentId, tenantId, status: { not: 'ARCHIVED' } } });
    if (!agent) throw new NotFoundException('Agente não encontrado na organização.');
    return agent;
  }

  private async checkedSteps(tenantId: string, agentId: string, steps: AutomationStepDto[]) {
    const normalized = normalizeSteps(steps);
    for (const step of normalized) {
      if (step.actionType !== 'HTTP_TOOL') continue;
      const config = step.configuration as { toolId: string };
      const binding = await this.prisma.agentTool.findFirst({ where: { agentId, toolId: config.toolId, enabled: true, agent: { tenantId }, tool: { tenantId, status: 'ACTIVE', type: { in: ['HTTP_REQUEST', 'WEBHOOK', 'REST_API', 'N8N'] } } } });
      if (!binding) throw new BadRequestException('A ferramenta HTTP deve estar ativa e autorizada para este agente.');
    }
    return normalized;
  }

  async create(tenantId: string, input: CreateAutomationDto, userId?: string) {
    const agent = await this.assertAgent(tenantId, input.agentId);
    if (input.status === 'ACTIVE' && agent.status !== 'ACTIVE') throw new BadRequestException('Ative o agente antes de ativar a automação.');
    const steps = await this.checkedSteps(tenantId, input.agentId, input.steps ?? [{ name: 'Executar agente', actionType: 'AGENT', configuration: { prompt: input.description || input.name } }]);
    const automation = await this.prisma.$transaction(async (tx) => {
      await assertLicenseCapacity(tx, tenantId, 'automations');
      return tx.automation.create({ data: { tenantId, agentId: input.agentId, name: input.name.trim(), description: input.description, timeoutSeconds: input.timeoutSeconds ?? 300, retries: input.retries ?? 2, status: input.status ?? 'DRAFT', steps: { create: steps } }, include: details });
    });
    await this.audit(tenantId, userId, 'automation.created', automation.id);
    return automation;
  }

  async update(tenantId: string, id: string, input: UpdateAutomationDto, userId?: string) {
    const previous = await this.get(tenantId, id);
    if (previous.status === 'ARCHIVED') throw new BadRequestException('A automação está arquivada.');
    const agentId = input.agentId ?? previous.agentId;
    const agent = await this.assertAgent(tenantId, agentId);
    if ((input.status ?? previous.status) === 'ACTIVE' && agent.status !== 'ACTIVE') throw new BadRequestException('Ative o agente antes de ativar a automação.');
    const steps = await this.checkedSteps(tenantId, agentId, input.steps ?? previous.steps.map((step) => ({ name: step.name, actionType: step.actionType as 'AGENT' | 'HTTP_TOOL', configuration: step.configuration as Record<string, unknown> })));
    const automation = await this.prisma.$transaction(async (tx) => {
      if (input.status === 'ACTIVE' && previous.status !== 'ACTIVE') await assertLicenseCapacity(tx, tenantId, 'automations', id);
      await tx.automationStep.deleteMany({ where: { automationId: id } });
      return tx.automation.update({ where: { id }, data: { agentId, name: input.name?.trim(), description: input.description, status: input.status ?? undefined, timeoutSeconds: input.timeoutSeconds ?? undefined, retries: input.retries ?? undefined, steps: { create: steps } }, include: details });
    });
    await Promise.all(automation.schedules.map((schedule) => this.syncSchedule(schedule, automation)));
    await this.audit(tenantId, userId, 'automation.updated', id);
    return this.get(tenantId, id);
  }

  async archive(tenantId: string, id: string, userId?: string) {
    const automation = await this.get(tenantId, id);
    await this.prisma.$transaction([this.prisma.schedule.updateMany({ where: { automationId: id }, data: { enabled: false, nextRunAt: null } }), this.prisma.automation.update({ where: { id }, data: { status: 'ARCHIVED' } })]);
    await Promise.all(automation.schedules.map((schedule) => this.requireQueue().removeJobScheduler(this.schedulerKey(schedule.id))));
    await this.audit(tenantId, userId, 'automation.archived', id);
    return { id, status: 'ARCHIVED' };
  }

  async run(tenantId: string, automationId: string, input: Record<string, unknown> = {}, userId?: string) {
    const queue = this.requireQueue();
    const automation = await this.get(tenantId, automationId);
    await assertActiveLicense(this.prisma, tenantId);
    if (automation.status === 'ARCHIVED' || automation.status === 'PAUSED') throw new BadRequestException('A automação está pausada ou arquivada.');
    if (automation.agent.status !== 'ACTIVE') throw new BadRequestException('Ative o agente antes de executar.');
    if (!automation.steps.length) throw new BadRequestException('Configure pelo menos uma etapa antes de executar.');
    const execution = await this.prisma.automationExecution.create({ data: { tenantId, automationId, agentId: automation.agentId, triggerType: 'MANUAL', status: 'PENDING', input: boundedJson(input, 128 * 1024) } });
    try {
      await queue.add('execute', { tenantId, automationId, executionId: execution.id, userId, plan: { agentId: automation.agentId, timeoutSeconds: automation.timeoutSeconds, steps: automation.steps } }, { jobId: `execution-${execution.id}`, attempts: automation.retries + 1, backoff: { type: 'exponential', delay: 2000 }, removeOnComplete: 1000, removeOnFail: 1000 });
    } catch {
      await this.prisma.automationExecution.update({ where: { id: execution.id }, data: { status: 'FAILED', finishedAt: new Date(), error: 'Não foi possível adicionar a execução à fila.' } });
      throw new ServiceUnavailableException('A fila de automações está indisponível. Tente novamente.');
    }
    await this.audit(tenantId, userId, 'automation.enqueued', automationId, { executionId: execution.id });
    return execution;
  }

  async listExecutions(tenantId: string, status?: string, automationId?: string) {
    status = status || undefined;
    automationId = automationId || undefined;
    if (status && !Object.values(ExecutionStatus).includes(status as ExecutionStatus)) throw new BadRequestException('Status de execução inválido.');
    if (automationId && !/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(automationId)) throw new BadRequestException('Identificador de automação inválido.');
    if (automationId) await this.get(tenantId, automationId);
    return this.prisma.automationExecution.findMany({ where: { tenantId, status: status as ExecutionStatus | undefined, automationId }, include: { automation: { select: { id: true, name: true } }, agent: { select: { id: true, name: true } }, schedule: { select: { id: true, name: true } } }, orderBy: { createdAt: 'desc' }, take: 100 });
  }

  async getExecution(tenantId: string, id: string) {
    const execution = await this.prisma.automationExecution.findFirst({ where: { id, tenantId }, include: { automation: { select: { id: true, name: true } }, agent: { select: { id: true, name: true } }, schedule: true } });
    if (!execution) throw new NotFoundException('Execução não encontrada.');
    return execution;
  }

  async listSchedules(tenantId: string, automationId: string) {
    await this.get(tenantId, automationId);
    return this.prisma.schedule.findMany({ where: { automationId }, orderBy: { name: 'asc' } });
  }

  async createSchedule(tenantId: string, automationId: string, input: CreateScheduleDto, userId?: string) {
    const automation = await this.get(tenantId, automationId);
    if (automation.status === 'ARCHIVED') throw new BadRequestException('A automação está arquivada.');
    const timezone = input.timezone ?? 'America/Cuiaba';
    validateSchedule(input.cronExpression, timezone);
    const schedule = await this.prisma.schedule.create({ data: { automationId, name: input.name.trim(), cronExpression: input.cronExpression.trim(), timezone, enabled: input.enabled ?? true } });
    try { await this.syncSchedule(schedule, automation); }
    catch { await this.prisma.schedule.delete({ where: { id: schedule.id } }); throw new ServiceUnavailableException('Não foi possível registrar o agendamento na fila.'); }
    await this.audit(tenantId, userId, 'schedule.created', schedule.id);
    return this.prisma.schedule.findUnique({ where: { id: schedule.id } });
  }

  async updateSchedule(tenantId: string, automationId: string, id: string, input: UpdateScheduleDto, userId?: string) {
    const automation = await this.get(tenantId, automationId);
    if (automation.status === 'ARCHIVED') throw new BadRequestException('A automação está arquivada.');
    const previous = await this.prisma.schedule.findFirst({ where: { id, automationId } });
    if (!previous) throw new NotFoundException('Agendamento não encontrado.');
    validateSchedule(input.cronExpression ?? previous.cronExpression, input.timezone ?? previous.timezone);
    const schedule = await this.prisma.schedule.update({ where: { id }, data: { name: input.name?.trim(), cronExpression: input.cronExpression?.trim(), timezone: input.timezone ?? undefined, enabled: input.enabled ?? undefined } });
    try { await this.syncSchedule(schedule, automation); }
    catch {
      await this.prisma.schedule.update({ where: { id }, data: { name: previous.name, cronExpression: previous.cronExpression, timezone: previous.timezone, enabled: previous.enabled, nextRunAt: previous.nextRunAt } });
      throw new ServiceUnavailableException('Não foi possível atualizar o agendamento na fila.');
    }
    await this.audit(tenantId, userId, 'schedule.updated', id);
    return this.prisma.schedule.findUnique({ where: { id } });
  }

  async deleteSchedule(tenantId: string, automationId: string, id: string, userId?: string) {
    await this.get(tenantId, automationId);
    const schedule = await this.prisma.schedule.findFirst({ where: { id, automationId } });
    if (!schedule) throw new NotFoundException('Agendamento não encontrado.');
    await this.requireQueue().removeJobScheduler(this.schedulerKey(id));
    await this.prisma.schedule.delete({ where: { id } });
    await this.audit(tenantId, userId, 'schedule.deleted', id);
    return { id, deleted: true };
  }

  private requireQueue() {
    if (!this.queue) throw new ServiceUnavailableException('A fila de automações não está pronta.');
    return this.queue;
  }

  private schedulerKey(id: string) { return `schedule-${id}`; }

  private async syncSchedule(schedule: { id: string; automationId: string; name: string; cronExpression: string; timezone: string; enabled: boolean }, automation: { tenantId: string; status: string; retries: number }) {
    const queue = this.requireQueue();
    if (!schedule.enabled || automation.status !== 'ACTIVE') {
      await queue.removeJobScheduler(this.schedulerKey(schedule.id));
      await this.prisma.schedule.update({ where: { id: schedule.id }, data: { nextRunAt: null } });
      return;
    }
    const job = await queue.upsertJobScheduler(this.schedulerKey(schedule.id), { pattern: schedule.cronExpression, tz: schedule.timezone }, { name: 'scheduled-execute', data: { tenantId: automation.tenantId, automationId: schedule.automationId, scheduleId: schedule.id }, opts: { attempts: automation.retries + 1, backoff: { type: 'exponential', delay: 2000 }, removeOnComplete: 1000, removeOnFail: 1000 } });
    await this.prisma.schedule.update({ where: { id: schedule.id }, data: { nextRunAt: new Date(job.timestamp + job.delay) } });
  }

  private async restoreSchedules() {
    const schedules = await this.prisma.schedule.findMany({ include: { automation: true } });
    const known = new Set(schedules.map((schedule) => this.schedulerKey(schedule.id)));
    const existing = await this.requireQueue().getJobSchedulers(0, -1);
    for (const scheduler of existing) if (!known.has(scheduler.key)) await this.requireQueue().removeJobScheduler(scheduler.key);
    for (const schedule of schedules) {
      try { validateSchedule(schedule.cronExpression, schedule.timezone); await this.syncSchedule(schedule, schedule.automation); }
      catch (error) { this.logger.error(`Agendamento ${schedule.id}: ${error instanceof Error ? error.message : 'erro'}`); await this.prisma.schedule.update({ where: { id: schedule.id }, data: { enabled: false, nextRunAt: null } }); await this.requireQueue().removeJobScheduler(this.schedulerKey(schedule.id)); }
    }
  }
  private async process(job: Job<AutomationJob>) {
    const { tenantId, automationId, scheduleId, userId } = job.data;
    const automation = await this.prisma.automation.findFirst({ where: { id: automationId, tenantId }, include: details });
    if (!automation) throw new Error('Automação não encontrada.');
    if (scheduleId) {
      const schedule = automation.schedules.find((item) => item.id === scheduleId);
      if (!schedule?.enabled || automation.status !== 'ACTIVE') return { skipped: true };
      const next = await this.requireQueue().getJobScheduler(this.schedulerKey(scheduleId));
      await this.prisma.schedule.update({ where: { id: scheduleId }, data: { nextRunAt: next?.next ? new Date(next.next) : null } });
    }
    if (!job.data.executionId && (!scheduleId || !job.id)) throw new Error('Identificador de execução ausente.');
    const executionId = job.data.executionId ?? scheduledExecutionId(scheduleId!, job.id!);
    const plan = job.data.plan ?? { agentId: automation.agentId, timeoutSeconds: automation.timeoutSeconds, steps: automation.steps };
    if (!job.data.plan) await job.updateData({ ...job.data, plan });
    const execution = await this.prisma.automationExecution.upsert({ where: { id: executionId }, create: { id: executionId, tenantId, automationId, agentId: plan.agentId, scheduleId, triggerType: scheduleId ? 'SCHEDULE' : 'MANUAL', status: 'PENDING', input: {} }, update: {} });
    if (execution.tenantId !== tenantId || execution.automationId !== automationId) throw new Error('Execução inválida para esta organização.');
    if (execution.status === 'SUCCESS' || execution.status === 'CANCELLED') return execution.output;
    const startedAt = new Date();
    const saved = execution.output as { steps?: Array<{ stepId: string; order: number; name: string; actionType: string; output: unknown }> } | null;
    const results = Array.isArray(saved?.steps) ? saved.steps.filter((result) => plan.steps.some((step) => step.id === result.stepId)) : [];
    await this.prisma.automationExecution.update({ where: { id: executionId }, data: { status: 'RUNNING', startedAt, finishedAt: null, error: null } });
    try {
      if (automation.status === 'ARCHIVED' || automation.status === 'PAUSED') throw new BadRequestException('A automação está pausada ou arquivada.');
      await assertActiveLicense(this.prisma, tenantId);
      const agent = await this.assertAgent(tenantId, plan.agentId);
      if (agent.status !== 'ACTIVE') throw new BadRequestException('O agente está inativo.');
      if (!plan.steps.length) throw new Error('A automação não tem etapas configuradas.');
      let previousResult: unknown = null;
      await withTimeout(plan.timeoutSeconds * 1000, async (signal) => {
        for (const step of plan.steps) {
          if (signal.aborted) throw new Error('Tempo limite da automação excedido.');
          const current = await this.prisma.automation.findFirst({ where: { id: automationId, tenantId }, select: { status: true } });
          if (!current || current.status === 'ARCHIVED' || current.status === 'PAUSED' || (scheduleId && current.status !== 'ACTIVE')) throw new BadRequestException('A automação foi pausada, arquivada ou desativada durante a execução.');
          await assertActiveLicense(this.prisma, tenantId);
          const checkpoint = results.find((result) => result.stepId === step.id);
          if (checkpoint) { previousResult = checkpoint.output; continue; }
          const config = step.configuration as Record<string, unknown>;
          if (step.actionType === 'AGENT') {
            const message = `${String(config.prompt ?? '')}\n\nEntrada da automação:\n${JSON.stringify(execution.input ?? {})}${previousResult === null ? '' : `\n\nResultado da etapa anterior:\n${JSON.stringify(previousResult)}`}`;
            if (message.length > 200000) throw new Error('O contexto da etapa excede 200.000 caracteres. Reduza a entrada ou o resultado da etapa anterior.');
            previousResult = await this.gateway.executeAgent(plan.agentId, tenantId, { message, automationId, userId, signal });
          } else if (step.actionType === 'HTTP_TOOL') {
            previousResult = await this.tools.execute(tenantId, plan.agentId, String(config.toolId), { ...((config.input ?? {}) as Record<string, unknown>), automationInput: execution.input, previousResult, idempotencyKey: `${executionId}-${step.id}` }, signal);
          } else throw new Error('Tipo de etapa não suportado.');
          if (signal.aborted) throw new Error('Tempo limite da automação excedido.');
          const nextResult = { stepId: step.id, order: step.order, name: step.name, actionType: step.actionType, output: previousResult };
          const checkpointOutput = boundedJson({ steps: [...results, nextResult], attempt: job.attemptsMade + 1 }, 512 * 1024);
          results.push(nextResult);
          await this.prisma.automationExecution.update({ where: { id: executionId }, data: { output: checkpointOutput } });
        }
      });
      const output = boundedJson({ steps: results, result: previousResult, attempt: job.attemptsMade + 1 });
      await this.prisma.automationExecution.update({ where: { id: executionId }, data: { status: 'SUCCESS', output, finishedAt: new Date(), durationMs: Date.now() - startedAt.getTime(), error: null } });
      await this.audit(tenantId, userId, 'automation.succeeded', automationId, { executionId });
      return output;
    } catch (error) {
      const permanent = error instanceof HttpException && [400, 401, 403, 404, 422].includes(error.getStatus());
      const retrying = !permanent && job.attemptsMade + 1 < (job.opts.attempts ?? 1);
      await this.prisma.automationExecution.update({ where: { id: executionId }, data: { status: retrying ? 'PENDING' : 'FAILED', error: (error instanceof Error ? error.message : 'Falha na automação.').slice(0, 4000), output: boundedJson({ steps: results, attempt: job.attemptsMade + 1 }), finishedAt: retrying ? null : new Date(), durationMs: Date.now() - startedAt.getTime() } });
      await this.audit(tenantId, userId, retrying ? 'automation.retrying' : 'automation.failed', automationId, { executionId });
      if (permanent) throw new UnrecoverableError(error.message);
      throw error;
    }
  }

  private async audit(tenantId: string, userId: string | undefined, event: string, resourceId: string, metadata?: Prisma.InputJsonValue) {
    try { await this.prisma.auditLog.create({ data: { tenantId, userId, event, resource: event.startsWith('schedule.') ? 'schedules' : 'automations', resourceId, metadata } }); }
    catch (error) { this.logger.error(`Falha ao registrar ${event}: ${error instanceof Error ? error.message : 'erro'}`); }
  }
}
