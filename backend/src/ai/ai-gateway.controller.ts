import { Body, Controller, HttpException, Param, ParseUUIDPipe, Post, Req, Res, UseGuards } from '@nestjs/common';
import { AuthenticatedRequest, JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AiGatewayService } from './ai-gateway.service';
import { ChatDto } from './dto/chat.dto';
import { RequirePermission } from '../auth/permissions.decorator';

type SseResponse = {
  setHeader(name: string, value: string): void;
  flushHeaders(): void;
  write(data: string): boolean;
  end(): void;
  on(event: 'close', listener: () => void): unknown;
  off(event: 'close', listener: () => void): unknown;
  writableEnded: boolean;
  destroyed: boolean;
};

@Controller('agents/:agentId')
@UseGuards(JwtAuthGuard)
export class AiGatewayController {
  constructor(private readonly gateway: AiGatewayService) {}

  @Post('chat')
  @RequirePermission('agents', 'execute')
  chat(@Param('agentId', ParseUUIDPipe) agentId: string, @Req() request: AuthenticatedRequest, @Body() body: ChatDto) {
    return this.gateway.chat(agentId, request.user!.tenantId, body, request.user!.sub);
  }

  @Post('chat/stream')
  @RequirePermission('agents', 'execute')
  async stream(@Param('agentId', ParseUUIDPipe) agentId: string, @Req() request: AuthenticatedRequest, @Body() body: ChatDto, @Res() response: SseResponse) {
    const abort = new AbortController();
    const disconnected = () => abort.abort(new DOMException('O cliente encerrou a conexão.', 'AbortError'));
    response.on('close', disconnected);
    response.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Connection', 'keep-alive');
    response.setHeader('X-Accel-Buffering', 'no');
    response.flushHeaders();
    const emit = (event: string, payload: unknown) => {
      if (!abort.signal.aborted && !response.writableEnded && !response.destroyed) response.write('event: ' + event + '\ndata: ' + JSON.stringify(payload) + '\n\n');
    };
    const heartbeat = setInterval(() => {
      if (!abort.signal.aborted && !response.writableEnded && !response.destroyed) response.write(': heartbeat\n\n');
    }, 15000);
    try {
      await this.gateway.chatStream(agentId, request.user!.tenantId, body, request.user!.sub, emit, abort.signal);
    } catch (error) {
      if (!abort.signal.aborted) emit('error', { message: error instanceof HttpException ? error.message : 'Não foi possível concluir a resposta de IA. Tente novamente.' });
    } finally {
      clearInterval(heartbeat);
      response.off('close', disconnected);
      if (!response.writableEnded && !response.destroyed) response.end();
    }
  }
}
