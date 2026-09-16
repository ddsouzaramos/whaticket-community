# Auditoria inicial do codebase WhaTicket

Esta auditoria estática foi concluída sem alterar arquivos da aplicação. No momento da análise, o repositório estava limpo no Git. Não foram executados build ou testes porque não havia `node_modules` nem lockfiles e a instalação de dependências modificaria o workspace.

A conclusão principal é: a arquitetura é relativamente simples e compreensível, mas existem riscos importantes em autorização, identidade de contatos `@lid`, consistência entre os dois providers, Socket.IO e reprodutibilidade do deploy. As adaptações existentes no `wwebjs.ts` são relevantes e devem ser preservadas.

## 1. Mapa da arquitetura

```text
┌─────────────────────────────────────────────────────────────┐
│ Frontend React 16 + Vite + Material-UI                      │
│                                                             │
│ Pages / Components / Hooks                                  │
│        │ Axios REST                  │ Socket.IO client      │
└────────┼─────────────────────────────┼───────────────────────┘
         │                             │
         ▼                             ▼
┌─────────────────────────────────────────────────────────────┐
│ Backend Node.js + Express + TypeScript                      │
│                                                             │
│ Routes → Controllers → Services → Models/Sequelize          │
│                         │                                   │
│                         ├─ Socket.IO                         │
│                         ├─ Uploads /public                   │
│                         └─ WhatsappProvider                  │
│                              ├─ wwebjs (padrão)              │
│                              └─ whaileys                     │
└─────────────────┬───────────────────────┬───────────────────┘
                  │                       │
                  ▼                       ▼
         MariaDB/MySQL/PostgreSQL    WhatsApp Web
         Redis opcional             Chromium ou socket nativo
```

Pontos de entrada:

- Backend: `backend/src/server.ts` → `backend/src/app.ts`
- Rotas: `backend/src/routes/index.ts`
- Banco: `backend/src/database/index.ts`
- Frontend: `frontend/src/index.js` → `frontend/src/App.js`
- Rotas frontend: `frontend/src/routes/index.js`
- Provider selecionado: `backend/src/providers/WhatsApp/whatsappProvider.ts`

## 2. Tecnologias

### Backend

- Node.js e TypeScript
- Express
- Sequelize 5 e `sequelize-typescript`
- MySQL/MariaDB por padrão; dependência para PostgreSQL disponível
- Socket.IO 3
- JWT com access token e refresh token
- Multer para mídia
- Sentry e Pino
- Redis opcional
- `whatsapp-web.js` via GitHub `main`
- `whaileys` como provider alternativo
- Jest, com testes concentrados somente em usuários

### Frontend

- React 16
- Vite 4
- Material-UI 4
- Axios
- Socket.IO Client
- React Router 5
- Formik/Yup
- i18next
- Recharts
- `mic-recorder-to-mp3`

### Infraestrutura

- Docker Compose
- MariaDB 10.6 por padrão
- Chromium local ou Browserless
- Nginx para o frontend
- Volume persistente para `.wwebjs_auth`, banco e mídias

## 3. Estrutura de diretórios

```text
backend/
├── src/
│   ├── controllers/        Adaptação HTTP
│   ├── routes/             Endpoints REST
│   ├── services/           Casos de uso e regras de negócio
│   ├── models/             Entidades Sequelize
│   ├── handlers/           Pipeline compartilhado de eventos WhatsApp
│   ├── providers/WhatsApp/ Abstração, wwebjs e whaileys
│   ├── helpers/            Leitura, tokens, templates e validações
│   ├── libs/               Socket.IO e Redis
│   ├── database/
│   │   ├── migrations/
│   │   └── seeds/
│   ├── middleware/         JWT e token da API
│   └── __tests__/          Somente testes de UserServices
├── public/                 Mídias recebidas/enviadas
└── Dockerfile

frontend/
├── src/
│   ├── pages/              Telas
│   ├── components/         Tickets, mensagens, contatos e modais
│   ├── hooks/              Auth, tickets, filas e conexões
│   ├── context/            Auth, tema, WhatsApp e resposta
│   ├── services/           Axios e Socket.IO
│   └── routes/
├── .docker/nginx/          Configuração do Nginx
└── Dockerfile
```

