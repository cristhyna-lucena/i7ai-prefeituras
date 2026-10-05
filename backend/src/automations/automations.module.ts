import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AutomationsController, ExecutionsController } from './automations.controller';
import { AutomationsService } from './automations.service';
import { AiGatewayModule } from '../ai/ai-gateway.module';
import { ToolsModule } from '../tools/tools.module';

@Module({ imports: [AuthModule, AiGatewayModule, ToolsModule], controllers: [AutomationsController, ExecutionsController], providers: [AutomationsService], exports: [AutomationsService] })
export class AutomationsModule {}
