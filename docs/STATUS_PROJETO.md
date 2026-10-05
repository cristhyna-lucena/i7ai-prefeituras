# Estado do projeto e pendências

Levantamento de 5 de outubro de 2026, com base no código do commit `701412c`, no banco local e nas consultas ao GitHub realizadas nessa data. Este documento reúne os pedidos do usuário, as entregas, as configurações pendentes e os limites atuais. Estados externos, como convites e credenciais, devem ser conferidos novamente antes de executar a próxima etapa.

O código está publicado e validado em desenvolvimento. A ativação da IA real, a integração ao SGDM real, a implantação no destino e o acesso administrativo de JEFERSON-ASSIS continuam pendentes.

## Projeto e arquitetura

- Repositório público: [cristhyna-lucena/i7ai-prefeituras](https://github.com/cristhyna-lucena/i7ai-prefeituras).
- Branch de trabalho: `main`; implementação do chat registrada no commit [701412c](https://github.com/cristhyna-lucena/i7ai-prefeituras/commit/701412cd312b5f98d84581e2ae47adb1b4a8b408).
- Frontend React/Vite com o pacote oficial `@sgdm/design` 0.2.1; backend NestJS e Prisma.
- PostgreSQL/pgvector para dados e pesquisa, BullMQ/Redis para filas e S3/MinIO para arquivos.
- O módulo recebe sessão, menu e navegação do SGDM. Não há login próprio.
- Áreas existentes: dashboard, chat, agentes, modelos, execuções, bases de conhecimento, documentos, automações, agendamentos, ferramentas, integrações, usuários, departamentos, relatórios, licenciamento e configurações.

## Atendimento aos pedidos

| Pedido | Situação | Observação |
| --- | --- | --- |
| Enviar o projeto ao GitHub | Concluído | Código publicado na branch `main`. |
| Deixar o repositório público | Concluído | Visibilidade pública confirmada no GitHub. |
| Dar administração a JEFERSON-ASSIS | Pendente | Convite de escrita enviado, ainda não aceito; administração não concedida. |
| Analisar e preservar o projeto existente | Concluído | Arquitetura, armazenamento, autenticação, componentes e visual SGDM reutilizados. |
| Selecionar agente e modelo separadamente | Implementado | Trocar o modelo vale para o próximo turno e preserva o padrão do agente. |
| Centralizar modelos/provedores | Implementado | Catálogo existente administrado por `SUPER_ADMIN`; modelos reais da conta precisam de configuração. |
| Melhorar Novo Chat | Implementado | Seletores, mensagens, processamento, streaming, interrupção, campo de múltiplas linhas e botão `+`. |
| Manter histórico e metadados | Implementado com limites | Isolamento por usuário/prefeitura, títulos, datas, agente, último modelo e identificação por turno. |
| Enviar contexto do agente e da conversa | Implementado | Prompt, bases vinculadas, histórico recente, mensagem e anexos autorizados. |
| Usar OmniRouter como gateway central | Adaptador implementado | URL, credencial, modelos e chamadas reais ainda precisam de configuração/validação. |
| Anexar e processar arquivos | Implementado para os formatos disponíveis | XLS, ZIP, áudio e vídeo permanecem indisponíveis. |
| Validar e proteger uploads | Implementado | Extensão, MIME, conteúdo, tamanho, nome, propriedade e isolamento; arquivos privados, sem execução. |
| Criar migration compatível com os dados | Concluído localmente | Migration aditiva aplicada com backup e comparação; aplicação no destino ainda pendente. |

## Pendências para a próxima etapa

### P01 — Administração no GitHub

O proprietário atual é a conta pessoal `cristhyna-lucena`. JEFERSON-ASSIS possui acesso de leitura ao conteúdo público, e o convite de colaboração com `write`, enviado em 5 de outubro, permanece pendente de aceitação.

Um repositório pessoal tem um único proprietário e colaboradores com leitura/escrita; não permite atribuir um segundo papel `Admin`. Para cumprir o pedido de administração, é necessário escolher uma destas alternativas:

1. Transferir o repositório para uma organização e atribuir `Admin` a JEFERSON-ASSIS, respeitando as permissões e políticas dessa organização.
2. Transferir o repositório para a conta JEFERSON-ASSIS, tornando-o proprietário. A transferência pessoal depende da aceitação do destinatário e da disponibilidade do nome no destino.

Aceitar o convite atual concede escrita. Fontes oficiais: [permissões de contas pessoais](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/repository-access-and-collaboration/permission-levels-for-a-personal-account-repository), [papéis em organizações](https://docs.github.com/en/organizations/managing-user-access-to-your-organizations-repositories/managing-repository-roles/repository-roles-for-an-organization) e [transferência de repositórios](https://docs.github.com/en/repositories/creating-and-managing-repositories/transferring-a-repository).

### P02 — Ativação real do OmniRouter

- Confirmar qual serviço OmniRouter é utilizado, sua documentação e o endereço oficial compatível com o contrato do adaptador.
- Configurar `OMNIROUTER_BASE_URL` e `OMNIROUTER_API_KEY` exclusivamente no ambiente do backend.
- Confirmar os modelos habilitados na conta e cadastrar seus identificadores exatos com nomes amigáveis, como GPT, Claude e Gemini.
- Declarar capacidades confirmadas: visão, ferramentas, temperatura, janela de contexto e limite de resposta.
- Cadastrar preços se a operação precisar calcular custos monetários. Preços ausentes permanecem como não configurados.
- Validar chamadas reais das famílias desejadas, streaming, contadores de consumo, cancelamento, erros, ferramentas e análise de imagens.

Não há endereço padrão presumido nem IDs de modelos inventados. O adaptador central tem precedência quando configurado; os adaptadores anteriores permanecem disponíveis para ambientes existentes. Embeddings possuem configuração separada.

O inventário do banco local na data deste levantamento é:

| Provedor | Modelo cadastrado | Preços | Capacidades |
| --- | --- | --- | --- |
| OpenAI | `gpt-4o-mini` | Não configurados | Não configuradas |
| Anthropic | Nenhum | — | — |
| Google | Nenhum | — | — |

Há três provedores e somente um modelo cadastrado. Esse cadastro não confirma disponibilidade do identificador na conta OmniRouter. Os modelos GPT/Claude/Gemini da prévia são fictícios. Nos arquivos locais consultados, credenciais reais de OmniRouter, OpenAI, gateway legado, embeddings e ferramentas externas não estavam preenchidas.

### P03 — Vinculação ao SGDM real

- Integrar fornecimento e renovação da sessão pelo host, contexto, montagem do módulo e navegação.
- Acordar assinatura JWT e configuração de issuer/audience quando aplicável.
- Mapear `sub` e `tenantId` do JWT aos usuários e prefeituras reais existentes no banco.
- Validar perfis, permissões, nomes exibidos e visual dentro do ambiente real.

A prévia local usa dados sintéticos; a vinculação ao SGDM real foi deixada para a etapa final. O contrato de sessão e eventos está no [README](../README.md#integração-com-sgdm).

### P04 — Implantação no destino

- Definir servidor, domínio e proxy com HTTPS.
- Preparar `deploy/.env.production` com banco, Redis, armazenamento, segredos de autenticação, origens CORS e configurações reais de IA. O arquivo de produção ainda não existe no workspace consultado.
- Definir imagens de armazenamento aprovadas e fixadas em tag/digest, bucket privado e credenciais próprias da aplicação.
- Aplicar migrations no banco do destino com `npm run prisma:deploy`, preservando os dados existentes.
- Provisionar prefeitura e identidades administrativas, mapear os IDs ao SGDM e definir licenças/limites operacionais.
- Configurar backups de banco/arquivos, testar restauração e estabelecer monitoramento de API, filas e armazenamento.
- Validar o fluxo completo com usuários, documentos, modelos e permissões reais.

Dockerfiles, Nginx e Compose de produção estão preparados. O Compose expõe o frontend em `127.0.0.1:8080`, para o proxy TLS; banco, Redis, armazenamento e API não publicam portas. A implantação no destino ainda não foi realizada/validada nesta entrega. Instruções: [produção](../README.md#produção) e [provisionamento](../README.md#primeira-prefeitura-e-administrador).

### P05 — Histórico além dos limites de exibição

A lateral lista até 100 conversas recentes; cada conversa reaberta exibe até 1.000 mensagens recentes. Não há paginação para navegar pelos registros anteriores na interface. Eles permanecem no banco, sujeitos à política de retenção. Acesso pela interface a todo esse histórico exige implementar paginação ou outro mecanismo de navegação.

### P06 — Alinhamento da regra de agentes ativos

O catálogo e a interface permitem envio somente com agente `ACTIVE`. O gateway bloqueia `ARCHIVED`, mas uma chamada direta autorizada à API ainda pode executar um agente `DRAFT`. É necessário alinhar a regra do servidor com a interface, caso a política de operação exija execução apenas de agentes ativos. Essa divergência foi registrada; ainda não foi corrigida.

### P07 — Configurações dependentes da operação

- Embeddings: configurar provedor/credencial para pesquisa semântica nas bases; sem eles, permanece a busca por termos literais. Configurar OmniRouter não ativa embeddings automaticamente.
- Ferramentas e integrações: configurar endpoints reais, domínios permitidos e referências de segredos para APIs, pesquisa, MCP e n8n. `TOOL_SECRET_*` precisa ser fornecido explicitamente ao container backend ou por override; o Compose padrão não injeta esses valores.
- Definir preços, limites de licença e política de retenção conforme a operação. Sem prazo salvo, a limpeza por retenção fica desativada.
- Se houver necessidade de restringir agentes por departamento ou usuário individual, implementar essa política: atualmente as permissões são por perfil/recurso e prefeitura, sem ACL individual de agente/departamento.

## Formatos e limites atuais

| Item | Comportamento |
| --- | --- |
| Documentos suportados | PDF, TXT, CSV, XLSX, DOCX, MD, JSON, XML e HTML; PDF digitalizado utiliza OCR local. |
| Imagens suportadas | PNG, JPG/JPEG e WEBP estático. Uso real exige OmniRouter, visão habilitada e janela de contexto cadastrada no modelo. |
| XLS e ZIP | Recusados: processamento seguro ainda não implementado. |
| Áudio e vídeo | Não implementados; evolução futura, condicionada à compatibilidade do backend e gateway. |
| Raciocínio avançado no OmniRouter | Controle de intensidade ainda não possui contrato validado; a opção no agente é recusada nesse fluxo. |
| Quantidade/tamanho | Até cinco anexos por turno; documentos até 20 MB e imagens até 10 MB. O servidor pode reduzir o limite de documentos. |
| Dimensões de imagens | Até 8192 pixels por lado e 16 milhões de pixels. |
| Contexto enviado à IA | Até 40 mensagens recentes e cinco arquivos únicos, respeitando o orçamento de contexto do modelo. |
| Texto dos anexos | Até 48 mil caracteres no total, com aviso de truncamento; arquivos maiores podem ter análise parcial. |
| Envio | Requer mensagem textual; anexar um arquivo sozinho não inicia uma chamada. |
| Resposta interrompida | Texto parcial não é salvo; pergunta e anexos ficam disponíveis para tentar novamente. |
| Exclusão de anexos | Arquivos vinculados a mensagens não podem ser apagados isoladamente pelo compositor; arquivos sem vínculo são limpos após 24 horas. |
| Permissão de arquivos | Upload, consulta, download, exclusão e uso exigem `agents:execute`, prefeitura e proprietário corretos. |
| MCP | Streamable HTTP implementado; stdio e SSE legado não fazem parte desta versão. |

Os anexos reutilizam S3/MinIO, fila e quotas existentes. Ficam fora dos documentos compartilhados, bases e consultas RAG. Conteúdo privado não gera embeddings. Segredos reais e backups permanecem fora do Git.

## Verificações e banco local

- Builds frontend/backend e quatro testes do consumidor SSE aprovados.
- Auditoria SGDM aprovada: 18 arquivos e 241 usos de componentes oficiais.
- Suite completa de backend com 166 testes aprovada durante a implementação; após os últimos ajustes, 28 testes de anexos/extratores e oito de seleção/histórico passaram. Essas execuções se sobrepõem e não devem ser somadas como testes únicos.
- Suite completa de interface com 39 testes aprovada; rodada final focada do chat com 15 testes aprovada, incluindo dois novos cenários. Total de 41 cenários distintos verificados e 115 capturas.
- Integração local PostgreSQL/Redis/MinIO aprovada com cinco chamadas exclusivamente ao gateway simulado, incluindo processamento de anexo e isolamento entre usuários/prefeituras.
- [CI do commit de implementação](https://github.com/cristhyna-lucena/i7ai-prefeituras/actions/runs/37360216695) aprovado nos jobs frontend/backend.
- Banco local com seis migrations aplicadas e nenhuma pendente. Backup PostgreSQL criado e validado em `output/backup`, ignorado pelo Git.
- Comparação de 30 tabelas confirmou IDs e hashes de todas as colunas anteriores preservados. Os documentos antigos conservaram seu escopo; Anthropic e Google foram adicionados ao catálogo.

Os testes de IA utilizaram serviços simulados. Chamadas reais, integração SGDM e implantação em produção continuam pendentes. Os resultados de 2 de outubro nos demais documentos são históricos; detalhes atuais da implementação estão em [Chat e OmniRouter](CHAT_OMNIROUTER.md) e [validação SGDM](VALIDACAO_SGDM.md).