## 4. Models e relacionamentos

O centro do domínio é `Ticket`.

- `Contact`
  - Tem muitos `Ticket`
  - Tem muitos `ContactCustomField`
  - Identificadores únicos: `number` e `lid`
  - `number` passou a aceitar `NULL`

- `Ticket`
  - Pertence a `Contact`
  - Pertence opcionalmente a `User`
  - Pertence a `Whatsapp`
  - Pertence opcionalmente a `Queue`
  - Tem muitas `Message`
  - Estados usados: `pending`, `open`, `closed`

- `Message`
  - Pertence a `Ticket`
  - Pode pertencer ao `Contact` remetente
  - Pode referenciar outra `Message` por `quotedMsgId`
  - Armazena ACK, leitura, mídia e exclusão lógica

- `User`
  - Tem muitos tickets
  - Pertence opcionalmente a uma conexão `Whatsapp`
  - Relação N:N com `Queue` por `UserQueue`

- `Whatsapp`
  - Tem muitos tickets
  - Relação N:N com `Queue` por `WhatsappQueue`
  - Armazena QR, estado, sessão, mensagens de saudação/despedida e configuração default

- `WppKey`
  - Pertence a `Whatsapp`
  - Persiste chaves de sessão do Whaileys

Arquivos principais: `backend/src/models/Contact.ts`, `Ticket.ts`, `Message.ts`, `User.ts`, `Whatsapp.ts` e `WppKey.ts`.

## 5. Controllers, services e rotas

Principais grupos REST:

- `/auth`: login, cadastro, refresh e logout
- `/users`: usuários e associações com filas/WhatsApp
- `/contacts`: CRUD e importação
- `/tickets`: consulta, criação, atribuição, transferência e encerramento
- `/messages/:ticketId`: histórico e envio
- `/whatsapp`: cadastro das conexões
- `/whatsappsession`: início, reinício e logout de sessão
- `/queue`: filas
- `/quickAnswers`: respostas rápidas
- `/settings`: configurações
- `/api/messages/send`: envio externo por token

As regras estão distribuídas principalmente entre:

- `backend/src/handlers/handleWhatsappEvents.ts`
- `backend/src/services/TicketServices/`
- `backend/src/services/ContactServices/`
- `backend/src/services/WbotServices/`
- `backend/src/services/WhatsappService/`

Os controllers são em geral finos, mas ainda contêm validação, autorização e alguns fluxos compostos.

## 6. Fluxo de tickets/atendimentos

1. Uma mensagem entra.
2. O contato é localizado ou criado.
3. `FindOrCreateTicketService` procura ticket `open` ou `pending` para contato e conexão.
4. Se não encontrar:
   - Grupo: pode reabrir o último ticket.
   - Conversa individual: pode reabrir ticket atualizado nas últimas duas horas.
   - Caso contrário, cria um ticket `pending`.
5. Se a conexão possui filas:
   - Uma fila única é selecionada automaticamente.
   - Com várias filas, envia um menu.
   - A resposta numérica seleciona a fila.
6. O atendente aceita:
   - `pending` → `open`
   - associa `userId`
7. Pode devolver:
   - `open` → `pending`
   - remove a atribuição
8. Pode concluir:
   - `open` → `closed`
   - envia mensagem de despedida, se configurada
9. Ao reabrir, verifica se já existe outro ticket aberto para o mesmo contato/conexão.

Serviços centrais: `FindOrCreateTicketService.ts` e `UpdateTicketService.ts`.

## 7. Cadastro e gerenciamento de contatos

Existem três caminhos:

- Cadastro manual:
  - valida número;
  - consulta o WhatsApp;
  - busca foto;
  - cria contato e campos extras.

- Importação:
  - obtém contatos do provider;
  - cria os números ainda inexistentes.

- Criação automática:
  - ocorre ao receber uma mensagem;
  - busca por `number` e `lid`;
  - tenta mesclar registros duplicados.

