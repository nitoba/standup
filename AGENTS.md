# Projeto: Standup Bot

## Visao Geral

Servico que automatiza a geracao de standups diarios baseado no historico de commits
dos repositorios da empresa. Coleta dados git, gera relatorios via IA (AI SDK da Vercel),
permite revisao/aprovacao via bot do Discord, e publica standups aprovados num canal do Discord.

O usuario e um desenvolvedor web full stack que precisa gerar reports de standup ao final do dia.
Hoje ele faz isso manualmente usando uma skill de terminal. Este projeto transforma isso
num servico persistente com agendamento, lembretes e publicacao automatizada.

### Fluxo Principal

1. **Coleta**: Busca commits do dia nos repos da empresa via git
2. **Enriquecimento**: Consulta Azure DevOps via MCP para detalhes de work items
3. **Geracao**: LLM gera o standup formatado em portugues
4. **Revisao**: Bot do Discord envia DM com preview + botoes (Aprovar/Rejeitar/Regenerar)
5. **Publicacao**: Standup aprovado e publicado no canal do Discord
6. **Persistencia**: Todos os standups ficam salvos no SQLite para busca/filtro/resumos

### Modos de Operacao

- **Cron**: Horario fixo configuravel (ex: 17:30 em dias uteis)
- **Manual**: Trigger via comando no Discord ou HTTP API
- **Lembrete**: 5-10 min antes do cron, DM com opcao de adiar/cancelar

## Stack

- Runtime: Bun 1.x
- Linguagem: TypeScript (strict mode)
- Testes: Vitest (pacotes com mocks complexos) + bun test (pacotes simples)
- Linter/Formatter: Biome
- ORM: Drizzle ORM + SQLite (WAL mode)
- HTTP Server: Hono
- Validacao: Zod
- Error Handling: better-result (Result + TaggedError)
- LLM: AI SDK da Vercel (provider configuravel)
- Azure DevOps: MCP client para work items e PRs
- Discord: discord.js (bot com botoes + DM)
- Scheduler: croner (cron expressions em Bun)
- Logs: Winston (estruturado com contexto por servico)
- Deploy: Docker + VPS

## Design Patterns

- Monorepo com apps independentes em `apps/*` e codigo compartilhado em `packages/*`
- Cada app deve ser focado em uma responsabilidade unica
- Regra: bot nao contem regra de negocio; bot apenas dispara fluxos
- Services para logica de negocio em pacotes compartilhados
- Schemas Zod para validacao de entrada e saida
- Erros explicitos com better-result (Result + TaggedError, sem try/catch)
- Jobs idempotentes
- Logs estruturados; evitar `console.log` em apps/pacotes
- Barrel exports apenas em modulos publicos
- Nunca use `any` — prefira `unknown` + type guard
- Prefira composicao sobre heranca
- Estado de standups via state machine simples: draft -> pending_review -> approved -> published (ou rejected -> draft)

## Configuracao de Ambiente

- `packages/config` nao usa mais um schema global unico para o monorepo
- Sempre modelar env por contexto de app, com `baseEnvSchema` compartilhado
- Loaders atuais:
  - `loadApiEnv()`
  - `loadBotEnv()`
  - `loadWorkerEnv()`
- Tipos atuais:
  - `ApiEnv`
  - `BotEnv`
  - `WorkerEnv`
- Cada entrypoint valida apenas as vars que o proprio processo usa
- Nao reintroduzir `loadEnv()` global ou um `AppEnv` monolitico
- Se uma nova env for necessaria, adicionar no schema do app correto; so promover para `baseEnvSchema` se for realmente compartilhada

## Arquitetura de Comunicacao

