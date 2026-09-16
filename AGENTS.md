# AGENTS.md

## Escopo destas instruções

Estas regras valem para todo o repositório. Antes de alterar qualquer área, leia também a documentação relacionada em `docs/`, especialmente `docs/audits/initial-codebase-audit.md`.

Preserve mudanças existentes do usuário. Não reverta, simplifique ou substitua workarounds sem compreender e validar o comportamento que eles protegem.

## Visão geral

WhaTicket é uma aplicação de atendimento via WhatsApp organizada em dois projetos:

- `backend/`: Node.js, TypeScript, Express, Sequelize/Sequelize TypeScript, Socket.IO, JWT, Multer, MariaDB e providers `whatsapp-web.js` e `whaileys`.
- `frontend/`: React 16, Vite 4, Material-UI 4, Axios, React Router 5 e Socket.IO Client.
- Produção: Docker/Coolify, Nginx, MariaDB e volumes persistentes. O provider padrão é `wwebjs`, salvo configuração diferente em `WHATSAPP_PROVIDER`.

Não atualize frameworks ou dependências como efeito colateral de outra tarefa.

## Arquitetura básica

O backend segue, em linhas gerais:

```text
routes -> controllers -> services/helpers -> models/Sequelize -> MariaDB
                                      |-> provider WhatsApp
                                      |-> Socket.IO
```

O fluxo de mensagens recebidas é aproximadamente:

```text
WhatsApp -> provider -> handleMessage -> contatos/tickets/mensagens
         -> persistência -> Socket.IO -> reducers/componentes do frontend
```

O fluxo de envio parte de `MessageInput`, passa pela API e pelos services de envio, chega ao provider e retorna como mensagem própria pelo provider para ser persistido e emitido ao frontend.

Diretórios principais:

- `backend/src/controllers/`: camada HTTP.
- `backend/src/services/`: casos de uso e regras de negócio.
- `backend/src/models/`: models e relacionamentos.
- `backend/src/database/migrations/`: evolução do schema.
- `backend/src/providers/WhatsApp/`: contrato e implementações dos providers.
- `backend/src/handlers/`: pipeline compartilhado de eventos WhatsApp.
- `backend/src/libs/socket.ts`: autenticação e salas Socket.IO.
- `frontend/src/components/`: UI e reducers locais de tickets/mensagens.
- `frontend/src/hooks/`: carregamento e estado compartilhado.
- `frontend/src/services/`: Axios e conexão Socket.IO.

## Procedimento obrigatório antes de implementar

1. Leia `docs/audits/initial-codebase-audit.md` e qualquer documentação específica da área.
2. Execute `git status --short` e preserve alterações preexistentes ou não relacionadas.
3. Localize rotas, controllers, services, models, eventos Socket.IO e consumidores frontend envolvidos. Analise o fluxo completo, não apenas o arquivo citado na tarefa.
4. Identifique regras existentes, efeitos colaterais, permissões, associações do banco e comportamento dos dois providers quando aplicável.
5. Procure testes existentes e determine quais builds/testes podem ser executados com segurança.
6. Para banco, Docker, autenticação, WhatsApp ou Socket.IO, explicite os riscos antes de implementar uma mudança ampla ou destrutiva.
7. Faça a menor alteração coerente com a solicitação. Não inclua refatorações, atualizações de dependência ou limpeza de legado sem autorização.

## Regras para o backend

- Mantenha controllers focados em HTTP e regras reutilizáveis em services/helpers.
- Preserve os contratos de resposta, nomes de eventos Socket.IO e estados de ticket (`pending`, `open`, `closed`) salvo mudança explicitamente coordenada com o frontend.
- Toda autorização deve ser validada no backend. Regras visuais do frontend não são controle de acesso.
- Ao alterar tickets ou mensagens, verifique associação com usuário, fila, contato e conexão WhatsApp, além dos rooms/eventos afetados.
- Evite operações concorrentes não atômicas. Para merges, criação de tickets ou múltiplas gravações relacionadas, considere transações e idempotência.
- Não exponha conteúdo de mensagens, tokens, sessões ou dados pessoais em logs novos.
- Não modifique `node_modules` diretamente.
- Não dependa de comportamento específico de MySQL genérico: o banco deste ambiente é MariaDB.

## Regras para o frontend

