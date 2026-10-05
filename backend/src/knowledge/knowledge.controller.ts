import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, Req, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { IsOptional, IsUUID } from 'class-validator';
import { AuthenticatedRequest, JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequirePermission } from '../auth/permissions.decorator';
import { KnowledgeService } from './knowledge.service';
import { CreateKnowledgeBaseDto, UpdateDocumentDto, UpdateKnowledgeBaseDto, UploadDocumentDto } from './dto/knowledge.dto';
import { DOCUMENT_MAX_BYTES, DocumentUpload } from './document-extractor';

class DocumentQueryDto {
  @IsOptional() @IsUUID() knowledgeBaseId?: string;
}

@Controller()
@UseGuards(JwtAuthGuard)
export class KnowledgeController {
  constructor(private readonly knowledge: KnowledgeService) {}

  @Get('knowledge-bases') @RequirePermission('knowledge-bases', 'read')
  listBases(@Req() request: AuthenticatedRequest) { return this.knowledge.listBases(request.user!.tenantId); }

  @Post('knowledge-bases') @RequirePermission('knowledge-bases', 'write')
  createBase(@Req() request: AuthenticatedRequest, @Body() body: CreateKnowledgeBaseDto) {
    return this.knowledge.createBase(request.user!.tenantId, body, request.user!.sub);
  }

  @Patch('knowledge-bases/:id') @RequirePermission('knowledge-bases', 'write')
  updateBase(@Req() request: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string, @Body() body: UpdateKnowledgeBaseDto) {
    return this.knowledge.updateBase(request.user!.tenantId, id, body, request.user!.sub);
  }

  @Get('documents') @RequirePermission('documents', 'read')
  listDocuments(@Req() request: AuthenticatedRequest, @Query() query: DocumentQueryDto) {
    return this.knowledge.listDocuments(request.user!.tenantId, query.knowledgeBaseId);
  }

  @Post('documents/upload') @RequirePermission('documents', 'write')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: DOCUMENT_MAX_BYTES, files: 1 } }))
  upload(@Req() request: AuthenticatedRequest, @UploadedFile() file: DocumentUpload | undefined, @Body() body: UploadDocumentDto) {
    return this.knowledge.uploadDocument(request.user!.tenantId, file, body.knowledgeBaseId, request.user!.sub);
  }

  @Patch('documents/:id') @RequirePermission('documents', 'write')
  assignBase(@Req() request: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string, @Body() body: UpdateDocumentDto) {
    return this.knowledge.assignBase(request.user!.tenantId, id, body.knowledgeBaseId, request.user!.sub);
  }

  @Get('documents/:id/download') @RequirePermission('documents', 'read')
  download(@Req() request: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.knowledge.download(request.user!.tenantId, id);
  }

  @Delete('documents/:id') @RequirePermission('documents', 'write')
  remove(@Req() request: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.knowledge.removeDocument(request.user!.tenantId, id, request.user!.sub);
  }

  @Post('documents/:id/reprocess') @RequirePermission('documents', 'write')
  reprocess(@Req() request: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.knowledge.reprocess(request.user!.tenantId, id, request.user!.sub);
  }
}
