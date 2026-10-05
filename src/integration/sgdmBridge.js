/**
 * Adapter de integração com o SGDM.
 * Em produção, o sistema principal injeta o contexto do usuário antes de
 * montar o módulo. O módulo não cria sessão nem coleta credenciais próprias.
 */
export function getSgdmContext() {
  const injected = window.__SGDM_CONTEXT__ || {};
  const stored = sessionStorage.getItem('sgdm-context');
  let parsed = {};
  try { parsed = stored ? JSON.parse(stored) : {}; } catch { parsed = {}; }
  return { ...parsed, ...injected };
}

export function getSgdmToken() {
  return getSgdmContext().accessToken || sessionStorage.getItem('sgdm-access-token') || '';
}
