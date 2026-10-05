import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { AgentsService } from './agents.service';
import { CreateAgentDto, UpdateAgentDto } from './dto/create-agent.dto';
import { RequirePermission } from '../auth/permissions.decorator';
import { AuthenticatedRequest, JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('agents')
@UseGuards(JwtAuthGuard)
export class AgentsController {
  constructor(private readonly agents: AgentsService) {}

  @Get()
  @RequirePermission('agents', 'read')
  list(@Req() request: AuthenticatedRequest) {
    return this.agents.list(request.user!.tenantId);
  }

  @Post()
  @RequirePermission('agents', 'write')
  create(@Req() request: AuthenticatedRequest, @Body() body: CreateAgentDto) {
    return this.agents.create(request.user!.tenantId, body, request.user!.sub);
  }

  @Get(':id')
  @RequirePermission('agents', 'read')
  get(@Req() request: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.agents.get(request.user!.tenantId, id);
  }

  @Patch(':id')
  @RequirePermission('agents', 'write')
  update(@Req() request: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string, @Body() body: UpdateAgentDto) {
    return this.agents.update(request.user!.tenantId, id, body, request.user!.sub);
  }
}