A lógica `number` + `lid` está em `backend/src/services/ContactServices/CreateOrUpdateContactService.ts`. Ela é essencial e não deve ser simplificada.

## 8. Usuários, filas e permissões

O modelo funcional é:

```text
Usuário ── N:N ── Fila ── N:N ── Conexão WhatsApp
   │                  │
   └── atende Ticket ─┘
```

Na listagem padrão, o usuário vê:

- Tickets atribuídos a ele.
- Tickets pendentes.
- Apenas tickets das filas selecionadas ou sem fila.

Administradores recebem opções adicionais na interface por `frontend/src/rules.js`.

Entretanto, a proteção do backend é incompleta. Em grande parte das rotas, qualquer usuário autenticado pode acessar recursos diretamente. As regras visuais do componente `Can` não constituem autorização real.

## 9. Comunicação em tempo real

O servidor autentica o handshake com JWT e oferece salas:

- ID do ticket: chat aberto
- `pending`, `open`, `closed`: listas por estado
- `notification`: notificações gerais

Eventos principais:

- `appMessage`: mensagem criada/atualizada
- `ticket`: atualização, remoção ou reset de não lidas
- `contact`
- `user`
- `queue`
- `quickAnswer`
- `setting`
- `whatsapp`
- `whatsappSession`

O servidor está em `backend/src/libs/socket.ts`.

No frontend:

- `frontend/src/components/TicketsList/index.js` mantém a lista de tickets.
- `frontend/src/components/MessagesList/index.js` mantém as mensagens do ticket.
- Diversas telas abrem conexões Socket.IO independentes.

## 10. Integração com WhatsApp

A interface comum define inicialização, envio, mídia, leitura, exclusão, contatos, foto e histórico.

### `wwebjs`

- Provider padrão.
- Usa Chromium/Puppeteer e `LocalAuth`.
- Sessão persistida no volume `.wwebjs_auth`.
- Eventos centrais:
  - `message_create`
  - `media_uploaded`
  - `message_ack`
  - `ready`, `qr`, `disconnected`

Arquivo: `backend/src/providers/WhatsApp/Implementations/wwebjs.ts`.

### `whaileys`

- Não depende de Chromium.
- Usa eventos `messages.upsert`, `messages.update` e `message-receipt.update`.
- Credenciais principais ficam em `Whatsapp.session`.
- Chaves ficam em MySQL e, para alguns tipos, Redis.
- Possui tratamento mais completo de PN/LID.

Arquivo: `backend/src/providers/WhatsApp/Implementations/whaileys.ts`.

## 11. Fluxo completo de recebimento

```text
WhatsApp
  → evento do provider
      wwebjs: message_create/media_uploaded
      whaileys: messages.upsert
  → filtro shouldHandleMessage
  → normalização da mensagem, contato, grupo e mídia
  → handleMessage
  → CreateOrUpdateContactService
  → FindOrCreateTicketService
  → salva mídia em backend/public
  → atualiza Ticket.lastMessage
  → CreateMessageService / Message.upsert
  → Socket.IO appMessage
      ├─ sala do ticket
      ├─ sala do status
      └─ notification
  → frontend
      ├─ MessagesList adiciona a mensagem
      ├─ TicketsList cria/reposiciona o ticket
      └─ NotificationsPopOver notifica o atendente
```

Para uma conversa nova, não existe obrigatoriamente um evento separado de criação de ticket. O evento `appMessage`, contendo também o ticket, é o responsável por introduzi-lo na lista do frontend.

Depois da persistência, a mensagem pode executar a seleção automática de fila ou enviar o menu de filas.

## 12. Fluxo completo de envio

```text
MessageInput
  → POST /messages/:ticketId
  → MessageController.store
  → ShowTicketService
  → SetTicketMessagesAsRead
  → SendWhatsAppMessage ou SendWhatsAppMedia
  → monta chatId a partir de contact.number
  → whatsappProvider.sendMessage/sendMedia
  → WhatsApp
  → evento de mensagem própria retorna pelo provider
  → handleMessage
  → Message.upsert
  → Socket.IO appMessage
  → MessagesList e TicketsList
  → message_ack atualiza o ACK
  → Socket.IO appMessage action=update
```

