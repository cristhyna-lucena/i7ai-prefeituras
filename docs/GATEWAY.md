# Contrato do gateway de IA

O backend chama `POST ${AI_GATEWAY_URL}/chat` com `Content-Type: application/json` e, se configurado, `Authorization: Bearer ${AI_GATEWAY_API_KEY}`. O gateway é uma configuração administrativa do servidor.

## Solicitação

```json
{
  "agent": {
    "id": "uuid-do-agente",
    "name": "Agente",
    "systemPrompt": "Instruções e fontes recuperadas",
    "temperature": 0.2,
    "maxTokens": 1000,
    "advancedReasoning": false
  },
  "model": "identificador-do-modelo",
  "provider": "openai",
  "message": "Pergunta",
  "history": [{"role":"user","content":"Mensagem anterior"}],
  "context": []
}
```

O histórico contém somente mensagens do usuário autenticado, da conversa/agente/prefeitura selecionados, limitado a 40 mensagens e 48 mil caracteres. `context` contém os trechos encontrados nas bases ativas vinculadas ao agente.

## Resposta final

```json
{
  "answer": "Resposta com referência [Fonte 1] quando aplicável.",
  "usage": {"inputTokens":120,"outputTokens":24}
}
```

O texto precisa ser não vazio. Os tokens devem ser números não negativos; sem eles o consumo é marcado como não medido. O formato JSON não fornece deltas: `/chat/stream` emite `complete` após persistir a resposta. A integração OpenAI direta fornece deltas reais via Responses API.

## Chamadas de ferramentas

Quando o agente possui funções autorizadas, a solicitação também contém:

```json
{
  "tools": [{
    "type":"function",
    "name":"alias-recebido-do-backend",
    "description":"Descrição da função",
    "parameters":{"type":"object","properties":{}},
    "strict":false
  }],
  "toolExecution":"client",
  "toolResults":[]
}
```

O gateway pode retornar chamadas em vez da resposta final:

```json
{
  "toolCalls":[{"callId":"call-1","name":"alias-recebido-do-backend","arguments":{"consulta":"termo"}}],
  "usage":{"inputTokens":40,"outputTokens":10}
}
```

`arguments` aceita objeto ou string JSON. O backend valida o alias, argumentos, autorização atual e destino, executa a função e chama o gateway novamente com `toolResults:[{"callId":"call-1","name":"alias-recebido-do-backend","output":"resultado JSON sanitizado"}]`. O gateway deve considerar esses resultados e concluir com `answer`. IDs repetidos e funções não autorizadas são recusados; o máximo é oito chamadas/rodadas. Os tokens das rodadas são somados. O gateway não deve executar essas mesmas ferramentas por conta própria.

## Eventos para o frontend

`POST /api/agents/:id/chat/stream` recebe `{message,conversationId?}` com JWT e responde SSE:

```text
event: delta
data: {"text":"trecho incremental"}

event: complete
data: {"answer":"resposta","conversationId":"uuid","messages":[],"sources":[],"usage":{}}

event: error
data: {"message":"Motivo da falha"}
```

`complete` representa a confirmação de conversa, mensagens, consumo e auditoria persistidos. O payload real contém as duas mensagens novas e seus IDs. Desconectar cancela a geração; texto parcial não é salvo. Comentários heartbeat são enviados a cada 15 segundos.

## Reserva de consumo

Cada rodada reserva tokens antes da requisição, sob bloqueio da prefeitura no PostgreSQL. O cálculo usa os bytes UTF-8 do pedido, uma margem de enquadramento e o limite de saída. O gateway deve respeitar `agent.maxTokens` e retornar os contadores reais de cada rodada, incluindo as chamadas de ferramentas.

O consumo é persistido antes da conversa. Uma falha posterior não apaga os tokens informados. Respostas incompletas/fracassadas da Responses API registram os contadores disponíveis; falta de confirmação mantém uma reserva pendente. Contadores ausentes não são substituídos por valores inventados. Recusas HTTP explícitas 400/401/403/404/422/429 liberam a reserva sem criar consumo. Licenciamento informa o saldo reservado separadamente.
