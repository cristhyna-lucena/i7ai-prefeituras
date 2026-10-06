# OmniRoute e agentes locais

Verificação de 6 de outubro de 2026 no ambiente de desenvolvimento. A configuração e os cadastros abaixo estão no workspace e no banco local; ainda não foram implantados no SGDM ou em produção.

Atualização após a revisão da configuração: quatro modelos respondem pelo i7Ai — GPT-4o Mini, GPT 5.6 Luna (Low), Claude e Gemini. O GPT legado foi regularizado para a rota explícita confirmada, preservando seu ID e os históricos. Texto JSON/SSE, histórico e visão com GPT foram verificados com chamadas reais. Os builds passaram e a suite atual possui 198 testes de backend aprovados.

## Conexão e credenciais

A base configurada é `https://omniroute.prospectari.com.br/v1`. O backend envia a credencial em `Authorization: Bearer`, conforme o [contrato oficial do OmniRoute](https://omniroute.hagicode.com/en-US/reference/api-reference/#tokenized-vs-code--headerless-aliases). As URLs com token no caminho não são necessárias para o i7Ai.

`OMNIROUTER_BASE_URL` e `OMNIROUTER_API_KEY` estão somente em `backend/.env`, ignorado pelo Git. A chave não foi colocada no frontend, catálogo, auditoria ou documentação. Os exemplos de configuração continuam sem credenciais reais.

## Agente e modelos

O **Assistente da Prefeitura** foi criado como `ACTIVE`, com limite de 2.048 tokens por resposta e raciocínio avançado desativado. Suas instruções cobrem apoio geral, resumos e rascunhos, com fontes autorizadas, indicação de dados ausentes e revisão pela equipe municipal. O agente anterior de teste foi preservado como rascunho.

Após a escolha do usuário por **Licitações e contratos**, foram criados dois agentes ativos com Claude como padrão e limite de 4.096 tokens por resposta:

| Agente | Finalidade |
| --- | --- |
| Assistente de Licitações | Organizar demandas e processos, analisar documentos e preparar rascunhos de DFD, ETP, TR e edital. |
| Assistente de Contratos | Extrair obrigações, responsáveis, vigência e evidências, e preparar quadros de acompanhamento e comunicações. |

Ambos usam presets em `backend/presets`, pedem documentos e informações ausentes, exigem fontes verificáveis para conclusões e deixam os atos administrativos aos responsáveis. Referências para conferência: [Lei 14.133 no Planalto](https://www.planalto.gov.br/ccivil_03/_ato2019-2022/2021/lei/l14133.htm) e [manual do TCU](https://licitacoesecontratos.tcu.gov.br/manual/). Esses links não representam consulta automática nem importação integral das normas.

A base **Licitações e Contratos** foi criada e vinculada aos dois agentes. Ela ainda não contém documentos: editais, contratos, regulamentos municipais e fontes selecionadas precisam ser fornecidos e conferidos pela equipe. Os testes sem documentos produziram perguntas/checklists de entrada, sem inventar valores, cláusulas ou prazos, e salvaram duas mensagens em cada conversa.

| Família | Identificador do gateway | Verificação real |
| --- | --- | --- |
| GPT-4o Mini | `openai/gpt-4o-mini` | JSON pelo i7Ai, visão, histórico persistido e consumo registrado. ID do cadastro legado preservado. |
| GPT 5.6 Luna (Low) | `cx/gpt-5.6-luna-low` | JSON direto e streaming pelo i7Ai, histórico persistido e consumo registrado. Selecionável por turno. |
| Claude | `antigravity/claude-sonnet-4-6` | JSON e streaming do i7Ai, histórico persistido e consumo registrado. Padrão do agente. |
| Gemini | `antigravity/gemini-3.6-flash-high` | JSON e streaming pelo i7Ai, histórico persistido e consumo registrado. Selecionável por turno. |

Os modelos usam os IDs exatos e as capacidades anunciadas pelo catálogo do servidor. Claude/Gemini possuem contexto de 1.048.576 tokens e saída de 65.536; GPT-4o Mini possui contexto de 128.000 e saída de 16.384; GPT 5.6 Luna (Low) possui contexto de 272.000 e saída de 128.000. O limite menor do agente prevalece. Ferramentas e visão são anunciadas nos quatro modelos; a chamada real de ferramenta foi validada com Claude e a visão foi validada com GPT-4o Mini. Cancelamento e streaming também foram conferidos. Os preços permanecem não configurados.

**Imagens:** o teste inicial com contexto de 1.048.576 foi recusado antes do provedor, pois excede a licença local de 1.000.000. A revisão resolveu o uso de visão com GPT-4o Mini, cuja janela declarada de 128.000 cabe nessa licença. Uma imagem PNG com lado esquerdo vermelho e lado direito azul foi enviada pelo fluxo privado, ficou `READY` e recebeu a resposta correta “Vermelho, azul.”; consumo e histórico foram persistidos. O anexo está vinculado à conversa técnica de verificação. A licença e os contextos reais não foram reduzidos ou aumentados. Claude/Gemini continuam sujeitos ao bloqueio da janela na licença atual; a visão com GPT 5.6 Luna ainda não foi testada.

**Ferramentas com Gemini:** a primeira tentativa retornou 500 por `P2028` ao iniciar a transação de registro do consumo. A atividade PostgreSQL conferida depois não mostrou transação aberta, mas isso não determina a causa do timeout. A revisão automática bloqueou a repetição do teste, sem informar um motivo específico. Esse caso permanece pendente. A reserva de consumo conserva o saldo; não houve repetição automática da IA.

A troca de modelo foi conferida sem alterar Claude como padrão do agente. O cadastro legado `gpt-4o-mini` foi regularizado para `openai/gpt-4o-mini`, com ID e preços preservados e mudança auditada, após a rota responder corretamente. GPT 5.6 Luna (Low) foi cadastrado como alternativa confirmada. As duas rotas de GPT responderam pelos agentes de Licitações/Contratos, sem alterar seus modelos padrão.

**Controle de raciocínio avançado:** o suporte ao controle do adaptador é exposto como `provider.capabilities.supportsAdvancedReasoningControl` em `/models` e `/providers`, separado do raciocínio interno do modelo. Como o parâmetro de intensidade não foi validado para o adaptador OmniRoute, a interface impede ativação e a API recusa novas configurações incompatíveis; um valor antigo pode ser desativado. A rota GPT 5.6 Luna (Low) permanece selecionável com o nível declarado no seu identificador.

Quatro rotas GPT testadas não foram habilitadas por esta configuração:

| Rota | Resultado HTTP |
| --- | --- |
| `aug/gpt5.4-mini` | 502 |
| `cx/gpt-5.6-luna` | 429 |
| `ddgw/gpt-5.4-mini` | 418 |
| `tllm/openrouter_gpt_4_o_mini` | 403, `insufficient_quota` |

Esses resultados pertencem à primeira verificação e não comprovam indisponibilidade permanente. Na revisão posterior, `openai/gpt-4o-mini`, `cx/gpt-5.6-luna-low` e seu alias `codex/gpt-5.6-luna-low` retornaram 200 com resposta e consumo válidos. Foram cadastradas as duas rotas principais; o alias equivalente não foi duplicado. O catálogo anunciar um identificador não confirma que o provedor esteja operacional.

## Consumo e verificações

Uma resposta real de Gemini informou 92 tokens de entrada, 5 de conclusão e total de 154, sem detalhar os 57 restantes. O adaptador agora preserva o total informado: com ambos os contadores completos, a saída registrada é `total_tokens - prompt_tokens`. Detalhes de cache/raciocínio não são somados novamente. Contadores faltantes continuam sem consumo total inventado; totais inválidos ou inferiores à soma são recusados e mantêm a reserva conservadora. Os tokens adicionais não são apresentados como raciocínio confirmado.

- Builds frontend/backend aprovados; 198 testes de backend passaram, incluindo regressões JSON/SSE para consumo, isolamento da configuração real, persistência com `P2028` e validação do controle de raciocínio.
- Uma falha `P2028` ao gravar uso agora repete apenas a persistência uma vez, com a mesma reserva e contadores. A IA não é chamada novamente; a proteção idempotente evita duplicação após commit ambíguo. Se a gravação continuar falhando, a reserva original permanece intacta. Isso corrige uma perda comprovada de contadores, sem afirmar que a causa do timeout real tenha sido determinada.
- Os quatro modelos responderam pelo i7Ai na revisão final; GPT-4o Mini/Claude em JSON e GPT 5.6 Luna/Gemini em SSE. As quatro conversas contêm pergunta/resposta com modelo e consumo medido.
- Visão real com GPT-4o Mini, usando anexo privado e contexto compatível, passou e deixou duas mensagens com consumo medido no histórico.
- Os presets foram incluídos no contexto e na etapa runtime do Dockerfile; a nova imagem de produção ainda não foi reconstruída nesta etapa.
- `/api/health` respondeu 200 com banco, fila e armazenamento disponíveis.
- Catálogo autenticado retornou o agente ativo e os modelos cadastrados.
- Streaming de Claude entregou `delta` e `complete`; a conversa reaberta continha pergunta e resposta persistidas.
- Streaming de Gemini entregou `delta` e `complete`, com consumo medido.
- Claude chamou uma ferramenta interna vinculada e autorizada, consultou departamentos da própria prefeitura e gravou auditoria. A ferramenta temporária foi removida depois do teste.
- Cancelamento de Claude após o primeiro `delta` não salvou conversa parcial e deixou a reserva sem confirmação, conforme a regra existente.
- Claude e Gemini retornaram `I7AI_OK` pelo i7Ai e registraram consumo medido. A verificação usou uma sessão assinada de desenvolvimento; não representa integração com o SGDM real.
- Os agentes de Licitações e Contratos responderam pelo i7Ai e persistiram pergunta/resposta com o modelo selecionado e consumo medido.
- Backup PostgreSQL anterior aos cadastros criado em `output/backup` e listado com sucesso por `pg_restore`.

Os relatórios técnicos ficam em `output/verification/omniroute`, ignorado pelo Git. As chamadas de IA desta etapa foram reais; os testes unitários continuam usando serviços simulados.

## Repetir a configuração administrativa

No ambiente administrativo com acesso ao banco e às credenciais privadas:

```sh
cd backend
npm run build
npm run omniroute:configure -- --models=antigravity/claude-sonnet-4-6,antigravity/gemini-3.6-flash-high,openai/gpt-4o-mini,cx/gpt-5.6-luna-low
npm run omniroute:configure -- --models=antigravity/claude-sonnet-4-6,antigravity/gemini-3.6-flash-high,openai/gpt-4o-mini,cx/gpt-5.6-luna-low --apply
```

A primeira chamada apresenta a configuração; a segunda aplica os cadastros. A repetição sequencial foi verificada: mantém o mesmo agente e modelos, sem alterar instruções, status, vínculos ou preços existentes. Execute uma configuração por vez. Com várias prefeituras ou usuários, informe `--tenant=UUID` e `--user=UUID`. Nomes personalizados usam um argumento entre aspas, como `"--agent=Assistente da Prefeitura"`. O primeiro modelo é o padrão apenas de agentes novos. Este comando administrativo não concede novos perfis ao usuário.

Para criar os agentes da área escolhida com os presets do projeto:

```sh
npm run omniroute:configure -- --models=antigravity/claude-sonnet-4-6,antigravity/gemini-3.6-flash-high --preset=licitacoes --apply
npm run omniroute:configure -- --models=antigravity/claude-sonnet-4-6,antigravity/gemini-3.6-flash-high --preset=contratos --apply
```

O comando cria os agentes e seus modelos; bases e documentos são vinculados pela interface/API existente. Agentes já existentes são preservados, inclusive suas instruções e vínculos.

Próximas etapas: alimentar a base da área, concluir a verificação de ferramentas Gemini e demais capacidades ainda não exercitadas, configurar preços se necessários e realizar a vinculação ao SGDM real antes da implantação operacional. Texto nas quatro rotas e visão com GPT-4o Mini já estão verificados no ambiente local.
