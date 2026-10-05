import { Controller, Get, Param, ParseUUIDPipe, Query, Req, UseGuards } from '@nestjs/common';
import { IsOptional, IsUUID } from 'class-validator';
import { AuthenticatedRequest, JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequirePermission } from '../auth/permissions.decorator';
import { AiGatewayService } from './ai-gateway.service';

class ConversationQueryDto {
  @IsOptional() @IsUUID() agentId?: string;
}

@Controller('conversations')
@UseGuards(JwtAuthGuard)
export class ConversationsController {
  constructor(private readonly gateway: AiGatewayService) {}

  @Get() @RequirePermission('conversations', 'read')
  list(@Req() request: AuthenticatedRequest, @Query() query: ConversationQueryDto) {
    return this.gateway.listConversations(request.user!.tenantId, request.user!.sub, query.agentId);
  }

  @Get(':id') @RequirePermission('conversations', 'read')
  get(@Req() request: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.gateway.getConversation(request.user!.tenantId, request.user!.sub, id);
  }
}
