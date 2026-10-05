import { Controller, Delete, Get, Param, ParseUUIDPipe, Post, Req, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthenticatedRequest, JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequirePermission } from '../auth/permissions.decorator';
import { KnowledgeService } from '../knowledge/knowledge.service';
import { CHAT_ATTACHMENT_MAX_BYTES, chatAttachmentCapabilities } from '../knowledge/chat-attachment-validation';
import { DocumentUpload } from '../knowledge/document-extractor';

@Controller('chat/attachments')
@UseGuards(JwtAuthGuard)
export class ChatAttachmentsController {
  constructor(private readonly knowledge: KnowledgeService) {}

  @Get('capabilities') @RequirePermission('agents', 'execute')
  capabilities() { return chatAttachmentCapabilities(); }

  @Post() @RequirePermission('agents', 'execute')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: CHAT_ATTACHMENT_MAX_BYTES, files: 1, fields: 0, parts: 1 } }))
  upload(@Req() request: AuthenticatedRequest, @UploadedFile() file: DocumentUpload | undefined) {
    return this.knowledge.uploadChatAttachment(request.user!.tenantId, request.user!.sub, file);
  }

  @Get(':id') @RequirePermission('agents', 'execute')
  get(@Req() request: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.knowledge.getChatAttachment(request.user!.tenantId, request.user!.sub, id);
  }

  @Get(':id/download') @RequirePermission('agents', 'execute')
  download(@Req() request: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.knowledge.downloadChatAttachment(request.user!.tenantId, request.user!.sub, id);
  }

  @Delete(':id') @RequirePermission('agents', 'execute')
  remove(@Req() request: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.knowledge.removeChatAttachment(request.user!.tenantId, request.user!.sub, id);
  }
}