```
                    ┌─────────────────────────────────────────────────────────┐
                    │                        web (Angular)                    │
                    │  StandupEventsService (EventSource /standups/events)    │
                    └────────────┬────────────────────────────────────────────┘
                                 │ GET /standups/events (SSE, credenciais)
                                 ▼
┌───────────────────────────────────────────────────────────────────────────────────┐
│                              api  (porta 3333)                                    │
│  GET  /standups/events      ← SSE stream por userId (EventBus in-memory)          │
│  POST /standups/trigger     ← sessao Better Auth OU x-internal-secret             │
│  POST /standups/:id/approve ← sessao Better Auth                                  │
│  GET/PATCH /standups/*      ← sessao Better Auth                                  │
│  POST /internal/events/standup-generated  ← worker (x-internal-secret)            │
└──────────┬──────────────────────────────────┬────────────────────────────────────┘
           │ POST /internal/trigger/standup   │ POST /internal/notify/standup-status-changed
           ▼                                  ▼
┌──────────────────────┐          ┌────────────────────────────────────────────────┐
│  worker (porta 3335) │          │            discord-bot (porta 3334)            │
│  scheduler + HTTP    │          │  Hono interno + Gateway Discord (discord.js)   │
│                      │          │                                                │
│  runStandupJob():    │          │  POST /internal/notify/standup-ready           │
│  1. acquireLock      │          │  POST /internal/notify/standup-reminder        │
│  2. notifyUserDm     │          │  POST /internal/notify/job-failed              │
│     "em processamento│          │  POST /internal/notify/standup-status-changed  │
│  3. collectGit       │          │  POST /internal/notify/user-dm                 │
│  4. generateStandup  │          └────────────────────────────────────────────────┘
│  5. persist (draft)  │                       ▲            │
│  6. notifyReady ─────┼───────────────────────┘            │ snooze/cancel
│  7. notifyGenerated ─┼─► api /internal/events/...         ▼
│                      │          ┌──────────────────────────────┐
│  POST /internal/      │          │  worker /internal/reminder/* │
│    reminder/snooze   │◄─────────┤  snooze / cancel-today       │
│    reminder/cancel   │          └──────────────────────────────┘
└──────────────────────┘
```

### Regras de comunicacao

- Worker nao sabe que Discord existe — apenas faz POST HTTP generico para bot e API
- API nao executa job inline — apenas encaminha trigger para o worker (202 Accepted)
- Web recebe atualizacoes via SSE (`/standups/events`) — sem polling
- Aprovacao via web: API transiciona status → notifica bot (fire-and-forget) → bot edita DM + publica no canal
- `POST /standups/trigger` aceita sessao Better Auth (web) ou `x-internal-secret` (Discord slash command)
- discord-bot sobe **dois servidores** na mesma instancia:
  - Hono na `BOT_INTERNAL_PORT` (3334) para rotas internas
  - Gateway Discord (discord.js) para interacoes com botoes e modais
- worker sobe scheduler + Hono interno na `WORKER_INTERNAL_PORT` (3335)
- Autenticacao interna: header `x-internal-secret` com `INTERNAL_SECRET`
- Falha no DM e **non-fatal**: standup salvo no DB, usuario aprova via web ou API
- `ReminderState` e in-memory no worker — snooze/cancel afetam apenas o cron do dia corrente
- Portas: `api=3333`, `discord-bot=3334`, `worker=3335`

### DMs enviadas ao usuario (Discord)

| Momento | Titulo | Cor |
|---|---|---|
| Lock adquirido (job iniciou) | ⏳ Standup ja em processamento | INFO azul |
| Lock held (outro job rodando) | ⏳ Standup ja em processamento | WARNING ambar |
| Job ja completou hoje | ✅ Standup ja gerado hoje | INFO azul |
| Nenhum commit encontrado | 🔍 Nenhuma atividade encontrada | WARNING ambar |
| Standup pronto para revisao | embed azul + botoes Aprovar/Rejeitar/Ajustar/Regenerar | — |
| Job falhou | ❌ Falha ao gerar standup | ERROR vermelho |
| Aprovado/rejeitado via web | ✅/❌ editado na DM de revisao | — |

## Convencoes de Codigo

