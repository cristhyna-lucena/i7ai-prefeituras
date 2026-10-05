import { BadRequestException } from '@nestjs/common';
import { parseExpression } from 'cron-parser';
import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { AutomationStepDto } from './dto/create-automation.dto';

export function normalizeSteps(steps: AutomationStepDto[]) {
  if (!Array.isArray(steps) || steps.length < 1 || steps.length > 20) throw new BadRequestException('Informe entre 1 e 20 etapas.');
  return steps.map((step, order) => {
    if (!step.name?.trim() || step.name.length > 160) throw new BadRequestException('Nome de etapa inválido.');
    const config = step.configuration;
    if (!config || typeof config !== 'object' || Array.isArray(config)) throw new BadRequestException('Configuração de etapa inválida.');
    if (step.actionType === 'AGENT') {
      if (typeof config.prompt !== 'string' || !config.prompt.trim() || config.prompt.length > 20000) throw new BadRequestException('A etapa de agente precisa de instruções de até 20.000 caracteres.');
      return { order, name: step.name.trim(), actionType: 'AGENT', configuration: { prompt: config.prompt.trim() } as Prisma.InputJsonValue };
    }
    if (step.actionType === 'HTTP_TOOL') {
      if (typeof config.toolId !== 'string' || !/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(config.toolId)) throw new BadRequestException('Selecione uma ferramenta válida.');
      if (config.input !== undefined && (!config.input || typeof config.input !== 'object' || Array.isArray(config.input))) throw new BadRequestException('A entrada da ferramenta deve ser um objeto JSON.');
      const configuration = { toolId: config.toolId, input: config.input ?? {} };
      boundedJson(configuration, 128 * 1024);
      return { order, name: step.name.trim(), actionType: 'HTTP_TOOL', configuration: configuration as Prisma.InputJsonValue };
    }
    throw new BadRequestException('Tipo de etapa não suportado. Use AGENT ou HTTP_TOOL.');
  });
}

export function validateSchedule(expression: string, timezone: string, currentDate = new Date()) {
  try {
    new Intl.DateTimeFormat('pt-BR', { timeZone: timezone }).format(currentDate);
    if (expression.trim().split(/\s+/).length !== 5) throw new Error('Use cinco campos cron: minuto hora dia mês dia-da-semana.');
    return parseExpression(expression, { tz: timezone, currentDate }).next().toDate();
  } catch {
    throw new BadRequestException('Expressão cron ou fuso horário inválido. Use cinco campos, por exemplo: 0 8 * * 1-5.');
  }
}

export function boundedJson(value: unknown, bytes = 1024 * 1024): Prisma.InputJsonValue {
  const serialized = JSON.stringify(value);
  if (serialized === undefined || Buffer.byteLength(serialized) > bytes) throw new BadRequestException('Os dados excedem o tamanho permitido.');
  return JSON.parse(serialized) as Prisma.InputJsonValue;
}

export function scheduledExecutionId(scheduleId: string, jobId: string) {
  const hash = createHash('sha256').update(`${scheduleId}|${jobId}`).digest('hex');
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

export async function withTimeout<T>(milliseconds: number, operation: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => { controller.abort(); reject(new Error('Tempo limite da automação excedido.')); }, milliseconds);
  });
  try { return await Promise.race([operation(controller.signal), timeout]); }
  finally { if (timer) clearTimeout(timer); }
}
