import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { AuthenticatedRequest, JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequirePermission } from '../auth/permissions.decorator';
import { AgentsService } from '../agents/agents.service';
import { CatalogService } from '../catalog/catalog.service';

@Controller('chat')
@UseGuards(JwtAuthGuard)
export class ChatCatalogController {
  constructor(private readonly agents: AgentsService, private readonly catalog: CatalogService) {}

  @Get('catalog') @RequirePermission('agents', 'execute')
  async list(@Req() request: AuthenticatedRequest) {
    const [agents, models] = await Promise.all([this.agents.list(request.user!.tenantId), this.catalog.models()]);
    return { agents: agents.filter(agent => agent.status === 'ACTIVE'), models };
  }
}