- camelCase para variaveis e funcoes
- PascalCase para types, interfaces e classes de erro
- UPPER_SNAKE_CASE para constantes e env vars
- Arquivos: kebab-case (ex: standup-generator.ts, discord-publisher.ts)
- Testes: co-locados (standup-generator.test.ts ao lado de standup-generator.ts)

## Principios de Organizacao de Arquivos

### Uma funcao/responsabilidade por arquivo

Cada arquivo exporta **uma unica funcao principal**. Nunca agrupar funcoes nao relacionadas
num mesmo arquivo so porque "sao do mesmo modulo".

```
# ERRADO — duas responsabilidades no mesmo arquivo
notify-standup-ready.ts  ← exporta notifyStandupReady() E notifyJobFailed()

# CORRETO — um arquivo por responsabilidade
notifications/
  notify-standup-ready.ts   ← exporta so notifyStandupReady()
  notify-job-failed.ts      ← exporta so notifyJobFailed()
```

### Agrupamento por contexto, nao por tipo

Pastas agrupam arquivos pelo **que fazem juntos**, nao pelo que sao tecnicamente.
So crie uma pasta quando houver 2+ arquivos do mesmo contexto.

```
# ERRADO — agrupa por tipo tecnico
handlers/
  button-handler.ts
  slash-command-handler.ts
  interaction-handler.ts
notifications/
  send-review-dm.ts
  send-channel-notification.ts
  publish-standup.ts

# CORRETO — mesmo resultado, mas o criterio e correto
# (neste caso coincide, mas o raciocinio importa)
```

### index.ts e entrypoint puro

O `index.ts` de cada app so contem: carregar env, instanciar dependencias, conectar servicos.
**Nenhuma logica de negocio ou handler inline**.

```ts
// CORRETO — index.ts como bootstrap puro
client.on(Events.InteractionCreate, async (interaction) => {
  if (interaction.isChatInputCommand()) {
    await handleSlashCommand(interaction, client, env); // delega
    return;
  }
  if (interaction.isButton()) {
    await handleButtonInteraction(interaction, client, env); // delega
  }
});
```

### Arquivo utilitario fica proximo de quem o usa

`embeds.ts` fica em `discord/` (raiz do contexto Discord), nao dentro de `notifications/`,
porque e usado tanto por `notifications/` quanto potencialmente por `handlers/`.

## Estrutura de Pastas

