import type { JwtVerifyOptions } from '@nestjs/jwt';

export const LOCAL_JWT_ISSUER = 'i7ai-local';
export const LOCAL_JWT_AUDIENCE = 'i7ai-api';

export function tokenVerificationOptions(decoded: unknown, env: NodeJS.ProcessEnv = process.env): JwtVerifyOptions {
  const isLocal = !!decoded && typeof decoded === 'object' && (decoded as Record<string, unknown>).iss === LOCAL_JWT_ISSUER;
  const fallback = env.NODE_ENV !== 'production' ? 'local-development-only' : undefined;
  if (isLocal) {
    throw new Error('A autenticação é fornecida exclusivamente pelo SGDM.');
  }
  if (!env.SGDM_JWT_SECRET && !env.JWT_SECRET && !fallback) throw new Error('SGDM JWT secret is missing');
  return {
    secret: env.SGDM_JWT_SECRET || env.JWT_SECRET || fallback,
    algorithms: ['HS256'],
    ...(env.SGDM_JWT_ISSUER ? { issuer: env.SGDM_JWT_ISSUER } : {}),
    ...(env.SGDM_JWT_AUDIENCE ? { audience: env.SGDM_JWT_AUDIENCE } : {}),
  };
}
