import React, { Children, cloneElement, isValidElement, useCallback, useEffect, useId, useRef } from 'react';
import { Plus, RefreshCw } from 'lucide-react';
import { Button, EmptyState, ErrorState, LoadingState, Modal as SgdmModal, StatusBadge, Table as SgdmTable } from '@sgdm/design';

// Adapters translate application data only; appearance belongs to @sgdm/design.
export function State({ loading, error, empty, children, retry }) {
  if (loading) return <LoadingState />;
  if (error) return <ErrorState error={error} action={retry && <Button variant="secondary" icon={<RefreshCw size={16} />} onClick={retry}>Tentar novamente</Button>} />;
  if (empty) return <EmptyState title={empty} />;
  return children;
}
const labels = { ACTIVE:'Ativo', DRAFT:'Rascunho', ARCHIVED:'Arquivado', INACTIVE:'Inativo', PAUSED:'Pausado', READY:'Processado', FAILED:'Falhou', UPLOADED:'Enviado', PROCESSING:'Processando', PENDING:'Pendente', RUNNING:'Executando', SUCCESS:'Concluído', CANCELLED:'Cancelado', SUSPENDED:'Suspenso', INVITED:'Convidado', EXPIRED:'Expirado' };
export const statusColors = {
  ACTIVE:'bg-emerald-100 text-emerald-800', READY:'bg-emerald-100 text-emerald-800', SUCCESS:'bg-emerald-100 text-emerald-800',
  FAILED:'bg-red-100 text-red-800', SUSPENDED:'bg-red-100 text-red-800', EXPIRED:'bg-red-100 text-red-800',
  RUNNING:'bg-blue-100 text-blue-800', PROCESSING:'bg-blue-100 text-blue-800', PENDING:'bg-blue-100 text-blue-800', UPLOADED:'bg-blue-100 text-blue-800',
  PAUSED:'bg-amber-100 text-amber-800', DRAFT:'bg-slate-100 text-slate-700', INACTIVE:'bg-slate-100 text-slate-700', ARCHIVED:'bg-slate-100 text-slate-700', CANCELLED:'bg-slate-100 text-slate-700', INVITED:'bg-amber-100 text-amber-800',
};
export function Status({ value }) { return <StatusBadge status={value} labels={labels} colors={statusColors} size="sm" case="normal" />; }
export function Modal({ title, onClose, close, children, wide = false, busy = false }) {
  const content = useRef(null);
  const opener = useRef(typeof document === 'undefined' ? null : document.activeElement);
  const formId = useId();
  const callback = useRef(onClose || close);
  const saving = useRef(busy);
  callback.current = onClose || close;
  saving.current = busy;
  const dismiss = useCallback(() => { if (!saving.current) callback.current(); }, []);
  useEffect(() => {
    // Start on an application control so reverse Tab stays inside the official trap.
    content.current?.querySelector('input:not([disabled]),select:not([disabled]),textarea:not([disabled]),button:not([disabled])')?.focus();
    return () => { queueMicrotask(() => { if (opener.current?.isConnected) opener.current.focus(); }); };
  }, []);
  let footer;
  const body = Children.map(children, child => {
    if (!isValidElement(child)) return child;
    if (child.props.className === 'modal-actions') { footer = child.props.children; return null; }
    if (child.type !== 'form') return child;
    const fields = Children.map(child.props.children, field => {
      if (isValidElement(field) && field.props.className === 'modal-actions') {
        footer = Children.map(field.props.children, button => isValidElement(button) && button.props.type === 'submit' ? cloneElement(button, { form:formId }) : button);
        return null;
      }
      return field;
    });
    return cloneElement(child, { id:formId }, fields);
  });
  return <SgdmModal open title={title} onClose={dismiss} size={wide || close ? 'lg' : 'md'} footer={footer}><div ref={content}>{body}</div></SgdmModal>;
}
export function Table({ headers, rows }) {
  return <SgdmTable bare caption={headers.join(' · ')} columns={headers.map((header, index) => ({ key:String(index), header, render:row => row[index] }))} rows={rows} />;
}
export function PageActions({ label, onCreate, children }) {
  return <div className="page-actions">{children}{onCreate && <Button icon={<Plus size={16} />} onClick={onCreate}>{label}</Button>}</div>;
}
export const initials = name => (name || '?').split(' ').filter(Boolean).map(word => word[0]).slice(0,2).join('').toUpperCase();
export const dateTime = value => value ? new Date(value).toLocaleString('pt-BR', { timeZone:'America/Cuiaba' }) : '—';