```
standup/
  apps/
    api/                    # Hono API — auth, standups CRUD, SSE, trigger proxy
      src/
        auth/               # Better Auth (Discord OAuth), session middleware, login/logout
        http/
          internal-router.ts  # POST /internal/events/standup-generated
          middleware.ts        # requestLogger
        notifications/
          notify-standup-status-changed.ts  # fire-and-forget → bot (aprovacao/rejeicao via web)
        reminders/          # Proxy de lembretes para o worker (run-now, snooze, cancel)
        repos/              # GET /repos — lista repos do worker
        services/
          standup-approve-service.ts   # logica de aprovacao (DB + notify bot)
          standup-trigger-service.ts   # POST → worker /internal/trigger/standup
        settings/           # GET/PUT /settings/me — user_settings
        sse/
          event-bus.ts      # EventBus in-memory (Map<userId, Set<Listener>>)
          sse-handler.ts    # GET /standups/events — streamSSE com keepalive + onAbort
        standup/
          router.ts         # createStandupRouter — IMPORTANTE: /events ANTES de /:id
          list.ts / get-by-id.ts / trigger.ts / approve.ts / update-status.ts
        index.ts            # Bootstrap: auth + SSE + routers

    web/                    # Angular 21 SPA — dashboard, detalhe, settings
      src/app/
        services/
          standup.service.ts        # httpResource (lista+detalhe), trigger/approve/reject/adjust/regenerate
          standup-events.service.ts # EventSource /standups/events → standupGenerated$ Subject
          settings.service.ts
        pages/
          dashboard/        # tabela com pulse no pending mais recente, filtros, metricas
          standup-detail/   # detalhe com acoes (approve/reject fire-and-forget via SSE)
          settings/

    discord-bot/            # Bot Discord — DMs, botoes, slash commands, HTTP interno
      src/
        discord/
          commands/         # /standup trigger | list | approve
          handlers/
            button-handler.ts        # routing standup:* e standup-reminder:*
            interaction-handler.ts   # approve/reject/regenerate + transicoes de estado
            approve-modal-handler.ts # modal de aprovacao com custom entries
            adjust-modal-handler.ts  # modal de ajuste de texto
            modal-handler.ts         # modal de regeneracao completa
            reminder-handler.ts      # run-now / snooze / cancel-today
            update-review-message.ts # editReply — sem message.edit (nao cachead em DM)
          notifications/    # send-review-dm | publish-standup | send-reminder-dm | send-channel-notification
          embeds.ts         # buildReviewEmbed | buildPublishedEmbed | buildJobFailedEmbed | buildReminderEmbed
        http/
          notify/
            standup-ready.ts         # POST /internal/notify/standup-ready
            standup-status-changed.ts # POST /internal/notify/standup-status-changed
            job-failed.ts / standup-reminder.ts / user-dm.ts
          routes/           # registerXxxRoute — um arquivo por rota
          router.ts         # createInternalRouter — todas as rotas /internal/*
        services/
          standup-notification-service.ts  # notifyStandupReady → sendReviewDm + updateDmMessageId
          standup-sync-service.ts          # syncStandupStatus — edita DM + publica apos aprovacao web
          trigger-standup-service.ts / job-notification-service.ts
        index.ts            # Bootstrap: env + Client + HTTP server + event listeners

    worker/                 # Scheduler e pipeline de geracao
      src/
        job/
          standup-job.ts    # acquireLock → notifyUserDm(inicio) → collect → generate → persist → notifyReady → notifyGenerated
        http/
          router.ts         # /internal/trigger/standup + /reminder/snooze + /reminder/cancel + /health
          handlers/         # trigger-standup | reminder-snooze | reminder-cancel | repos-list
        notifications/
          notify-standup-ready.ts      # POST bot /internal/notify/standup-ready
          notify-standup-generated.ts  # POST api /internal/events/standup-generated (SSE)
          notify-job-failed.ts / notify-standup-reminder.ts / notify-user-dm.ts
        scheduler.ts        # standupCron + reminderCron + recoveryCron + ReminderState
        index.ts            # Bootstrap: scheduler + HTTP interno

  packages/
    config/           # baseEnvSchema + loadApiEnv / loadBotEnv / loadWorkerEnv
    domain/           # StandupStatus, state machine, TaggedErrors, Zod schemas
    db/               # Drizzle schema, StandupRepository, JobRunRepository, UserRepository
    logger/           # Winston estruturado com createServiceLogger / withContext
    git-collector/    # collectGitActivity — git log por repo, autor e periodo
    standup-generator/
      src/
        azure/        # AzureMcpClient (Result pattern) + enrichGitActivity
        prompt/       # determineMeetingType + buildSystemPrompt + buildUserMessage
        generator.ts  # generateStandup + generateAdjustedStandup (retry interno + fallback MCP)

  data/               # SQLite files (gitignored)
  drizzle/            # Migrations SQL geradas pelo Drizzle Kit
  turbo.json          # Pipeline: lint → typecheck → test → build
```

## Ordem de Implementacao (Obrigatoria)

1. Fase 0: contrato de arquitetura + responsabilidades por app
2. Fase 1: fundacoes (turbo, tsconfig strict, biome, vitest, CI)
3. Fase 1: contratos de dominio e testes dos paths Ok/Err
4. Fase 2: features por fatias pequenas (collector, generator, persistence, bot, scheduler)
5. So com `bun run ci` verde: lint + typecheck + test

## Regras de Monorepo (Turborepo)