- Preserve compatibilidade com React 16, Material-UI 4, React Router 5 e o padrão atual de Vite.
- Não altere payloads REST ou eventos Socket.IO isoladamente; ajuste e valide produtores e consumidores juntos.
- Ao mexer em tickets, teste conceitualmente e, quando possível, de forma prática: carga inicial, paginação, nova mensagem, nova conversa, transferência, mudança de fila/status, não lidas e reconexão do socket.
- Não trate permissões do componente `Can` como segurança; o backend precisa impor a mesma regra.
- Evite criar novas conexões Socket.IO por componente sem avaliar ciclo de vida, reconexão, listeners duplicados e cleanup.
- Não mova regras operacionais críticas somente para o navegador. Processos que precisam ocorrer sem uma tela aberta devem ficar no backend.

## WhatsApp: área crítica

Este fork contém adaptações específicas para mudanças recentes do WhatsApp Web e identificadores `@lid`. Elas não devem ser removidas, revertidas ou simplificadas sem testes de caracterização e evidência de que o comportamento substituto cobre os mesmos casos.

Antes de qualquer alteração relacionada ao WhatsApp, leia no mínimo:

- `backend/src/providers/WhatsApp/Implementations/wwebjs.ts`
- `backend/src/handlers/handleWhatsappEvents.ts`
- `backend/src/services/ContactServices/CreateOrUpdateContactService.ts`
- `backend/src/services/WbotServices/SendWhatsAppMessage.ts`
- `backend/src/helpers/SetTicketMessagesAsRead.ts`

Quando a mudança tocar o contrato compartilhado, leia também `whatsappProvider.ts`, a implementação `whaileys.ts`, os services de tickets/mensagens e os consumidores Socket.IO no frontend.

Regras obrigatórias:

- Não assuma que `number@c.us` é sempre o identificador correto. Considere PN, LID, grupos, JID efetivo do provider e a possibilidade de `number` ausente.
- Preserve a associação entre PN e LID e a lógica de merge/criação automática de contatos. Não use apenas dígitos como identidade universal.
- Preserve os workarounds que evitam `getChat()`/`getChatById()` em caminhos LID até existir substituição validada.
- Avalie explicitamente `message_create`, `getChat()`, `getChatById()`, `getChats()`, `getProfilePicUrl()`, `sendMessage()` e `sendSeen()`.
- O envio não termina no retorno HTTP: mensagens enviadas retornam pelo provider e esse eco participa da persistência, ACK, Socket.IO e atualização do frontend.
- Ao alterar listeners, valide duplicidade, correlação de mensagens simultâneas, cleanup, timeout, reconexão e eventos de mídia.
- Teste ou caracterize tanto tickets existentes quanto a criação/exibição de uma conversa nova.
- Considere os dois providers e documente conscientemente qualquer diferença de comportamento.
- Nunca apague, recrie ou limpe o diretório persistente `.wwebjs_auth` como tentativa de correção.
- Não remova volumes ou chaves de sessão do Whaileys. Não force novo QR/logout sem autorização explícita.

### Problema conhecido: novas conversas em tempo real

Existe uma reclamação em investigação: após algum tempo, novas conversas podem parar de aparecer ou atualizar automaticamente no frontend.

Não aplique correções especulativas. Ao investigar, observe a cadeia completa:

```text
WhatsApp -> provider/listener -> handleMessage -> contato/ticket/mensagem
         -> CreateMessageService -> rooms/eventos Socket.IO
         -> TicketsList/MessagesList/NotificationsPopOver
```

Registre evidências sobre conexão/reconexão, rooms, listeners, criação do ticket, payload do `appMessage`, filtros de usuário/fila/status e reducers antes de propor uma correção.

## Banco de dados e migrations

- O banco de produção deste ambiente é MariaDB.
- Toda alteração de schema deve ser feita por uma nova migration em `backend/src/database/migrations/`. Nunca dependa de alteração manual ou `sync({ alter: true })`.
- Não edite migrations já aplicadas para redefinir histórico. Crie uma migration incremental.
- Inclua `up` e `down` seguros sempre que tecnicamente possível.
- Avalie dados existentes, `NULL`, índices únicos, foreign keys, charset/collation e custo de lock antes de alterar colunas grandes.
- Mudanças destrutivas ou backfills exigem estratégia de backup, implantação e rollback documentada.
- Nunca rode testes, seeds, rollback geral ou comandos destrutivos contra banco de desenvolvimento compartilhado ou produção.
- O script `npm test` do backend executa migrations/seeds antes dos testes e desfaz migrations depois. Use apenas banco de teste dedicado e confirme `NODE_ENV=test` e credenciais antes de executá-lo.

