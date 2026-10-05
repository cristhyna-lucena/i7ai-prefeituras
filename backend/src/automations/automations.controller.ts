import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AuthenticatedRequest, JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequirePermission } from '../auth/permissions.decorator';
import { AutomationsService } from './automations.service';
import { CreateAutomationDto, RunAutomationDto, UpdateAutomationDto } from './dto/create-automation.dto';
import { CreateScheduleDto, UpdateScheduleDto } from './dto/schedule.dto';

@Controller('automations')
@UseGuards(JwtAuthGuard)
export class AutomationsController {
  constructor(private readonly automations: AutomationsService) {}

  @Get()
  @RequirePermission('automations', 'read')
  list(@Req() request: AuthenticatedRequest) {
    return this.automations.list(request.user!.tenantId);
  }

  @Post()
  @RequirePermission('automations', 'write')
  create(@Req() request: AuthenticatedRequest, @Body() body: CreateAutomationDto) {
    return this.automations.create(request.user!.tenantId, body, request.user!.sub);
  }

  @Get(':automationId')
  @RequirePermission('automations', 'read')
  get(@Req() request: AuthenticatedRequest, @Param('automationId', ParseUUIDPipe) id: string) {
    return this.automations.get(request.user!.tenantId, id);
  }

  @Patch(':automationId')
  @RequirePermission('automations', 'write')
  update(@Req() request: AuthenticatedRequest, @Param('automationId', ParseUUIDPipe) id: string, @Body() body: UpdateAutomationDto) {
    return this.automations.update(request.user!.tenantId, id, body, request.user!.sub);
  }

  @Delete(':automationId')
  @RequirePermission('automations', 'write')
  archive(@Req() request: AuthenticatedRequest, @Param('automationId', ParseUUIDPipe) id: string) {
    return this.automations.archive(request.user!.tenantId, id, request.user!.sub);
  }

  @Post(':automationId/run')
  @RequirePermission('automations', 'execute')
  run(@Req() request: AuthenticatedRequest, @Param('automationId', ParseUUIDPipe) automationId: string, @Body() body: RunAutomationDto) {
    return this.automations.run(request.user!.tenantId, automationId, body.input, request.user!.sub);
  }

  @Get(':automationId/executions')
  @RequirePermission('executions', 'read')
  executions(@Req() request: AuthenticatedRequest, @Param('automationId', ParseUUIDPipe) automationId: string, @Query('status') status?: string) {
    return this.automations.listExecutions(request.user!.tenantId, status, automationId);
  }

  @Get(':automationId/schedules')
  @RequirePermission('schedules', 'read')
  schedules(@Req() request: AuthenticatedRequest, @Param('automationId', ParseUUIDPipe) automationId: string) {
    return this.automations.listSchedules(request.user!.tenantId, automationId);
  }

  @Post(':automationId/schedules')
  @RequirePermission('schedules', 'write')
  createSchedule(@Req() request: AuthenticatedRequest, @Param('automationId', ParseUUIDPipe) automationId: string, @Body() body: CreateScheduleDto) {
    return this.automations.createSchedule(request.user!.tenantId, automationId, body, request.user!.sub);
  }

  @Patch(':automationId/schedules/:scheduleId')
  @RequirePermission('schedules', 'write')
  updateSchedule(@Req() request: AuthenticatedRequest, @Param('automationId', ParseUUIDPipe) automationId: string, @Param('scheduleId', ParseUUIDPipe) scheduleId: string, @Body() body: UpdateScheduleDto) {
    return this.automations.updateSchedule(request.user!.tenantId, automationId, scheduleId, body, request.user!.sub);
  }

  @Delete(':automationId/schedules/:scheduleId')
  @RequirePermission('schedules', 'write')
  deleteSchedule(@Req() request: AuthenticatedRequest, @Param('automationId', ParseUUIDPipe) automationId: string, @Param('scheduleId', ParseUUIDPipe) scheduleId: string) {
    return this.automations.deleteSchedule(request.user!.tenantId, automationId, scheduleId, request.user!.sub);
  }
}

@Controller('executions')
@UseGuards(JwtAuthGuard)
export class ExecutionsController {
  constructor(private readonly automations: AutomationsService) {}

  @Get()
  @RequirePermission('executions', 'read')
  list(@Req() request: AuthenticatedRequest, @Query('status') status?: string, @Query('automationId') automationId?: string) {
    return this.automations.listExecutions(request.user!.tenantId, status, automationId);
  }

  @Get(':executionId')
  @RequirePermission('executions', 'read')
  get(@Req() request: AuthenticatedRequest, @Param('executionId', ParseUUIDPipe) id: string) {
    return this.automations.getExecution(request.user!.tenantId, id);
  }
}