- Scripts de task ficam em cada pacote/app (`build`, `lint`, `typecheck`, `test`)
- Root apenas delega: `turbo run <task>`
- Evitar logica de build no root `package.json`
- Definir outputs de build para cache (`dist/**`)
- Dependencias internas sempre via `workspace:*`
- Cache stale apos mudancas de biome/lint: usar `--force` para invalidar

## Env Vars Necessarias

```
# Base (compartilhado entre apps quando aplicavel)
NODE_ENV=development
DATABASE_URL=./data/standup.db
INTERNAL_SECRET=change-me-in-production
REPOS_ROOT_PATH=/home/nitoba/Documents/repos/ibs/repos

# API (loadApiEnv)
PORT=3333
DISCORD_CLIENT_ID=
DISCORD_CLIENT_SECRET=
BETTER_AUTH_SECRET=
BETTER_AUTH_URL=http://localhost:3333
WORKER_INTERNAL_URL=http://localhost:3335

# Discord Bot (loadBotEnv)
BOT_INTERNAL_PORT=3334
API_BASE_URL=http://localhost:3333
WORKER_INTERNAL_URL=http://localhost:3335
DISCORD_BOT_TOKEN=
DISCORD_CHANNEL_ID=       # Canal onde publica standups
DISCORD_GUILD_ID=         # Opcional: guild commands (dev) vs global (prod)

# Worker (loadWorkerEnv)
# Nota: timezone, crons, gitAuthor, gitSincePeriod e repos subpath
# agora sao preferencias persistidas por usuario em user_settings.
WORKER_INTERNAL_PORT=3335
BOT_INTERNAL_URL=http://localhost:3334
AI_PROVIDER_API_KEY=
AZURE_DEVOPS_ORG=
AZURE_DEVOPS_PAT=
AZURE_DEVOPS_DEFAULT_PROJECT=AGROTRACE

# Docker Compose (infra, opcional)
HOST_REPOS_ROOT_PATH=/home/nitoba/Documents/repos/ibs/repos
```

Cada processo deve chamar apenas seu loader:

- API: `loadApiEnv()`
- Bot: `loadBotEnv()`
- Worker: `loadWorkerEnv()`

## Hurdles (Barreiras Conhecidas)

- discord.js com Bun: funciona nativamente desde Bun 1.1+
- SQLite WAL mode: necessario para leitura concorrente (bot + scheduler + API)
- AI SDK: usar provider configuravel com `generateObject` para geracao de standups
- croner: alternativa leve ao node-cron, funciona bem com Bun

### Vitest + Bun globals (oven-sh/bun#4145)

Vitest roda seus workers em **Node**, nao no runtime Bun. Globais como `Bun.randomUUIDv7()`
nao existem no ambiente de teste. Solucao adotada: shim em `vitest.setup.ts`:

```ts
// apps/worker/src/vitest.setup.ts
import { randomUUID } from "node:crypto";
if (typeof globalThis.Bun === "undefined") {
  Object.assign(globalThis, {
    Bun: { randomUUIDv7: (): string => randomUUID() },
  });
}
```

Referenciar no `vitest.config.ts` local do pacote:

```ts
// apps/worker/vitest.config.ts
export default defineConfig({
  test: { setupFiles: ["./src/vitest.setup.ts"] },
});
```

`bunx --bun vitest` nao funciona com monorepo ESM (imports SSR corrompidos). Manter
`vitest run` via `bun run test` e usar o shim acima.

### Biome --unsafe pode trocar node:crypto por Bun globals

`biome check --write --unsafe` pode substituir `crypto.randomUUID()` por `Bun.randomUUIDv7()`.
Isso quebra testes Vitest (que rodam em Node). Sempre revisar o diff apos `--unsafe`.
Se ocorrer, o shim em `vitest.setup.ts` resolve sem precisar reverter o codigo.

### vi.mock com classes instanciadas com `new`

`vi.fn().mockImplementation(() => ...)` cria arrow function — nao funciona com `new`.
Usar funcao construtora real:

```ts
vi.mock("@standup/db", () => {
  function StandupRepository() {
    return { create: mocks.repoCreate };
  }
  return { getDb: mocks.getDb, StandupRepository };
});
```

O mesmo padrao se aplica ao `discord.js Client`:

```ts
function Client(this: Record<string, unknown>) {
  this.login = mocks.login;
  this.once = mocks.once;
}
```

### vi.hoisted() para evitar TDZ em vi.mock factories

Quando factories de `vi.mock()` referenciam variaveis declaradas no mesmo escopo,
usar `vi.hoisted()` para evitar TDZ (Temporal Dead Zone):

```ts
const mocks = vi.hoisted(() => ({
  collect: vi.fn(),
  notifyStandupReady: vi.fn(),
}));
vi.mock("../notifications/notify-standup-ready.js", () => ({
  notifyStandupReady: mocks.notifyStandupReady,
}));
```

### Vitest + import transitive de router (bun:sqlite)

Quando um teste importa `router.ts`, ele carrega handlers e services transitivamente.
Se algum service importa `@standup/db`, o Vitest (Node) tenta resolver `bun:sqlite` e falha.

Padrao para testes de router: mockar **todos** os services importados pelo router,
mesmo os nao usados diretamente no teste.

Exemplo (`apps/api/src/standup/trigger.test.ts`): ao testar apenas `/standups/trigger`,
foi necessario mockar tambem `listStandups/getStandupById/updateStandupStatus`.

### discord.js: race condition no ClientReady

`client.login()` e async mas o client so esta pronto no evento `ClientReady`.
Padrao correto para aguardar conexao:

```ts
await new Promise<void>((resolve, reject) => {
  client.once(Events.ClientReady, () => resolve());
  client.once(Events.Error, reject);
  client.login(token).catch(reject);
});
```

### discord.js isSendable() para channels com send()

`channel.isTextBased()` retorna uma union que inclui `PartialGroupDMChannel` que nao tem `send()`.
Usar `channel.isSendable()` para narrowing correto antes de enviar mensagem:

```ts
if (!channel.isTextBased() || !channel.isSendable()) {
  throw new ExternalServiceError({
    service: "discord",
    message: "Not a sendable channel",
  });
}
await channel.send({ content });
```

`SendableChannels` e exportado como tipo: `type SendableChannels = Extract<Channel, { send: (...args: any[]) => any }>`.

### interaction.deferUpdate() para evitar timeout de 3s no Discord

Operacoes de DB + publicacao podem demorar mais que 3s (limite do Discord para interacoes).
Padrao correto:

```ts
await interaction.deferUpdate(); // avisa Discord que estamos processando
// ... logica async ...
await interaction.editReply({
  // atualiza a mensagem original
  content: result.message,
  components: [], // remove os botoes apos a acao
});
```

`deferUpdate()` edita a mensagem original (botoes permanecem desabilitados).
`editReply()` com `components: []` remove os botoes para evitar cliques duplicados.

### Mock de discord.js Client para testes

O Client real conecta ao Discord. Para testes unitarios, passar um fake client tipado:

```ts
const fakeClient = {} as unknown as Client;

// Para testar funcoes que usam channels.fetch:
function makeClient(channelResult: unknown) {
  const fetchChannel = vi.fn().mockResolvedValue(channelResult);
  return {
    client: { channels: { fetch: fetchChannel } } as unknown as Client,
    fetchChannel,
  };
}
// Canal mock precisa de isTextBased() + isSendable() + send():
function makeChannel() {
  const send = vi.fn();
  return {
    channel: { isTextBased: () => true, isSendable: () => true, send },
    send,
  };
}
```

### Hono SSE: nao usar stream.sleep() para manter conexao aberta

`stream.sleep(Number.MAX_SAFE_INTEGER)` causa `TimeoutOverflowWarning` porque o Hono
usa `setTimeout` internamente, que aceita no maximo int32 (~24.8 dias). O valor estourado
vira `1` e a conexao fecha e reabre a cada 1ms.