Importante: o retorno de `sendMessage()` não é persistido diretamente pelo service. A persistência depende do evento de mensagem própria voltar pelo provider. Isso explica a importância das alterações de `message_create`.

## 13. Revisão específica de `wwebjs.ts` e `@lid`

As alterações existentes são válidas e devem ser preservadas.

O código identifica LID por:

- `msg.from`
- `msg.to`
- `msg.id.remote`

Quando encontra LID, evita `msg.getChat()`, pois esse caminho pode falhar. Para recebidas, define uma mensagem não lida; para enviadas, zero. Essa lógica está em `getMessageData()` dentro de `wwebjs.ts`.

Também existe um fallback em `sendMessage()`:

1. Registra temporariamente um listener `message_create`.
2. Executa `wbot.sendMessage(..., waitUntilMsgSent: true)`.
3. Usa o retorno direto, quando disponível.
4. Caso venha `undefined`, espera até dez segundos pelo evento.
5. Remove o listener no `finally`.

Isso foi introduzido por uma sequência recente de commits e não é código acidental.

Fragilidades específicas:

- O adapter `wwebjs` não preenche `ContactPayload.lid`.
- Para um contato LID, `id.user` acaba sendo tratado como `number`.
- O envio, leitura e exclusão reconstruem o destino como `number@c.us`.
- `sendSeen()` e histórico ainda chamam `getChatById()`.
- `getProfilePicUrl()` força `@c.us`.
- `syncUnreadMessages()` ainda usa `getChats()` e `chat.sendSeen()`.
- `msg.getContact()`/`getContactById()` continuam no caminho LID.
- O contador LID é fixado em `1`, não acumulado.
- O fallback `message_create` correlaciona apenas por corpo. Dois envios simultâneos com texto idêntico podem capturar o evento errado.
- `message_create` e `media_uploaded` podem processar a mesma mensagem mais de uma vez. O `upsert` protege o registro, mas o evento Socket.IO pode ser duplicado.

## 14. Banco de dados e migrations

O banco é inicializado por `sequelize-typescript`. O default é MySQL com `utf8mb4_bin`.

As migrations são incrementais e cobrem:

- Usuários, contatos, tickets, mensagens e conexões
- Campos extras
- ACK, leitura, mensagens citadas e exclusão
- Filas e tabelas N:N
- Associação usuário–WhatsApp
- `WppKeys`
- `Contacts.lid`
- `Contacts.number` opcional

Migrations relevantes ao fork:

- `backend/src/database/migrations/20241202230000-create-wpp-keys.ts`
- `backend/src/database/migrations/20241203000000-add-lid-to-contacts.ts`
- `backend/src/database/migrations/20241203000001-allow-null-number-in-contacts.ts`

Não há constraint que garanta “apenas um ticket aberto por contato/conexão”. A regra existe somente em código e está sujeita a concorrência.

## 15. Docker e processo de deploy

O Compose sobe:

- Backend
- Frontend/Nginx
- MariaDB
- Browserless opcional
- phpMyAdmin opcional

O backend:

- Instala Chromium.
- Compila TypeScript.
- Remove locks `Singleton*` antigos do Chromium.
- Executa migrations automaticamente.
- Inicia `dist/server.js`.

O frontend:

- Compila com Vite.
- É servido pelo Nginx.
- Injeta variáveis `VITE_*` em `window.ENV` no startup.

Persistências:

- `whaticket_mysql`
- `whaticket_public`
- `whaticket_auth`

Arquivos principais: `docker-compose.yaml`, `backend/Dockerfile` e `frontend/Dockerfile`.

## 16. Problemas técnicos encontrados

### Críticos ou altos

#### 16.1. Cadastro público pode criar administrador

O seed habilita `userCreation`. O `/signup` aceita `profile` do cliente e o service usa `admin` como default. Isso permite escalada de privilégio.

#### 16.2. Autorização insuficiente no backend

