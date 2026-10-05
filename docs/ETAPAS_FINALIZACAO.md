# Finalização por etapas

Diretriz: testar cada etapa antes de avançar; usar componentes, tokens e preset oficiais `@sgdm/design`; deixar a vinculação com o SGDM para depois da conclusão interna.

Atualização em 5 de outubro de 2026: o [relatório consolidado](STATUS_PROJETO.md) apresenta as entregas e pendências atuais. A implementação de chat e OmniRouter está descrita em [CHAT_OMNIROUTER.md](CHAT_OMNIROUTER.md). Os números de verificação das etapas 1 a 5 abaixo pertencem ao histórico concluído em 2 de outubro e não substituem os resultados atuais.

| Etapa | Entrega | Estado | Verificação |
| --- | --- | --- | --- |
| 1 | Cadastro e provisionamento sem senha própria | Concluída | 109 testes de backend, 2 testes do formulário/modal, auditoria SGDM e builds aprovados |
| 2 | Reserva de quota e registro de consumo interrompido | Concluída | 112 testes gerais, 17 testes focados e concorrência em PostgreSQL aprovados |
| 3 | Retenção automática de conversas e dados de execução | Concluída | 2 testes focados e corte/isolamento/preservação em PostgreSQL aprovados |
| 4 | OCR local, consulta interna e pesquisa externa | Concluída | 120 testes de backend e OCR/consultas pela API, S3 e fila aprovados |
| 5 | Testes integrados e revisão visual final | Concluída | 120 testes de backend, integração e 26 testes de interface verificados; auditoria SGDM, builds Linux e OCR offline/Nginx sem root aprovados |
| 6 | Vinculação ao SGDM real | Adiada por solicitação do usuário | Somente depois das etapas internas |
| 7 | Chat com agente/modelo independentes, histórico e anexos privados | Implementação concluída em 5/10 | Migration aditiva e validações; resultados atuais em [CHAT_OMNIROUTER.md](CHAT_OMNIROUTER.md) |
| 8 | Adaptador central OmniRouter | Implementação concluída; integração com a conta real pendente | CI do commit `701412c` [aprovada](https://github.com/cristhyna-lucena/i7ai-prefeituras/actions/runs/37360216695); credenciais e modelos reais ainda precisam ser configurados |
| 9 | Implantação operacional | Pendente | Destino, domínio/HTTPS, configuração de produção, provisionamento, backups e monitoramento |

Referências visuais: pacote oficial `@sgdm/design` v0.2.1 e captura enviada. O endereço `https://sgdm.com.br/dashboard` não retornou conteúdo acessível na consulta externa; não foi usado como se tivesse sido visualmente inspecionado.

As verificações usam dados de teste, sem vincular usuários reais do SGDM ou consumir provedores pagos de IA.

As etapas internas 1 a 5 estão concluídas, com resultados históricos em [FINALIZACAO.md](FINALIZACAO.md) e [VALIDACAO_SGDM.md](VALIDACAO_SGDM.md). As implementações das etapas 7 e 8 também estão concluídas. A ativação da conta real OmniRouter, a implantação no ambiente operacional e a conferência dentro do SGDM real permanecem pendentes; consulte [STATUS_PROJETO.md](STATUS_PROJETO.md) para as informações necessárias.
