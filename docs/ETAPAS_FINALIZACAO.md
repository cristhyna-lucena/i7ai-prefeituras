# Finalização por etapas

Diretriz: testar cada etapa antes de avançar; usar componentes, tokens e preset oficiais `@sgdm/design`; deixar a vinculação com o SGDM para depois da conclusão interna.

| Etapa | Entrega | Estado | Verificação |
| --- | --- | --- | --- |
| 1 | Cadastro e provisionamento sem senha própria | Concluída | 109 testes de backend, 2 testes do formulário/modal, auditoria SGDM e builds aprovados |
| 2 | Reserva de quota e registro de consumo interrompido | Concluída | 112 testes gerais, 17 testes focados e concorrência em PostgreSQL aprovados |
| 3 | Retenção automática de conversas e dados de execução | Concluída | 2 testes focados e corte/isolamento/preservação em PostgreSQL aprovados |
| 4 | OCR local, consulta interna e pesquisa externa | Concluída | 120 testes de backend e OCR/consultas pela API, S3 e fila aprovados |
| 5 | Testes integrados e revisão visual final | Concluída | 120 testes de backend, integração e 26 testes de interface verificados; auditoria SGDM, builds Linux e OCR offline/Nginx sem root aprovados |
| 6 | Vinculação ao SGDM real | Adiada por solicitação do usuário | Somente depois das etapas internas |

Referências visuais: pacote oficial `@sgdm/design` v0.2.1 e captura enviada. O endereço `https://sgdm.com.br/dashboard` não retornou conteúdo acessível na consulta externa; não foi usado como se tivesse sido visualmente inspecionado.

As verificações usam dados de teste, sem vincular usuários reais do SGDM ou consumir provedores pagos de IA.

As etapas internas 1 a 5 estão concluídas. Resultados, comandos reproduzíveis e limites estão em [FINALIZACAO.md](FINALIZACAO.md) e [VALIDACAO_SGDM.md](VALIDACAO_SGDM.md). A implantação no ambiente operacional e a conferência dentro do SGDM real permanecem posteriores a esta conclusão local.