Tickets, mensagens, contatos, filas e conexões geralmente verificam somente se existe JWT. Um usuário pode acessar IDs fora das suas filas, alterar tickets e gerenciar conexões diretamente.

#### 16.3. `showAll=true` não é restrito a administrador

A filtragem é controlada pelo parâmetro enviado pelo cliente. Além disso, o filtro por data substitui integralmente as condições anteriores em `ListTicketsService.ts`.

#### 16.4. Salas Socket.IO sem autorização

Qualquer usuário autenticado pode solicitar qualquer `ticketId` ou status. O token identifica o usuário, mas seus dados não são usados para autorizar `socket.join()`.

#### 16.5. Compatibilidade LID incompleta no `wwebjs`

O recebimento foi protegido contra `getChat()`, mas identidade, envio, leitura, foto, histórico e exclusão ainda dependem de `number@c.us`.

#### 16.6. Contrato diferente entre providers

O `checkNumber()` do `wwebjs` retorna apenas o usuário; no Whaileys retorna um JID completo. Alguns controllers assumem que o resultado é sempre um número.

#### 16.7. Configuração Redis incompatível

O código lê `REDIS_URL` e `REDIS_DB`; o `.env.example` documenta `IO_REDIS_*`, e o Compose não fornece nenhum deles. No Whaileys, certos tipos de chave são desviados exclusivamente para Redis e podem deixar de ser persistidos quando ele não está configurado.

#### 16.8. Merge de contatos não transacional

O merge LID atualiza tickets e apaga o contato secundário, mas não migra explicitamente mensagens, campos customizados ou outros vínculos. Uma falha intermediária pode deixar dados inconsistentes.

### Médios

- Criação concorrente pode gerar tickets duplicados.
- IDs de mensagem são chave primária global, sem `whatsappId`.
- Persistência de mensagens enviadas depende do eco do provider.
- LID mantém `unreadMessages` em `1`, sem acumular.
- Whaileys atualmente informa `unreadMessages: 0`.
- Falha em um chat durante `getChats()` pode abortar toda a sincronização de não lidas.
- Eventos `message_create`/`media_uploaded` podem gerar emissões duplicadas.
- Transferência de usuário pode deixar ticket obsoleto na lista do usuário anterior.
- Fechamento automático é executado no frontend; depende de alguém manter a tela aberta.
- Várias conexões Socket.IO são abertas simultaneamente por tela.
- Eventos de contato, usuário e configuração são emitidos globalmente.
- Mídias ficam em `/public` sem autorização.
- Uploads não têm limite explícito de tamanho/tipo no Multer.
- Refresh cookie tem apenas `httpOnly`, sem `secure` ou `sameSite`.
- JWT possui secrets default conhecidos.
- `CreateWhatsAppService` sobrescreve `isDefault` com `!whatsappFound`.
- Logs do Whaileys podem registrar mensagens brutas e dados sensíveis.
- A busca de tickets aparenta usar alias singular `message` enquanto a associação é `messages`.
- Existem `console.log`, `any`, TODOs e tratamento de erros genérico em caminhos importantes.

### Deploy e manutenção

- Não existem `package-lock.json`/`yarn.lock`.
- `whatsapp-web.js` aponta para `GitHub#main`.
- Browserless usa `latest`.
- Builds não são reproduzíveis.
- O Compose usa apenas `expose`; não publica frontend/backend diretamente.
- O README ainda descreve portas, SSL e PM2 que não correspondem integralmente ao Compose atual.
- O `.env` raiz não expõe as variáveis novas de provider/Redis.
- A cobertura automatizada está restrita a `UserServices`.

## 17. Código legado e áreas de refatoração

Prioridades recomendadas:

1. Criar um tipo canônico `WhatsAppAddress` com `pn`, `lid`, `jid` e `isGroup`.
2. Parar de reconstruir JIDs com strings espalhadas pelos services.
3. Extrair resolução de contato/destino para o contrato do provider.
4. Separar ingestão, persistência e automação de filas no handler.
5. Aplicar autorização centralizada por usuário/fila/ticket.
6. Usar uma única conexão Socket.IO no frontend.
7. Tornar o envio transacional/idempotente, com estado `pending/sent/failed`.
8. Mover fechamento automático para job no backend.
9. Adicionar constraints/locks para impedir tickets concorrentes.
10. Atualizar dependências gradualmente; React, Material-UI, Sequelize e Axios estão em versões antigas.

