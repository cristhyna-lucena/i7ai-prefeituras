# Finalização por etapas

Diretriz: testar cada etapa antes de avançar; usar componentes, tokens e preset oficiais `@sgdm/design`; deixar a vinculação com o SGDM para depois da conclusão interna.

Atualização em 5 de outubro de 2026: o [relatório consolidado](STATUS_PROJETO.md) apresenta as entregas e pendências atuais. A implementação de chat e OmniRouter está descrita em [CHAT_OMNIROUTER.md](CHAT_OMNIROUTER.md). Os números de verificação das etapas 1 a 5 abaixo pertencem ao histórico concluído em 2 de outubro e não substituem os resultados atuais.

Atualização local em 6 de outubro: [OmniRoute conectado com Claude e Gemini](OMNIROUTE_LOCAL.md), três agentes ativos (geral, Licitações e Contratos) e 180 testes de backend aprovados. Os dois agentes da área escolhida responderam e salvaram histórico pela API, com base compartilhada vinculada. Rotas GPT, configuração de imagens, validações reais restantes e integração operacional continuam pendentes.

Revisão posterior da configuração: GPT-4o Mini, GPT 5.6 Luna (Low), Claude e Gemini responderam pelo i7Ai; visão com GPT-4o Mini passou na licença atual. O controle de raciocínio incompatível foi corrigido e a persistência de contadores foi protegida contra `P2028`. Builds aprovados e 198 testes de backend passaram. As demais capacidades ainda não exercitadas e a integração operacional permanecem pendentes.

| Etapa | Entrega | Estado | Verificação |
| --- | --- | --- | --- |
| 1 | Cadastro e provisionamento sem senha própria | Concluída | 109 testes de backend, 2 testes do formulário/modal, auditoria SGDM e builds aprovados |
| 2 | Reserva de quota e registro de consumo interrompido | Concluída | 112 testes gerais, 17 testes focados e concorrência em PostgreSQL aprovados |
| 3 | Retenção automática de conversas e dados de execução | Concluída | 2 testes focados e corte/isolamento/preservação em PostgreSQL aprovados |
| 4 | OCR local, consulta interna e pesquisa externa | Concluída | 120 testes de backend e OCR/consultas pela API, S3 e fila aprovados |
| 5 | Testes integrados e revisão visual final | Concluída | 120 testes de backend, integração e 26 testes de interface verificados; auditoria SGDM, builds Linux e OCR offline/Nginx sem root aprovados |
| 6 | Vinculação ao SGDM real | Adiada por solicitação do usuário | Somente depois das etapas internas |
| 7 | Chat com agente/modelo independentes, histórico e anexos privados | Implementação concluída em 5/10 | Migration aditiva e validações; resultados atuais em [CHAT_OMNIROUTER.md](CHAT_OMNIROUTER.md) |
| 8 | Adaptador central OmniRouter | Conectado à conta real no ambiente local, com limites | Quatro modelos de GPT/Claude/Gemini e três agentes ativos; texto, histórico e visão GPT verificados em 6/10. Demais capacidades ainda não exercitadas. [Resultados locais](OMNIROUTE_LOCAL.md) |
| 9 | Implantação operacional | Pendente | Destino, domínio/HTTPS, configuração de produção, provisionamento, backups e monitoramento |

Referências visuais: pacote oficial `@sgdm/design` v0.2.1 e captura enviada. O endereço `https://sgdm.com.br/dashboard` não retornou conteúdo acessível na consulta externa; não foi usado como se tivesse sido visualmente inspecionado.

Os testes automatizados e as verificações históricas das etapas 1 a 5 usam dados de teste e serviços simulados, sem vincular usuários reais do SGDM. A ativação de 6 de outubro incluiu chamadas reais à conta OmniRoute, com uso registrado, conforme o relatório local.

As etapas internas 1 a 5 estão concluídas, com resultados históricos em [FINALIZACAO.md](FINALIZACAO.md) e [VALIDACAO_SGDM.md](VALIDACAO_SGDM.md). As implementações das etapas 7 e 8 também estão concluídas. A conta real OmniRoute responde localmente com dois GPTs, Claude e Gemini; visão com GPT-4o Mini também foi verificada. As demais capacidades ainda não exercitadas, a implantação no ambiente operacional e a conferência dentro do SGDM real permanecem pendentes; consulte [STATUS_PROJETO.md](STATUS_PROJETO.md) para as informações necessárias.
