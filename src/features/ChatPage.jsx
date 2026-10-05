import { SelectableList, EmptyState, IconTile, Chip, Alert, Card, IconButton, Input, Select } from "@sgdm/design";
import { useEffect, useRef, useState } from 'react';
import { Plus, Send, Bot, Square } from 'lucide-react';
import { apiRequest } from '../api/client';
import { consumeChatEvents } from '../api/event-stream.mjs';
import { usePermission } from '../api/permissions';
import { useApi } from '../hooks/useApi';
import { State, dateTime } from '../components/Common';
export function ChatPage({
  token,
  selectedAgentId,
  onSelectAgent
}) {
  const canSend = usePermission('agents', 'execute');
  const agents = useApi('/agents', token);
  const [conversationId, setConversationId] = useState('');
  const conversations = useApi(selectedAgentId ? '/conversations?agentId=' + selectedAgentId : null, token);
  const [messages, setMessages] = useState([]),
    [query, setQuery] = useState('');
  const [pending, setPending] = useState(null);
  const [sending, setSending] = useState(false),
    [loadingHistory, setLoadingHistory] = useState(false),
    [error, setError] = useState('');
  const end = useRef(null),
    request = useRef(null);
  const agent = agents.data.find(item => item.id === selectedAgentId);
  useEffect(() => {
    request.current?.abort();
    request.current = null;
    setConversationId('');
    setMessages([]);
    setPending(null);
    setQuery('');
    setError('');
    setSending(false);
    setLoadingHistory(false);
    return () => request.current?.abort();
  }, [selectedAgentId]);
  useEffect(() => {
    end.current?.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest'
    });
  }, [messages, pending, sending]);
  async function openConversation(id) {
    if (sending) return;
    const controller = new AbortController();
    request.current?.abort();
    request.current = controller;
    setLoadingHistory(true);
    setError('');
    try {
      const history = await apiRequest('/conversations/' + id, {
        token,
        signal: controller.signal
      });
      setConversationId(id);
      setMessages(history.messages || []);
    } catch (error) {
      if (error.name !== 'AbortError') setError(error.message);
    } finally {
      if (!controller.signal.aborted) setLoadingHistory(false);
    }
  }
  async function send(event) {
    event.preventDefault();
    const question = query.trim();
    if (!question || sending || !agent || !canSend || agent.status !== 'ACTIVE') return;
    const controller = new AbortController();
    request.current?.abort();
    request.current = controller;
    setSending(true);
    setError('');
    setPending({
      question,
      answer: ''
    });
    try {
      const response = await apiRequest('/agents/' + agent.id + '/chat/stream', {
        token,
        method: 'POST',
        body: {
          message: question,
          ...(conversationId ? {
            conversationId
          } : {})
        },
        signal: controller.signal,
        raw: true
      });
      const result = await consumeChatEvents(response.body, text => {
        if (!controller.signal.aborted) setPending(current => current ? {
          ...current,
          answer: current.answer + text
        } : null);
      });
      if (controller.signal.aborted) return;
      setConversationId(result.conversationId);
      setMessages(current => [...current, ...result.messages]);
      setQuery('');
      conversations.reload();
    } catch (error) {
      if (error.name !== 'AbortError') setError(error.message);
    } finally {
      if (request.current === controller) {
        setSending(false);
        setPending(null);
      }
    }
  }
  return <State loading={agents.loading} error={agents.error} retry={agents.reload} empty={!agents.data.length && 'Crie e configure um agente para iniciar uma conversa.'}>
    <div className="toolbar"><Select aria-label="Agente da conversa" value={selectedAgentId || ''} onChange={event => onSelectAgent(event.target.value)} disabled={sending} label={<>Agente</>}><option value="">Selecione um agente</option>{agents.data.filter(item => item.status !== 'ARCHIVED').map(item => <option key={item.id} value={item.id}>{item.name}{item.status === 'DRAFT' ? ' (rascunho)' : ''}</option>)}</Select></div>
    {!agent ? <div className="state-panel"><Card><Bot size={30} /><p>Selecione o agente com quem deseja conversar.</p></Card></div> : <div className="chat-layout">
      <aside className="chat-list"><Card><div className="chat-list-head"><b>Conversas</b><IconButton aria-label="Nova conversa" disabled={sending} onClick={() => {
              setConversationId('');
              setMessages([]);
              setError('');
            }} icon={<><Plus size={18} /></>} type="button" /></div>
        <State loading={conversations.loading} error={conversations.error} retry={conversations.reload} empty={!conversations.data.length && 'Suas conversas aparecerão aqui.'}><SelectableList bare label="Conversas do agente" items={conversations.data.map(item => ({
              id: item.id,
              title: item.title || "Nova conversa",
              description: dateTime(item.updatedAt),
              disabled: sending
            }))} value={conversationId} onChange={openConversation} /></State>
      </Card></aside>
      <div className="chat-window"><Card title={agent.name} description={agent.models?.find(item => item.isPrimary)?.model?.name || "Modelo não configurado"} action={<IconTile icon={Bot} tone="primary" />}>
        <div className="messages" aria-live="polite">{loadingHistory ? <p>Carregando conversa...</p> : !messages.length && !pending ? <EmptyState icon={Bot} title={"Converse com " + agent.name} description="As respostas utilizarão as instruções e as bases vinculadas a este agente." /> : messages.map(message => <div key={message.id} className={'message ' + (message.role === 'user' ? 'user' : 'agent')}><div><span className="message-text">{message.content}</span>{message.metadata?.sources?.length > 0 && <div className="source-chips">{message.metadata.sources.map((source, index) => <Chip key={source.id || index}>Fonte: {source.documentName}</Chip>)}</div>}<small>{dateTime(message.createdAt)}</small></div></div>)}{pending && <><div className="message user"><div><span className="message-text">{pending.question}</span></div></div>{pending.answer && <div className="message agent"><div><span className="message-text">{pending.answer}</span><small>Respondendo...</small></div></div>}</>}{sending && !pending?.answer && <p role="status">O agente está preparando a resposta...</p>}<div ref={end} /></div>
        {error && <Alert tone="danger">{error}</Alert>}
        {(!canSend || agent.status !== 'ACTIVE') && <p className="panel-note">{!canSend ? 'Seu perfil permite consultar as conversas.' : 'Ative o agente nas configurações para conversar.'}</p>}
        <form className="chat-composer" onSubmit={send}><Input aria-label="Mensagem" value={query} onChange={event => setQuery(event.target.value)} placeholder="Digite sua mensagem..." disabled={sending || loadingHistory || !canSend || agent.status !== 'ACTIVE'} maxLength={16000} />{sending ? <IconButton type="button" aria-label="Interromper resposta" onClick={() => {
              request.current?.abort();
              setSending(false);
              setPending(null);
              setError('Resposta interrompida. Sua pergunta continua disponível para tentar novamente.');
            }} icon={<><Square size={15} /></>} /> : <IconButton type="submit" aria-label="Enviar mensagem" disabled={loadingHistory || !query.trim() || !canSend || agent.status !== 'ACTIVE'} icon={<><Send size={16} /></>} />}</form>
      </Card></div>
    </div>}
  </State>;
}
