import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { KnowledgeModule } from '../knowledge/knowledge.module';
import { AiGatewayController } from './ai-gateway.controller';
import { AiGatewayService } from './ai-gateway.service';
import { ConversationsController } from './conversations.controller';
import { ToolsModule } from '../tools/tools.module';
import { McpModule } from '../mcp/mcp.module';
import { AgentToolsService } from './agent-tools.service';
import { AiQuotaService } from './ai-quota.service';

@Module({ imports: [AuthModule, KnowledgeModule, ToolsModule, McpModule], controllers: [AiGatewayController, ConversationsController], providers: [AiGatewayService, AgentToolsService, AiQuotaService], exports: [AiGatewayService] })
export class AiGatewayModule {}
