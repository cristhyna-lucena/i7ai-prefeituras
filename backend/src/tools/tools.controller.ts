import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { AuthenticatedRequest, JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ToolsService } from './tools.service';
import { CreateToolDto, ExecuteToolDto, UpdateToolDto } from './tools.dto';
import { RequirePermission } from '../auth/permissions.decorator';

@Controller('tools')
@UseGuards(JwtAuthGuard)
export class ToolsController {
  constructor(private readonly tools: ToolsService) {}

  @Get()
  @RequirePermission('tools', 'read')
  list(@Req() request: AuthenticatedRequest) {
    return this.tools.list(request.user!.tenantId);
  }

  @Post() @RequirePermission('tools', 'write')
  create(@Req() request: AuthenticatedRequest, @Body() input: CreateToolDto) { return this.tools.create(request.user!.tenantId, input, request.user!.sub); }

  @Patch(':id') @RequirePermission('tools', 'write')
  update(@Req() request: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string, @Body() input: UpdateToolDto) { return this.tools.update(request.user!.tenantId, id, input, request.user!.sub); }

  @Post(':id/test') @RequirePermission('tools', 'execute')
  test(@Req() request: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string, @Body() input: ExecuteToolDto) { return this.tools.execute(request.user!.tenantId, input.agentId, id, input.input); }
}
