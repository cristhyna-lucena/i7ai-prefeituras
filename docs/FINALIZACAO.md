# Finalização interna

O trabalho segue [as etapas combinadas](ETAPAS_FINALIZACAO.md). A vinculação com o SGDM real permanece adiada. O módulo não possui login próprio; a prévia utiliza dados fictícios e o pacote oficial `@sgdm/design` 0.2.1.

## Recursos concluídos

- Cadastro e provisionamento de identidades sem senha local. A migration permite `passwordHash` nulo e preserva os hashes legados existentes.
- Reserva antecipada por rodada de IA, com bloqueio por prefeitura e registro de consumo conhecido mesmo em falhas. Reservas sem confirmação permanecem separadas do uso medido; não são liberadas com um consumo inventado.
- Retenção diária após configuração explícita: conversas antigas são removidas e dados de execuções encerradas são limpos. Status, horários, cadastros, documentos, auditoria e consumo são preservados. Limpar o prazo desativa a política. A rotina trabalha em lotes de até 500 registros de cada tipo por prefeitura e evita conversas usadas por reservas recentes; uma reserva sem confirmação continua contando na quota mesmo após deixar de ser considerada execução ativa.
- OCR local em português com processo separado, modelo instalado pelo npm, limite de 20 páginas digitalizadas, imagens de até 8 milhões de pixels e processamento de até 180 segundos. PDFs mistos preservam o texto nativo. O limite de heap do processo auxiliar é de 512 MB; digitalizações ilegíveis são reportadas como falha.
- Consulta interna limitada a recursos e campos autorizados, sem SQL livre; pesquisa externa com validação de destino, credenciais por referência e resultados limitados.

## Configuração das novas ferramentas

Consulta interna: tipo `INTERNAL_DATABASE`, sem domínios ou credenciais.

```json
{"resource":"documents","maxResults":10}
```

Recursos aceitos: `documents`, `knowledge-bases`, `departments`, `agents`. Documentos e bases precisam estar ativos/processados e vinculados ao agente. A consulta não retorna arquivos, segredos, senhas nem conteúdo de conversas de outros usuários.

Pesquisa externa: tipo `EXTERNAL_SEARCH`, domínio da API na lista permitida e credenciais cadastradas no servidor quando necessárias.

```json
{"endpoint":"https://api.search.brave.com/res/v1/web/search","queryParam":"q","maxResults":5,"timeoutMs":15000}
```

O exemplo usa o contrato `web.results`; outros provedores podem usar `results`. Não há credencial ou assinatura do provedor incluída no projeto. O executor realiza GET, adiciona somente a consulta no parâmetro configurado e valida destino, DNS, IP e redirecionamentos. Os testes usam um provedor local fictício.

Argumentos para testar ou chamar ambas:

```json
{"query":"publicação de editais","limit":5}
```

## Verificação

Resultados em 2 de outubro de 2026:

- Geração do Prisma, builds de frontend/backend e 120 testes de backend aprovados após as atualizações de dependências. Os testes incluem planilhas Excel, PDFs nativos/digitalizados, streaming, quota, retenção e ferramentas.
- Integração aprovada com PostgreSQL/pgvector, Redis, MinIO, API e fila: migrations, JWT/perfis, isolamento por prefeitura, upload/RAG, chat/histórico/SSE, automações/agendamentos, auditoria/consumo, concorrência de quota, retenção e novas ferramentas. Foram feitas quatro chamadas exclusivamente ao provedor local simulado. O teste removeu seu schema, filas e arquivos, preservando os dados existentes.
- 4 testes de streaming no frontend aprovados; 26 testes de interface verificados, com 112 capturas. A [validação visual](VALIDACAO_SGDM.md) descreve a execução inicial e a repetição dos quatro testes corrigidos.
- Auditoria do design system aprovada: 18 arquivos, 228 usos oficiais, sem sobrescritas de tokens ou estilos dos componentes.
- `npm audit --omit=dev`: zero vulnerabilidades reportadas no frontend e no backend. Resultados: [frontend](../output/verification/dependency-audit-frontend.json) e [backend](../output/verification/dependency-audit-backend.json). Foram fixadas dependências transitivas de `@prisma/config` (`deepmerge-ts` 8.0.2 e `effect` 3.20.0) e `exceljs` (`uuid` 11.1.1), preservando as versões e interfaces principais. Referências: [deepmerge-ts](https://github.com/advisories/GHSA-ggr8-5vv4-36mx), [effect](https://github.com/advisories/GHSA-38f7-945m-qr2g), [uuid](https://github.com/advisories/GHSA-w5hq-g745-h8pq).
- Builds Linux de frontend e backend aprovados. A execução dos containers confirmou usuários sem privilégios de root, OCR de PDF digitalizado com modelo português instalado e rede desativada, Nginx com healthcheck/index/assets, tokens SGDM presentes e bundle de produção sem URL local de desenvolvimento ou sessão de fixture. A verificação removeu somente seus containers temporários.

Reprodução dos testes integrados e Linux, com os serviços locais disponíveis e as imagens de verificação construídas:

```sh
cd backend
npm run prisma:generate
npm run build
npm test
npm run test:integration
cd ..
docker build -t i7ai-backend:verification-20261002 ./backend
docker build -t i7ai-frontend:verification-20261002 .
node scripts/verify-linux.cjs
```

A prévia local para abrir no navegador deste computador é `http://127.0.0.1:5180/preview/sgdm.html`. Ela é exclusiva do desenvolvimento e apresenta dados fictícios, sem alterações persistidas. A [galeria](../output/verification/sgdm/index.html) reúne a revisão em desktop e celular.

## Etapa posterior

Somente após a conclusão interna: validar contexto de sessão, montagem, navegação, permissões, nomes de prefeitura/usuário e visual no SGDM real. A prévia não representa uma vinculação já realizada. Implantação no destino, HTTPS, credenciais reais de provedores, backups e monitoramento dependem da configuração do ambiente operacional.
