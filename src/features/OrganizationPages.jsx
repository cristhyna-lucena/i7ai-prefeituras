import { Alert, Button, Card, Checkbox, FormSection, Input, Select, Textarea } from "@sgdm/design";
import { useState } from 'react';
import { Pencil, Save } from 'lucide-react';
import { apiRequest } from '../api/client';
import { usePermission } from '../api/permissions';
import { useApi } from '../hooks/useApi';
import { Modal, PageActions, State, Status, Table } from '../components/Common';
export function OrganizationPage({
  token,
  active,
  notify
}) {
  const canWrite = usePermission(active, 'write');
  const path = {
    models: '/models',
    users: '/users',
    departments: '/departments',
    settings: '/settings',
    licensing: '/licensing'
  }[active];
  const resource = useApi(path, token, active === 'settings' ? null : []);
  const [editor, setEditor] = useState(null);
  const roles = useApi(active === 'users' && canWrite ? '/roles' : null, token),
    departments = useApi(active === 'users' && canWrite ? '/departments' : null, token);
  if (active === 'settings') return <State loading={resource.loading} error={resource.error} retry={resource.reload}>{resource.data && <SettingsForm key={JSON.stringify(resource.data)} token={token} data={resource.data} notify={notify} onSaved={resource.reload} readOnly={!canWrite} />}</State>;
  if (active === 'licensing') {
    const item = resource.data?.license,
      usage = resource.data?.usage;
    return <State loading={resource.loading} error={resource.error} retry={resource.reload} empty={!item && 'Nenhuma licença cadastrada. Solicite a configuração ao administrador da plataforma.'}>{item && <div><Card><Table headers={['Status', 'Usuários', 'Agentes', 'Automações', 'Tokens', 'Armazenamento']} rows={[[<Status value={item.status} />, usage.users + ' / ' + item.maxUsers, usage.agents + ' / ' + item.maxAgents, usage.automations + ' / ' + item.maxAutomations, Number(usage.tokensThisMonth).toLocaleString('pt-BR') + ' / ' + Number(item.maxTokens).toLocaleString('pt-BR'), (Number(usage.storageBytes) / 1024 / 1024).toFixed(1) + ' MB / ' + (Number(item.maxStorageBytes) / 1024 / 1024 / 1024).toFixed(1) + ' GB']]} /><p className="panel-note">Os limites são gerenciados pelo administrador da plataforma.</p></Card></div>}</State>;
  }
  const isUsers = active === 'users',
    isDepartments = active === 'departments';
  return <>
    {(isUsers || isDepartments) && <PageActions label={isUsers ? 'Novo usuário' : 'Novo departamento'} onCreate={canWrite ? () => setEditor({}) : null} />}
    <State loading={resource.loading} error={resource.error} retry={resource.reload} empty={!resource.data.length && 'Nenhum registro cadastrado.'}><div><Card><Table headers={isUsers ? ['Nome', 'E-mail', 'Departamento', 'Perfis', 'Status', 'Ações'] : isDepartments ? ['Departamento', 'Descrição', 'Status', 'Ações'] : ['Modelo', 'Provedor', 'Identificador', 'Preços configurados']} rows={resource.data.map(item => isUsers ? [<b>{item.name}</b>, item.email, item.department?.name || '—', item.roles?.map(link => link.role?.name || link.name).join(', ') || 'Sem perfil', <Status value={item.status} />, <Button disabled={!canWrite} onClick={() => setEditor(item)} variant="link" icon={<Pencil size={14} />} type="button">Editar</Button>] : isDepartments ? [<b>{item.name}</b>, item.description || '—', <Status value={item.status} />, <Button disabled={!canWrite} onClick={() => setEditor(item)} variant="link" icon={<Pencil size={14} />} type="button">Editar</Button>] : [<b>{item.name}</b>, item.provider?.name, item.slug, item.inputPrice != null && item.outputPrice != null ? 'Sim' : 'Não'])} /></Card></div></State>
    {canWrite && editor && <RecordEditor token={token} record={editor} users={isUsers} roles={roles.data} departments={departments.data} onClose={() => setEditor(null)} onSaved={() => {
      setEditor(null);
      resource.reload();
      notify('Registro salvo.');
    }} />}
  </>;
}
function RecordEditor({
  token,
  record,
  users,
  roles,
  departments,
  onClose,
  onSaved
}) {
  const canWrite = usePermission(users ? 'users' : 'departments', 'write');
  const [form, setForm] = useState({
    name: record.name || '',
    description: record.description || '',
    email: record.email || '',
    departmentId: record.departmentId || '',
    status: record.status || 'ACTIVE',
    roleIds: record.roleIds || record.roles?.map(link => link.roleId || link.id) || []
  });
  const [error, setError] = useState(''),
    [saving, setSaving] = useState(false);
  const set = (key, value) => setForm(current => ({
    ...current,
    [key]: value
  }));
  async function save(event) {
    event.preventDefault();
    if (!canWrite) return;
    setSaving(true);
    try {
      const body = users ? {
        name: form.name,
        email: form.email,
        status: form.status,
        departmentId: form.departmentId || null,
        roleIds: form.roleIds
      } : {
        name: form.name,
        description: form.description,
        status: form.status
      };
      await apiRequest((users ? '/users' : '/departments') + (record.id ? '/' + record.id : ''), {
        token,
        method: record.id ? 'PATCH' : 'POST',
        body
      });
      onSaved();
    } catch (error) {
      setError(error.message);
    } finally {
      setSaving(false);
    }
  }
  return <Modal title={(record.id ? 'Editar ' : 'Novo ') + (users ? 'usuário' : 'departamento')} onClose={onClose}><form onSubmit={save}><div className="form">{error && <Alert tone="danger">{error}</Alert>}<Input required value={form.name} onChange={event => set('name', event.target.value)} label={<>Nome</>} />{users ? <><Input required type="email" value={form.email} onChange={event => set('email', event.target.value)} label={<>E-mail</>} /><Alert tone="info">Este cadastro define a identidade e as permissões. O módulo não cria senhas de acesso.</Alert><Select value={form.departmentId} onChange={event => set('departmentId', event.target.value)} label={<>Departamento</>}><option value="">Sem departamento</option>{departments.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</Select><FormSection title={<>Perfis de acesso</>}>{roles.map(role => <Checkbox checked={form.roleIds.includes(role.id)} onChange={() => set('roleIds', form.roleIds.includes(role.id) ? form.roleIds.filter(id => id !== role.id) : [...form.roleIds, role.id])} label={<>{role.name}</>} key={role.id} />)}</FormSection></> : <Textarea value={form.description} onChange={event => set('description', event.target.value)} label={<>Descrição</>} />}<Select value={form.status} onChange={event => set('status', event.target.value)} label={<>Status</>}>{(users ? ['ACTIVE', 'INVITED', 'SUSPENDED'] : ['ACTIVE', 'INACTIVE']).map(status => <option key={status} value={status}>{status === 'ACTIVE' ? 'Ativo' : status === 'INVITED' ? 'Convidado' : status === 'SUSPENDED' ? 'Suspenso' : 'Inativo'}</option>)}</Select></div><div className="modal-actions"><Button type="button" onClick={onClose} variant="secondary">Cancelar</Button><Button disabled={!canWrite || saving} variant="primary" type="submit">{saving ? 'Salvando...' : 'Salvar'}</Button></div></form></Modal>;
}
function SettingsForm({
  token,
  data,
  notify,
  onSaved,
  readOnly = false
}) {
  const [form, setForm] = useState({
    organizationName: data.settings?.organizationName || data.name,
    timezone: data.settings?.timezone || 'America/Cuiaba',
    locale: data.settings?.locale || 'pt-BR',
    retentionDays: data.settings?.retentionDays || ''
  });
  const [error, setError] = useState(''),
    [saving, setSaving] = useState(false);
  async function save(event) {
    event.preventDefault();
    if (readOnly) return;
    setSaving(true);
    try {
      await apiRequest('/settings', {
        token,
        method: 'PATCH',
        body: { ...form, retentionDays: form.retentionDays === '' ? null : form.retentionDays }
      });
      notify('Configurações salvas.');
      onSaved();
    } catch (error) {
      setError(error.message);
    } finally {
      setSaving(false);
    }
  }
  return <Card><form onSubmit={save} className="form">{error && <Alert tone="danger">{error}</Alert>}<Input required disabled={readOnly || saving} value={form.organizationName} onChange={event => setForm({
        ...form,
        organizationName: event.target.value
      })} label={<>Nome da organização</>} /><Select disabled={readOnly || saving} value={form.timezone} onChange={event => setForm({
        ...form,
        timezone: event.target.value
      })} label={<>Fuso horário</>}>{['America/Cuiaba', 'America/Sao_Paulo', 'America/Manaus', 'America/Rio_Branco'].map(zone => <option key={zone}>{zone}</option>)}</Select><Select disabled={readOnly || saving} value={form.locale} onChange={event => setForm({
        ...form,
        locale: event.target.value
      })} label={<>Idioma</>}><option value="pt-BR">Português (Brasil)</option></Select><Input disabled={readOnly || saving} type="number" min="1" max="3650" value={form.retentionDays} onChange={event => setForm({
        ...form,
        retentionDays: event.target.value === '' ? '' : Number(event.target.value)
      })} label={<>Retenção de conversas e dados de execução (dias)</>} /><Alert tone="info">Após salvar um prazo, a rotina diária remove conversas antigas e limpa entradas, saídas e erros de execuções encerradas. Cadastros, documentos, auditoria e consumo são preservados. Sem prazo configurado, a limpeza fica desativada.</Alert>{!readOnly && <Button disabled={saving} variant="primary" icon={<Save size={16} />} type="submit">{saving ? 'Salvando...' : 'Salvar configurações'}</Button>}</form></Card>;
}
