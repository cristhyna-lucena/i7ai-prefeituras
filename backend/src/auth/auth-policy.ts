export function validClaims(value: unknown): value is { sub: string; tenantId: string; email?: string } {
  const claims = value as Record<string, unknown> | null;
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return !!claims && typeof claims.sub === 'string' && uuid.test(claims.sub)
    && typeof claims.tenantId === 'string' && uuid.test(claims.tenantId);
}
export function permitted(permissions: string[], requirement: string): boolean {
  return permissions.includes('*') || permissions.includes(requirement)
    || permissions.includes(requirement.split(':')[0] + ':*');
}
