import { SelectableList, EmptyState, IconTile, Chip, Alert, Card, IconButton, Select, Textarea, FileButton, Button } from '@sgdm/design';
import { useEffect, useRef, useState } from 'react';
import { Plus, Send, Bot, Square, X, Download } from 'lucide-react';
import { apiRequest } from '../api/client';
import { consumeChatEvents } from '../api/event-stream.mjs';
import { usePermission } from '../api/permissions';
import { useApi } from '../hooks/useApi';
import { State, dateTime } from '../components/Common';

const imageExtensions = ['png', 'jpg', 'jpeg', 'webp'];
const statusLabels = { UPLOADING: 'Enviando', PROCESSING: 'Processando', READY: 'Pronto', FAILED: 'Falhou' };
const fileSize = size => Number(size) >= 1024 * 1024 ? (Number(size) / 1024 / 1024).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' MB' : Math.ceil(Number(size) / 1024) + ' KB';
function messageAttachments(message) {
  const relations = message.attachments?.map(item => item.document || item) || [];
  const files = relations.length ? relations : message.metadata?.attachments || [];
  return files.filter(file => file?.id);
}
function contextAttachments(current, messages) {
  const seen = new Set();
  const candidates = [...current, ...messages.slice(-40).reverse().flatMap(messageAttachments)];
  return candidates.filter(file => {
    if (!file?.id || seen.has(file.id)) return false;
    seen.add(file.id);
    return true;
  }).slice(0, 5);
}