## Docker, Coolify e produção

- Produção utiliza Docker/Coolify; preserve esse caminho de deploy.
- O servidor de produção possui outros serviços e aplicações além do WhaTicket.
- Existe uma instância PostgreSQL/pgvector utilizada por outra aplicação. Esse PostgreSQL não pertence ao WhaTicket.
- Nunca pare, remova, recrie ou altere volumes, banco, portas ou configuração desse PostgreSQL como parte de uma tarefa do WhaTicket.
- Restrinja operações Docker aos containers e recursos explicitamente pertencentes ao WhaTicket.
- Nunca execute comandos de limpeza Docker indiscriminados que possam afetar outros projetos do servidor.
- Não remova volumes persistentes, especialmente banco, `whaticket_public` e `whaticket_auth`/`.wwebjs_auth`.
- Não use `docker compose down -v`, limpeza indiscriminada de volumes ou recriação de sessões como procedimento comum.
- Preserve compatibilidade ARM64. Não introduza imagens, binários, dependências nativas ou flags exclusivas de `amd64` sem alternativa ARM64 validada.
- Alterações em Dockerfiles, Compose, Nginx, portas, healthchecks, variáveis ou comandos de startup devem considerar rollout e rollback no Coolify.
- Migrations executadas no startup precisam permanecer compatíveis com múltiplas tentativas de deploy.
- Secrets, tokens, cookies, QR codes, dumps, sessões e credenciais nunca devem ser adicionados ao Git. Use variáveis de ambiente/segredos do Coolify e mantenha somente exemplos sem valores reais.
- Não faça commit de `.env`, `.wwebjs_auth`, uploads, dumps ou artefatos de build.

## Validação obrigatória depois de uma alteração

Execute o que for aplicável e registre claramente o que não pôde ser executado:

1. Backend: em `backend/`, execute `npm run build`.
2. Frontend: em `frontend/`, execute `npm run build`.
3. Testes backend: execute `npm test` somente com banco de teste isolado e configurado; lembre que o script migra, semeia e depois desfaz migrations.
4. Não há script de teste frontend configurado atualmente; não alegue que testes frontend passaram sem adicionar/executar uma suíte autorizada.
5. Execute testes direcionados adicionais para a área alterada. Em WhatsApp/Socket.IO, prefira testes de caracterização e cenários de entrada/saída, LID, conversa nova e reconexão.
6. Revise `git status --short` e `git diff --check`.
7. Leia o diff completo de todos os arquivos modificados e confirme que não há arquivos gerados, secrets, debug temporário ou mudanças fora do escopo.
8. No handoff, informe: arquivos alterados, validações executadas, validações não executadas, impactos possíveis, migrations/configurações necessárias e riscos residuais.

Não instale dependências apenas para ocultar a ausência de validação. Se a instalação for necessária, informe o impacto e peça autorização quando ela modificar o workspace ou exigir rede/credenciais.

## Áreas de alto risco

- Identidade WhatsApp, PN/LID, sessões e providers.
- `message_create`, mensagens próprias, mídias, ACK e idempotência.
- Criação/merge de contatos e criação/reabertura de tickets.
- Socket.IO, autenticação de rooms e atualização da lista de tickets.
- Autenticação, cadastro, autorização de usuários/filas e acesso direto por ID.
- Models, migrations, índices, foreign keys e dados históricos.
- Volumes, `.wwebjs_auth`, chaves Whaileys, Docker/Coolify e startup.
- Uploads/mídias públicas e exposição de dados sensíveis.

Mudanças nessas áreas exigem análise ponta a ponta, plano de rollback e validação proporcional ao risco.

## Documentação

- Auditoria completa: `docs/audits/initial-codebase-audit.md`.
- Consulte os demais arquivos em `docs/` conforme forem adicionados.
- Quando uma mudança alterar arquitetura, fluxo operacional, variáveis, deploy, schema ou comportamento dos providers, atualize a documentação correspondente na mesma tarefa, salvo instrução explícita em contrário.
- Este arquivo contém regras práticas; não replique aqui toda a auditoria.
