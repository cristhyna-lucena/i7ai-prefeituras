import { Alert, Button, Card, Input, Select } from "@sgdm/design";
import { useState } from 'react';
import { apiRequest } from '../api/client';
import { usePermission } from '../api/permissions';
import { useApi } from '../hooks/useApi';
import { Modal, PageActions, State, Status, Table, dateTime } from '../components/Common';
export function LicensePage({
  token,
  platformAdmin,
  notify
}) {
  const resource = useApi('/licensing', token, null),
    [editing, setEditing] = useState(false);
  const canWrite = usePermission('licensing', 'write') && platformAdmin;
  const license = resource.data?.license,
    usage = resource.data?.usage;
  return <>
    <PageActions label={license ? 'Editar licença' : 'Cadastrar licença'} onCreate={!resource.loading && !resource.error && canWrite ? () => setEditing(true) : null} />
    <State loading={resource.loading} error={resource.error} retry={resource.reload} empty={!license && 'Nenhuma licença cadastrada. Solicite a configuração ao administrador da plataforma.'}>
      {license && <div><Card><Table headers={['Status', 'Usuários', 'Agentes', 'Automações', 'Bases']} rows={[[<Status value={license.status} />, usage.users + ' / ' + license.maxUsers, usage.agents + ' / ' + license.maxAgents, usage.automations + ' / ' + license.maxAutomations, usage.knowledgeBases + ' / ' + license.maxKnowledgeBases]]} />
        <Table headers={['Tokens no mês', 'Armazenamento', 'Início', 'Fim']} rows={[[Number(usage.tokensThisMonth).toLocaleString('pt-BR') + ' / ' + Number(license.maxTokens).toLocaleString('pt-BR'), (Number(usage.storageBytes) / 1024 / 1024).toFixed(1) + ' MB / ' + (Number(license.maxStorageBytes) / 1024 / 1024 / 1024).toFixed(1) + ' GB', dateTime(license.startDate), license.endDate ? dateTime(license.endDate) : 'Sem data final']]} />
        {Number(usage.reservedTokens || 0) > 0 && <Alert tone="warning">{Number(usage.reservedTokens).toLocaleString('pt-BR')} tokens reservados para chamadas em andamento ou interrompidas sem confirmação de consumo. As reservas também são consideradas no limite.</Alert>}
        <p className="panel-note">Os limites são gerenciados pelo administrador da plataforma. O consumo mostrado usa o mês em UTC. O bloqueio da quota considera também o início da licença.</p></Card></div>}
    </State>
    {editing && <LicenseEditor token={token} license={license} onClose={() => setEditing(false)} onSaved={() => {
      setEditing(false);
      resource.reload();
      notify('Licença salva.');
    }} />}
  </>;
}
function localDate(value) {
  if (!value) return '';
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
function LicenseEditor({
  token,
  license,
  onClose,
  onSaved
}) {
  const [form, setForm] = useState({
    status: license?.status || 'ACTIVE',
    startDate: localDate(license?.startDate || new Date().toISOString()),
    endDate: localDate(license?.endDate),
    maxUsers: license?.maxUsers ?? 1,
    maxAgents: license?.maxAgents ?? 0,
    maxAutomations: license?.maxAutomations ?? 0,
    maxKnowledgeBases: license?.maxKnowledgeBases ?? 0,
    maxTokens: license?.maxTokens ?? '0',
    maxStorageBytes: license?.maxStorageBytes ?? '0'
  });
  const [saving, setSaving] = useState(false),
    [error, setError] = useState('');
  const set = (key, value) => setForm(current => ({
    ...current,
    [key]: value
  }));
  async function save(event) {
    event.preventDefault();
    setError('');
    setSaving(true);
    try {
      const startDate = new Date(form.startDate),
        endDate = form.endDate ? new Date(form.endDate) : null;
      if (endDate && endDate <= startDate) throw new Error('A data final deve ser posterior à data inicial.');
      await apiRequest('/licensing', {
        token,
        method: 'PATCH',
        body: {
          ...form,
          startDate: startDate.toISOString(),
          endDate: endDate?.toISOString() || null,
          maxUsers: Number(form.maxUsers),
          maxAgents: Number(form.maxAgents),
          maxAutomations: Number(form.maxAutomations),
          maxKnowledgeBases: Number(form.maxKnowledgeBases),
          maxTokens: String(form.maxTokens),
          maxStorageBytes: String(form.maxStorageBytes)
        }
      });
      onSaved();
    } catch (error) {
      setError(error.message);
    } finally {
      setSaving(false);
    }
  }
  return <Modal title={license ? 'Editar licença' : 'Cadastrar licença'} onClose={onClose}><form onSubmit={save}><div className="form">{error && <Alert tone="danger">{error}</Alert>}
    <Select value={form.status} onChange={event => set('status', event.target.value)} label={<>Status</>}><option value="ACTIVE">Ativa</option><option value="SUSPENDED">Suspensa</option><option value="EXPIRED">Expirada</option></Select>
    <div className="form-grid"><Input type="datetime-local" required value={form.startDate} onChange={event => set('startDate', event.target.value)} label={<>Início</>} /><Input type="datetime-local" value={form.endDate} onChange={event => set('endDate', event.target.value)} label={<>Fim (opcional)</>} /></div><small>Datas no fuso horário deste computador.</small>
    <div className="form-grid">{[['maxUsers', 'Usuários'], ['maxAgents', 'Agentes'], ['maxAutomations', 'Automações'], ['maxKnowledgeBases', 'Bases de conhecimento']].map(([key, label]) => <Input required type="number" min="0" max="1000000" step="1" value={form[key]} onChange={event => set(key, event.target.value)} label={<>{label}</>} key={key} />)}</div>
    <Input required inputMode="numeric" pattern="[0-9]+" maxLength={19} value={form.maxTokens} onChange={event => set('maxTokens', event.target.value)} label={<>Tokens por mês</>} />
    <Input required inputMode="numeric" pattern="[0-9]+" maxLength={19} value={form.maxStorageBytes} onChange={event => set('maxStorageBytes', event.target.value)} label={<>Armazenamento máximo (bytes)</>} hint={<>1 GB = 1.073.741.824 bytes</>} />
    </div><div className="modal-actions"><Button type="button" onClick={onClose} variant="secondary">Cancelar</Button><Button disabled={saving} variant="primary" type="submit">{saving ? 'Salvando...' : 'Salvar licença'}</Button></div></form></Modal>;
}
