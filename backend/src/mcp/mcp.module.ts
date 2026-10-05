import { Module } from '@nestjs/common';
import { McpController } from './mcp.controller';
import { McpService } from './mcp.service';
import { AuthModule } from '../auth/auth.module';
import { ToolsModule } from '../tools/tools.module';

@Module({ imports: [AuthModule, ToolsModule], controllers: [McpController], providers: [McpService], exports: [McpService] })
export class McpModule {}
