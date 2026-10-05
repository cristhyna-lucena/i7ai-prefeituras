import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { KnowledgeController } from './knowledge.controller';
import { KnowledgeService } from './knowledge.service';
import { DocumentPipelineService } from './document-pipeline.service';
import { RagController } from './rag.controller';
import { RagService } from './rag.service';
import { EmbeddingService } from './embedding.service';

@Module({ imports: [AuthModule], controllers: [KnowledgeController, RagController], providers: [KnowledgeService, DocumentPipelineService, RagService, EmbeddingService], exports: [RagService] })
export class KnowledgeModule {}
