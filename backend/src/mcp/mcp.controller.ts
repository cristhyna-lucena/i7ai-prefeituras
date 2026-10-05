import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import { McpService } from './mcp.service';
import { AuthenticatedRequest, JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequirePermission } from '../auth/permissions.decorator';
import { IsNotEmpty, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

class CallMcpDto {
  @IsString() @IsNotEmpty() @MaxLength(200) name!: string;
  @IsOptional() @IsObject() arguments?: Record<string, unknown>;
}

@Controller('agents/:agentId/mcp')
@UseGuards(JwtAuthGuard)
export class McpController {
  constructor(private readonly mcp: McpService) {}

  @Get(':toolId/tools')
  @RequirePermission('tools', 'execute')
  discover(
    @Param('agentId', ParseUUIDPipe) agentId: string,
    @Param('toolId', ParseUUIDPipe) toolId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.mcp.discover(toolId, agentId, request.user!.tenantId);
  }

  @Post(':toolId/call') @RequirePermission('tools', 'execute')
  call(@Param('agentId', ParseUUIDPipe) agentId: string, @Param('toolId', ParseUUIDPipe) toolId: string,
    @Req() request: AuthenticatedRequest, @Body() body: CallMcpDto) {
    return this.mcp.call(toolId, agentId, request.user!.tenantId, body.name, body.arguments ?? {});
  }
}