## 18. Risco ao alterar cada área

| Área | Risco | Motivo |
|---|---:|---|
| `wwebjs.ts` / LID | Crítico | Pode interromper recebimento e envio real |
| Handler compartilhado | Crítico | Afeta os dois providers e toda mensagem |
| Identidade/merge de contatos | Crítico | Pode duplicar ou perder vínculos históricos |
| TicketServices | Alto | Estados, atribuição, filas e visibilidade |
| Socket.IO | Alto | Atualização das listas e isolamento entre usuários |
| Migrations/models | Alto | Dados históricos e compatibilidade de rollback |
| Autenticação/autorização | Alto | Sessões e acesso de todos os usuários |
| Whaileys/chaves Redis | Alto | Reconexão e descriptografia de sessões |
| Frontend de tickets | Médio-alto | Pode ocultar ou duplicar conversas |
| Docker/deploy | Alto | Sessões e mídias dependem de volumes/configuração |
| UI e componentes visuais | Médio | Impacto predominantemente de experiência |
| Respostas rápidas/traduções | Baixo | Domínio relativamente isolado |

## 19. Arquivos mais importantes para futuras modificações

- `backend/src/providers/WhatsApp/Implementations/wwebjs.ts`
- `backend/src/providers/WhatsApp/Implementations/whaileys.ts`
- `backend/src/providers/WhatsApp/whatsappProvider.ts`
- `backend/src/handlers/handleWhatsappEvents.ts`
- `backend/src/services/ContactServices/CreateOrUpdateContactService.ts`
- `backend/src/services/TicketServices/FindOrCreateTicketService.ts`
- `backend/src/services/TicketServices/UpdateTicketService.ts`
- `backend/src/services/MessageServices/CreateMessageService.ts`
- `backend/src/services/WbotServices/SendWhatsAppMessage.ts`
- `backend/src/helpers/SetTicketMessagesAsRead.ts`
- `backend/src/libs/socket.ts`
- `frontend/src/components/TicketsList/index.js`
- `frontend/src/components/MessagesList/index.js`
- `frontend/src/components/MessageInput/index.js`
- `docker-compose.yaml`

## 20. Proposta de documentação

Estrutura sugerida:

```text
docs/
├── README.md
├── architecture.md
├── domain-model.md
├── api/
│   ├── authentication.md
│   ├── tickets.md
│   ├── contacts.md
│   └── whatsapp-connections.md
├── whatsapp/
│   ├── provider-contract.md
│   ├── incoming-message-flow.md
│   ├── outgoing-message-flow.md
│   ├── lid-and-pn-identifiers.md
│   └── troubleshooting.md
├── realtime/
│   ├── socket-events.md
│   └── room-authorization.md
├── operations/
│   ├── environment-variables.md
│   ├── docker-deployment.md
│   ├── migrations-and-backup.md
│   └── session-recovery.md
└── decisions/
    ├── ADR-001-whatsapp-provider-abstraction.md
    ├── ADR-002-contact-identity-lid-pn.md
    └── ADR-003-ticket-lifecycle.md
```

## 21. Recomendação para a primeira evolução

A primeira mudança futura deve ser precedida por testes de caracterização do `wwebjs.ts`, especialmente para:

- mensagens com `@lid`;
- mensagens próprias;
- textos idênticos enviados simultaneamente;
- mídias;
- grupos;
- `getChat()` e `getChatById()`;
- `getChats()`;
- `getProfilePicUrl()`;
- `sendMessage()`;
- `sendSeen()`;
- criação e atualização de novas conversas;
- atualização da lista de tickets via Socket.IO.

Esses testes permitirão evoluir o fork sem remover ou simplificar as adaptações que hoje evitam falhas em `getChat()` e preservam a compatibilidade com identificadores LID.
