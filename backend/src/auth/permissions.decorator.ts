import { SetMetadata } from '@nestjs/common';
export const PERMISSION_KEY = 'i7ai:permission';
export const RequirePermission = (resource: string, action: 'read' | 'write' | 'execute') =>
  SetMetadata(PERMISSION_KEY, resource + ':' + action);
