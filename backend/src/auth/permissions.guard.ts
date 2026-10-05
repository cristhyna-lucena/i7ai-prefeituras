import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtAuthGuard, AuthenticatedRequest } from './jwt-auth.guard';
import { PERMISSION_KEY } from './permissions.decorator';
import { permitted } from './auth-policy';
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector, private readonly auth: JwtAuthGuard) {}
  async canActivate(context: ExecutionContext) {
    const requirement = this.reflector.getAllAndOverride<string>(PERMISSION_KEY, [context.getHandler(), context.getClass()]);
    if (!requirement) return true;
    await this.auth.canActivate(context);
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!permitted(request.user?.permissions ?? [], requirement)) throw new ForbiddenException('Seu perfil não possui permissão para esta operação.');
    return true;
  }
}