Padrao correto: bloquear o generator com uma Promise que so resolve no `onAbort`:

```ts
await new Promise<void>((resolve) => {
  stream.onAbort(() => {
    cleanup()
    resolve()
  })
})
```

### Hono router: rotas estaticas antes de rotas com parametro

`GET /standups/events` registrada DEPOIS de `GET /standups/:id` faz o Hono capturar
`events` como valor do parametro `:id`. Sempre registrar rotas estaticas primeiro:

```ts
app.get('/standups/events', handler)   // ANTES
app.get('/standups/:id', handler)      // DEPOIS
```

### discord.js: message.edit() em DM causa "channel not in cache"

`interaction.message.edit()` tenta resolver o canal via cache do Client. Canais de DM
nao sao cacheados automaticamente, causando `Could not find the channel in the cache`.

Usar apenas `interaction.editReply()` — opera via webhook da interacao, sem cache:

```ts
// ERRADO — crasha em DM
await interaction.editReply(payload)
await interaction.message?.edit(payload)  // ← remove isso

// CORRETO
await interaction.editReply(payload)
```

### Hono middleware deve retornar `next()` explicitamente

```ts
// ERRADO — causa "Not all code paths return a value"
app.use("/internal/*", async (c, next) => {
  if (!valid) return c.json({ error: "Unauthorized" }, 401);
  await next(); // nao retorna
});

// CORRETO
app.use("/internal/*", async (c, next) => {
  if (!valid) return c.json({ error: "Unauthorized" }, 401);
  return next(); // retorna a Promise
});
```

### Padroes do Akita (Discord como Admin Panel)

**Padrao 2 — Reacoes como Status:** Emojis no `editReply` como feedback visual apos botao.

- `approve` → `✅`, `reject` → `❌`, `regenerate` → `🔄`
- Implementado em `discord/handlers/button-handler.ts`

**Padrao 3 — Embeds Ricos:**

- DM de revisao: embed **azul** (`0x3498DB`) — `buildReviewEmbed`
- Publicacao no canal: embed **verde** (`0x2ECC71`) — `buildPublishedEmbed`
- Notificacao de falha: embed **vermelho** (`0xE74C3C`) — `buildJobFailedEmbed`
- Lembrete de standup: embed **ambar** (`0xF39C12`) — `buildReminderEmbed`
- Limites Discord: title=256, description=4096, field_value=1024 — sempre truncar
- Todos os builders em `discord/embeds.ts`

**Padrao 8 — Notificacoes de Status em Producao:**

- `POST /internal/notify/job-failed` no bot (body: `{ error, context? }`)
- `notifyJobFailed()` no worker quando o pipeline falha
- Bot publica embed vermelho no canal para visibilidade imediata
- Non-fatal em dois niveis: falha na notificacao e logada mas nao propaga

**Padrao 13 — Application Commands:**

- `SlashCommandBuilder` com `/standup` e 3 subcommands: `trigger`, `list`, `approve <id>`
- `trigger` chama `POST /standups/trigger` no API com `discordUserId = interaction.user.id`
- `registerApplicationCommands()` chamado no `ClientReady` — idempotente, safe on reconnect
- Guild commands (propagacao instantanea) quando `DISCORD_GUILD_ID` presente, global caso contrario
- Implementado em `discord/commands/register.ts`

## Padroes de Jobs Resilientes (Akita)

Implementados em `apps/worker/src/job/standup-job.ts` e `packages/db`:

**Padrao 1 — Retry com Backoff Exponencial:**

- `withRetry()` helper: 3 tentativas, delays 5s→10s→20s
- So retenta `LlmTemporaryError` e `McpConnectionError` (erros transitorios)
- Erros nao-retentaveis retornam imediatamente sem esperar

**Padrao 2 — Lock Distribuido via `job_runs`:**

- `JobRunRepository.acquireLock(jobName, date)`:
  - `running` existente → `LockAlreadyHeldError`
  - `success` existente → `JobAlreadyCompletedError`
  - `failed` existente → deleta e permite nova tentativa
