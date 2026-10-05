import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { InsightsController } from './insights.controller';
@Module({ imports:[AuthModule],controllers:[InsightsController] })
export class InsightsModule {}