export function ChatPage({ token, selectedAgentId, onSelectAgent }) {
  const canSend = usePermission('agents', 'execute');
  const canReadHistory = usePermission('conversations', 'read');
  const catalog = useApi(canSend ? '/chat/catalog' : '/agents', token, { agents: [], models: [] });
  const uploadCapabilities = useApi(canSend ? '/chat/attachments/capabilities' : null, token, { extensions: [], maxFiles: 5, maxBytes: 20 * 1024 * 1024, imageMaxBytes: 10 * 1024 * 1024 });
  const documentExtensions = (uploadCapabilities.data.extensions || []).filter(extension => !imageExtensions.includes(extension));
  const supportedImages = (uploadCapabilities.data.extensions || []).filter(extension => imageExtensions.includes(extension));
  const maxFiles = uploadCapabilities.data.maxFiles;
  const maxBytes = uploadCapabilities.data.maxBytes;
  const imageMaxBytes = uploadCapabilities.data.imageMaxBytes;
  const agents = Array.isArray(catalog.data) ? catalog.data : catalog.data.agents || [];
  const models = Array.isArray(catalog.data) ? [] : catalog.data.models || [];
  const conversations = useApi(canReadHistory ? '/conversations' : null, token);
  const [conversationId, setConversationId] = useState('');
  const [conversation, setConversation] = useState(null);
  const [modelId, setModelId] = useState('');
  const [messages, setMessages] = useState([]);
  const [query, setQuery] = useState('');
  const [attachments, setAttachments] = useState([]);
  const [pending, setPending] = useState(null);
  const [sending, setSending] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [error, setError] = useState('');
  const end = useRef(null);
  const request = useRef(null);
  const uploadRequests = useRef(new Map());
  const attachmentState = useRef([]);
  const scope = useRef(0);
  const currentAgentId = useRef(selectedAgentId);
  const agent = agents.find(item => item.id === selectedAgentId);
  const model = models.find(item => item.id === modelId) || (conversation?.modelId === modelId ? conversation.model : null);
  const supportsImages = model?.capabilities?.supportsVision && Number(model?.capabilities?.contextWindow) >= 4096;
  const canUseAgent = canSend && agent?.status === 'ACTIVE';
  const attachmentsBusy = attachments.some(file => file.status !== 'READY');
  const contextualAttachments = contextAttachments(attachments, messages);
  const historicalImages = contextualAttachments.some(file => file.mimeType?.startsWith('image/') && !attachments.some(current => current.id === file.id));
  const incompatibleImage = contextualAttachments.some(file => file.mimeType?.startsWith('image/')) && !supportsImages;
  const composerDisabled = sending || loadingHistory || !canUseAgent;
  const sendDisabled = composerDisabled || !query.trim() || !models.some(item => item.id === modelId) || attachmentsBusy || incompatibleImage;

  function updateAttachments(update) {
    const next = typeof update === 'function' ? update(attachmentState.current) : update;
    attachmentState.current = next;
    setAttachments(next);
  }
  function discardAttachments() {
    scope.current++;
    for (const controller of uploadRequests.current.values()) controller.abort();
    uploadRequests.current.clear();
    for (const file of attachmentState.current) {
      if (file.id) apiRequest('/chat/attachments/' + file.id, { token, method: 'DELETE' }).catch(() => {});
    }
    updateAttachments([]);
  }
  function resetChat(nextAgentId = selectedAgentId) {
    request.current?.abort();
    request.current = null;
    discardAttachments();
    setConversationId('');
    setConversation(null);
    setMessages([]);
    setPending(null);
    setQuery('');
    setError('');
    setSending(false);
    setLoadingHistory(false);
    const next = agents.find(item => item.id === nextAgentId);
    setModelId(next?.modelId || next?.models?.find(item => item.isPrimary)?.modelId || '');
  }
  function selectAgent(id) {
    currentAgentId.current = id;
    resetChat(id);
    onSelectAgent(id);
  }
  useEffect(() => {
    if (currentAgentId.current !== selectedAgentId) {
      currentAgentId.current = selectedAgentId;
      resetChat(selectedAgentId);
    }
  }, [selectedAgentId]);
  useEffect(() => {
    if (!modelId && !conversationId && agent) setModelId(agent.modelId || agent.models?.find(item => item.isPrimary)?.modelId || '');
  }, [agent]);
  useEffect(() => () => {
    scope.current++;
    request.current?.abort();
    for (const controller of uploadRequests.current.values()) controller.abort();
  }, [token]);
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [messages, pending, sending]);
  useEffect(() => {
    const processing = attachments.filter(file => file.id && file.status === 'PROCESSING');
    if (!processing.length) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      const results = await Promise.allSettled(processing.map(file => apiRequest('/chat/attachments/' + file.id, { token, signal: controller.signal })));
      if (controller.signal.aborted) return;
      results.forEach((result, index) => {
        const file = processing[index];
        updateAttachments(current => current.map(item => item.id !== file.id ? item : result.status === 'fulfilled' ? { ...item, ...result.value } : result.reason.status === 404 ? { ...item, status: 'FAILED', errorMessage: 'O anexo não está mais disponível. Remova-o e envie novamente.' } : { ...item, errorMessage: 'Não foi possível consultar o processamento. Tentando novamente...' }));
      });
    }, 1500);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [attachments, token]);

  async function openConversation(id) {
    if (sending) return;
    discardAttachments();
    const controller = new AbortController();
    request.current?.abort();
    request.current = controller;
    setLoadingHistory(true);
    setPending(null);
    setQuery('');
    setError('');
    try {
      const history = await apiRequest('/conversations/' + id, { token, signal: controller.signal });
      if (controller.signal.aborted || request.current !== controller) return;
      currentAgentId.current = history.agentId;
      onSelectAgent(history.agentId);
      setConversation(history);
      setConversationId(id);
      setMessages(history.messages || []);
      const latest = [...(history.messages || [])].reverse().find(message => message.metadata?.modelId);
      const defaultAgent = agents.find(item => item.id === history.agentId);
      setModelId(history.modelId || latest?.metadata.modelId || defaultAgent?.modelId || defaultAgent?.models?.find(item => item.isPrimary)?.modelId || '');
    } catch (caught) {
      if (caught.name !== 'AbortError' && request.current === controller) setError(caught.message);
    } finally {
      if (request.current === controller && !controller.signal.aborted) setLoadingHistory(false);
    }
  }
  async function upload(files) {
    if (composerDisabled || uploadCapabilities.loading || uploadCapabilities.error) return;
    setError('');
    const uploadScope = scope.current;
    const accepted = [];
    const errors = [];
    for (const file of files) {
      const extension = file.name.split('.').pop().toLowerCase();
      const image = imageExtensions.includes(extension);
      if (!documentExtensions.includes(extension) && !supportedImages.includes(extension)) { errors.push(file.name + ': formato não suportado. XLS e ZIP ainda não são processados no chat.'); continue; }
      if (image && !supportsImages) { errors.push(file.name + ': selecione um modelo que permita analisar imagens e tenha a janela de contexto configurada.'); continue; }
      if (!file.size) { errors.push(file.name + ': o arquivo está vazio.'); continue; }
      const limit = image ? Math.min(imageMaxBytes, maxBytes) : maxBytes;
      if (file.size > limit) { errors.push(file.name + ': excede o limite de ' + fileSize(limit) + '.'); continue; }
      if (attachmentState.current.length + accepted.length >= maxFiles) { errors.push('Anexe até ' + maxFiles + ' arquivos por mensagem.'); break; }
      accepted.push({ file, clientId: crypto.randomUUID() });
    }
    if (errors.length) setError(errors.join(' '));
    updateAttachments(current => [...current, ...accepted.map(({ file, clientId }) => ({ clientId, name: file.name, sizeBytes: file.size, mimeType: file.type, status: 'UPLOADING' }))]);
    await Promise.all(accepted.map(async ({ file, clientId }) => {
      const controller = new AbortController();
      uploadRequests.current.set(clientId, controller);
      try {
        const body = new FormData();
        body.append('file', file);
        const document = await apiRequest('/chat/attachments', { token, method: 'POST', body, signal: controller.signal });
        if (scope.current !== uploadScope || controller.signal.aborted) {
          if (document.id) await apiRequest('/chat/attachments/' + document.id, { token, method: 'DELETE' }).catch(() => {});
          return;
        }
        updateAttachments(current => current.map(item => item.clientId === clientId ? { ...item, ...document } : item));
      } catch (caught) {
        if (caught.name !== 'AbortError' && scope.current === uploadScope) updateAttachments(current => current.map(item => item.clientId === clientId ? { ...item, status: 'FAILED', errorMessage: caught.message } : item));
      } finally {
        uploadRequests.current.delete(clientId);
      }
    }));
  }
  async function removeAttachment(file) {
    const removalScope = scope.current;
    uploadRequests.current.get(file.clientId)?.abort();
    uploadRequests.current.delete(file.clientId);
    if (file.id) {
      try { await apiRequest('/chat/attachments/' + file.id, { token, method: 'DELETE' }); }
      catch (caught) { if (caught.status !== 404) { if (scope.current === removalScope) setError(caught.message); return; } }
    }
    if (scope.current !== removalScope) return;
    updateAttachments(current => current.filter(item => item.clientId !== file.clientId));
  }
  async function download(file) {
    try {
      const response = await apiRequest('/chat/attachments/' + file.id + '/download', { token, raw: true });
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement('a');
      link.href = url;
      link.download = file.name;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (caught) { setError(caught.message); }
  }
  async function send(event) {
    event?.preventDefault();
    if (sendDisabled) return;
    const question = query.trim();
    const files = [...attachments];
    const controller = new AbortController();
    request.current?.abort();
    request.current = controller;
    setSending(true);
    setError('');
    setPending({ question, answer: '', attachments: files });
    try {
      const response = await apiRequest('/agents/' + agent.id + '/chat/stream', {
        token, method: 'POST', body: { message: question, modelId, ...(conversationId ? { conversationId } : {}), ...(files.length ? { attachmentIds: files.map(file => file.id) } : {}) }, signal: controller.signal, raw: true
      });
      const result = await consumeChatEvents(response.body, text => {
        if (!controller.signal.aborted && request.current === controller) setPending(current => current ? { ...current, answer: current.answer + text } : null);
      });
      if (controller.signal.aborted || request.current !== controller) return;
      setConversationId(result.conversationId);
      setConversation(current => ({ ...current, agentId: agent.id, agent: { id: agent.id, name: agent.name }, modelId, model }));
      setMessages(current => [...current, ...result.messages]);
      setQuery('');
      updateAttachments([]);
      conversations.reload();
    } catch (caught) {
      if (caught.name !== 'AbortError' && request.current === controller) setError(caught.message);
    } finally {
      if (request.current === controller) { setSending(false); setPending(null); }
    }
  }
  function stop(event) {
    // The composer replaces this button with submit; suppress click activation first.
    event?.preventDefault();
    request.current?.abort();
    request.current = null;
    setSending(false);
    setPending(null);
    setError('Resposta interrompida. Sua pergunta e seus anexos continuam disponíveis para tentar novamente.');
  }
  const activeAgentName = agent?.name || conversation?.agent?.name;
  return <State loading={catalog.loading} error={catalog.error} retry={catalog.reload}>
    <div className="toolbar chat-selectors">
      <Select aria-label="Agente da conversa" label="Agente" value={selectedAgentId || ''} onChange={event => selectAgent(event.target.value)} disabled={sending}>
        <option value="">Selecione um agente</option>
        {agents.filter(item => item.status !== 'ARCHIVED').map(item => <option key={item.id} value={item.id}>{item.name}{item.status === 'DRAFT' ? ' (rascunho)' : ''}</option>)}
        {(!agent || agent.status === 'ARCHIVED') && conversation?.agent && <option value={conversation.agentId}>{conversation.agent.name}</option>}
      </Select>
      <Select aria-label="Modelo da conversa" label="Modelo" value={modelId} onChange={event => setModelId(event.target.value)} disabled={sending || loadingHistory || !canSend}>
        <option value="">Selecione um modelo</option>
        {models.map(item => <option key={item.id} value={item.id}>{item.name} · {item.provider?.name}</option>)}
        {modelId && !models.some(item => item.id === modelId) && <option value={modelId}>{model?.name || 'Modelo usado nesta conversa'}</option>}
      </Select>
    </div>
    <div className="chat-layout">
      <aside className="chat-list"><Card><div className="chat-list-head"><b>Conversas</b><IconButton aria-label="Nova conversa" disabled={sending} onClick={() => resetChat()} icon={<Plus size={18} />} type="button" /></div>
        {canReadHistory ? <State loading={conversations.loading} error={conversations.error} retry={conversations.reload} empty={!conversations.data.length && 'Suas conversas aparecerão aqui.'}>
          <SelectableList bare label="Suas conversas" items={conversations.data.map(item => ({ id: item.id, title: item.title || 'Nova conversa', description: [item.agent?.name, dateTime(item.updatedAt)].filter(Boolean).join(' · '), disabled: sending }))} value={conversationId} onChange={openConversation} />
        </State> : <p>Seu perfil não permite consultar o histórico de conversas.</p>}
      </Card></aside>
      <div className="chat-window"><Card title={activeAgentName || 'Nova conversa'} description={model ? model.name + (model.provider?.name ? ' · ' + model.provider.name : '') : 'Selecione o agente e o modelo para conversar.'} action={<IconTile icon={Bot} tone="primary" />}>
        <div className="messages" aria-live="polite">
          {loadingHistory ? <p role="status">Carregando conversa...</p> : !messages.length && !pending ? <EmptyState icon={Bot} title={activeAgentName ? 'Converse com ' + activeAgentName : 'Selecione um agente'} description={activeAgentName ? 'As respostas utilizarão as instruções e as bases vinculadas a este agente.' : 'Escolha um agente e um modelo para iniciar uma conversa.'} /> : messages.map(message => <div key={message.id} className={'message ' + (message.role === 'user' ? 'user' : 'agent')}><div>
            <span className="message-text">{message.content}</span>
            {!!messageAttachments(message).length && <div className="chat-message-files">{messageAttachments(message).map(file => <div className="chat-file" key={file.id}><span>{file.name}</span><IconButton type="button" aria-label={'Baixar ' + file.name} disabled={!canSend} icon={<Download size={15} />} onClick={() => download(file)} /></div>)}</div>}
            {message.metadata?.sources?.length > 0 && <div className="source-chips">{message.metadata.sources.map((source, index) => <Chip key={source.id || index}>Fonte: {source.documentName}</Chip>)}</div>}
            {message.role === 'assistant' && message.metadata?.model && <small>{message.metadata.modelName || message.metadata.model}{message.metadata.providerName ? ' · ' + message.metadata.providerName : ''}</small>}
            <small>{dateTime(message.createdAt)}</small>
          </div></div>)}
          {pending && <><div className="message user"><div><span className="message-text">{pending.question}</span>{!!pending.attachments.length && <div className="source-chips">{pending.attachments.map(file => <Chip key={file.id}>{file.name}</Chip>)}</div>}</div></div>{pending.answer && <div className="message agent"><div><span className="message-text">{pending.answer}</span><small>Respondendo...</small></div></div>}</>}
          {sending && !pending?.answer && <p role="status">O agente está preparando a resposta...</p>}<div ref={end} />
        </div>
        {error && <Alert tone="danger">{error}</Alert>}
        {!canSend && <p className="panel-note">Seu perfil permite consultar as conversas.</p>}
        {agent && agent.status !== 'ACTIVE' && <p className="panel-note">Ative o agente nas configurações para conversar.</p>}
        {canUseAgent && incompatibleImage && <Alert tone="danger">{historicalImages ? 'Esta conversa contém imagens. Selecione um modelo com análise de imagens e janela de contexto configuradas ou inicie uma nova conversa.' : 'Os anexos incluem imagens. Selecione um modelo com análise de imagens e janela de contexto configuradas ou remova esses arquivos.'}</Alert>}
        {canUseAgent && uploadCapabilities.error && <Alert tone="danger" actions={<Button type="button" variant="secondary" onClick={uploadCapabilities.reload}>Tentar carregar opções de anexo</Button>}>{uploadCapabilities.error}</Alert>}
        {!!attachments.length && <div className="chat-draft-files" aria-label="Anexos da mensagem">{attachments.map(file => <div key={file.clientId} className="chat-draft-file"><div><b>{file.name}</b><small>{fileSize(file.sizeBytes)} · {statusLabels[file.status] || file.status}</small>{file.errorMessage && <span className="document-error">{file.errorMessage}</span>}</div><IconButton type="button" aria-label={'Remover ' + file.name} disabled={sending} onClick={() => removeAttachment(file)} icon={<X size={16} />} /></div>)}</div>}
        <form className="chat-composer" onSubmit={send}>
          <FileButton onFiles={upload} accept={[...documentExtensions, ...(supportsImages ? supportedImages : [])].map(extension => '.' + extension).join(',')} multiple disabled={composerDisabled || attachments.length >= maxFiles || !modelId || uploadCapabilities.loading || !!uploadCapabilities.error} icon={<Plus size={18} />} variant="ghost"><span className="sr-only">Anexar arquivos</span></FileButton>
          <Textarea aria-label="Mensagem" value={query} onChange={event => setQuery(event.target.value)} onKeyDown={event => {
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); send(); }
          }} placeholder="Digite sua mensagem..." disabled={composerDisabled} maxLength={16000} rows={2} />
          {sending ? <IconButton key="stop" type="button" aria-label="Interromper resposta" onClick={stop} icon={<Square size={15} />} /> : <IconButton key="send" type="submit" aria-label="Enviar mensagem" disabled={sendDisabled} icon={<Send size={16} />} />}
        </form>
        {canUseAgent && <p className="chat-hint">Enter para enviar · Shift+Enter para nova linha. Até {maxFiles} arquivos: documentos de até {fileSize(maxBytes)}{supportsImages ? ' e imagens de até ' + fileSize(Math.min(imageMaxBytes, maxBytes)) : ''}.</p>}
      </Card></div>
    </div>
  </State>;
}