- `releaseLock(id, 'success'|'failed', error?)` no `finally` do job
- Lock scoped por `(jobName, date)` — previne execucao concorrente e duplicate runs

**Padrao 3 — Idempotencia:**

- `JobAlreadyCompletedError` torna o job no-op se ja teve `success` no dia

**Padrao 5 — Recovery Cron:**

- `recoveryCron` em `scheduler.ts` — executado 30 min apos o cron principal salvo em `user_settings`
- Busca runs em `running` com mais de 1h → marca como `failed`
- Verifica se existe `success` para hoje → se nao, re-executa o job

**Padrao 6 — Notificacoes (ja existia):**

- `notifyStandupReady()` e `notifyJobFailed()` em `apps/worker/src/notifications/`

### Novos TaggedErrors (packages/domain)

```ts
LlmTemporaryError; // erro transitorio de LLM (safe to retry)
McpConnectionError; // falha de conexao MCP (safe to retry)
LockAlreadyHeldError; // job ja esta rodando para (jobName, date)
JobAlreadyCompletedError; // job ja completou com sucesso para (jobName, date)
```

### JobRunRepository (packages/db)

`acquireLock(jobName, date)`, `releaseLock(id, status, error?)`, `findStaleRuns(maxAgeMs)`, `findByJobAndDate(jobName, date)` — 13 testes unitarios.

Schema `job_runs` atualizado com campo `date TEXT NOT NULL` para scope do lock por dia.

## Estado Atual (o que esta completo)

### Pacotes completos (com testes)

- `packages/domain` — types, schemas Zod, state machine, TaggedErrors
- `packages/config` — `baseEnvSchema` + loaders por app; `BotEnv` inclui `WORKER_INTERNAL_URL`
- `packages/logger` — Winston estruturado
- `packages/git-collector` — 31 testes (bun test)
- `packages/db` — StandupRepository + JobRunRepository + UserRepository, migracao `dm_message_id`
- `packages/standup-generator` — generateStandup + generateAdjustedStandup, retry interno + fallback MCP

### Apps completos

- `apps/api` — EventBus + SSE handler + internal router + approve-service + status-changed notify
  - Rotas: `GET /standups/events` (SSE), `GET/PATCH /standups/*`, `POST /standups/trigger`, `POST /standups/:id/approve`
  - **ATENCAO**: `/standups/events` deve ficar registrado ANTES de `/standups/:id` no router — senao Hono captura `events` como param `:id`
  - Rota interna: `POST /internal/events/standup-generated` (worker → SSE push)

- `apps/worker` — pipeline completo com DM de inicio, lock, retry, notify SSE
  - `notifyUserDm` disparado logo apos `acquireLock` com sucesso (feedback imediato ao usuario)
  - `notifyStandupGenerated` apos `notifyStandupReady` (step 5) para push SSE ao web client

- `apps/discord-bot` — DMs, botoes, modais, slash commands, sync apos aprovacao web
  - `standup-notification-service`: salva `dmMessageId` apos enviar DM de revisao
  - `standup-sync-service`: edita DM + publica no canal quando aprovacao vem via web
  - `update-review-message`: usa `editReply` apenas — `message.edit()` causa erro em DM (canal nao cacheado)
  - Rota nova: `POST /internal/notify/standup-status-changed`

- `apps/web` — Angular 21 SPA com SSE, trigger fire-and-forget, tabela com pulse
  - `StandupEventsService`: EventSource fora do NgZone, re-emite como `standupGenerated$`
  - `StandupService`: subscreve SSE no constructor → `standups.reload()` + `selectedStandup.reload()`
  - `trigger()`, `regenerate()`, `adjust()`: fire-and-forget (sem loading spinner)
  - Tabela: pulse `animate-pulse` no standup `pending_review` mais recente
  - Cores: verde=approved, amarelo=pending, vermelho=rejected

### CI

- `bun run ci` — 38/38 tasks verde
