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
worker ──POST /internal/notify/standup-ready──► discord-bot (porta BOT_INTERNAL_PORT)
         header: x-internal-secret                   │
                                                     ├─ busca standup no DB
                                                     └─ envia DM ao usuario (non-fatal)

api ──POST /internal/trigger/standup──────────────► worker (porta WORKER_INTERNAL_PORT)
      header: x-internal-secret                       │
                                                      └─ dispara runStandupJob em background
```

- Worker nao sabe que Discord existe — apenas faz POST HTTP generico
- API nao executa job inline — apenas encaminha trigger manual para o worker
- `POST /standups/trigger` no API valida autenticacao via session ou internal secret
- discord-bot sobe **dois servidores** na mesma instancia:
  - Hono na `BOT_INTERNAL_PORT` (3334) para rotas internas
  - Gateway Discord (discord.js) para interacoes com botoes
- worker sobe scheduler + Hono interno na `WORKER_INTERNAL_PORT` (3335)
- Autenticacao interna: header `x-internal-secret` com `INTERNAL_SECRET`
- Falha no DM e **non-fatal**: standup ja esta salvo no DB, usuario pode aprovar via API
- Cada app na sua porta: `api=3333`, `discord-bot=3334`, `worker=3335`

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
    api/                    # Hono API (health, busca, filtros, triggers manuais)
      src/
        index.ts            # Entrypoint + rotas

    discord-bot/            # Bot Discord (DM, botoes de revisao, comandos slash)
      src/
        discord/
          commands/         # Slash commands (/standup subcommands)
            register.ts         # buildStandupCommand + registerApplicationCommands
            register.test.ts
            trigger.ts          # /standup trigger handler
            list.ts             # /standup list handler
            approve.ts          # /standup approve handler
            handlers.test.ts    # testes dos 3 subcommands
          handlers/         # Processamento de interacoes Discord
            button-handler.ts       # parse customId → defer → handleStandupInteraction → reply
            button-handler.test.ts
            slash-command-handler.ts # roteamento /standup subcommands
            interaction-handler.ts  # logica approve/reject/regenerate + transicoes de estado
            interaction-handler.test.ts
          notifications/    # Envio de mensagens Discord
            send-review-dm.ts           # DM com embed azul + botoes ao usuario
            send-review-dm.test.ts
            send-channel-notification.ts # helper: fetch canal → guard → send embed
            publish-standup.ts          # publica embed verde no canal
            publish-standup.test.ts
          embeds.ts         # builders de embed (review, published, job-failed)
        http/
          middleware/
            auth.ts               # internalAuthMiddleware(secret) para /internal/*
          notify/
            standup-ready.ts      # handler POST /internal/notify/standup-ready
            standup-ready.test.ts
            job-failed.ts         # handler POST /internal/notify/job-failed
            job-failed.test.ts
          router.ts               # monta Hono + auth middleware + handlers notify
          router.test.ts
        index.ts            # Entrypoint: env + Client + HTTP server + event listeners

    worker/                 # Scheduler e orquestracao de jobs
      src/
        job/                # Pipeline de geracao de standup
          standup-job.ts        # collect → generate → persist → notify
          standup-job.test.ts
        http/
          middleware/
            auth.ts             # internalAuthMiddleware(secret) para /internal/*
          trigger/
            standup.ts          # handler POST /internal/trigger/standup
          router.ts             # monta Hono + auth middleware + handler trigger
          router.test.ts
        notifications/      # Notificacoes HTTP para o discord-bot
          notify-standup-ready.ts     # POST /internal/notify/standup-ready
          notify-standup-ready.test.ts
          notify-job-failed.ts        # POST /internal/notify/job-failed
          notify-job-failed.test.ts
        scheduler.ts        # startScheduler() — setup de cron jobs
        index.ts            # Entrypoint: loadWorkerEnv → startScheduler + HTTP interno
        vitest.setup.ts     # Shim Bun.randomUUIDv7 para Vitest
      vitest.config.ts      # Config Vitest local (aponta setupFiles)

  packages/
    config/           # Env vars e configuracao tipada (loadApiEnv/loadBotEnv/loadWorkerEnv)
    domain/           # Types, schemas, errors, state machine
    db/               # Drizzle schema, conexao, StandupRepository
    git-collector/    # Coleta de commits dos repositorios
    standup-generator/
      src/
        azure/
          azure-mcp-client.ts   # Client MCP: connect/disconnect/getMe/getWorkItem/listPRs
          enrich.ts             # enrichGitActivity — busca work items + PRs por repo
        prompt/
          meeting-type.ts       # determineMeetingType — segunda/quarta/sexta tem reunioes
          work-item-status.ts   # determineWorkItemStatus — done vs in_progress
          prompt.ts             # buildSystemPrompt + buildUserMessage
        generator.ts            # generateStandup — orquestra azure → enrich → LLM
        generator.test.ts
        types.ts                # tipos internos (usado por azure/ e prompt/)
        index.ts                # barrel de exports publicos

  data/               # SQLite files (gitignored)
  drizzle/            # Migration files gerados
  turbo.json          # Pipeline monorepos
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
DISCORD_BOT_TOKEN=
DISCORD_CHANNEL_ID=       # Canal onde publica standups
DISCORD_GUILD_ID=         # Opcional: guild commands (dev) vs global (prod)

# Worker (loadWorkerEnv)
# Nota: timezone, crons, gitAuthor, gitSincePeriod e repos subpath
# agora vem da tabela user_settings (configuravel via /standup settings)
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

- `packages/domain` — types, schemas Zod, state machine, TaggedErrors (incl. 4 novos erros de job)
- `packages/config` — `baseEnvSchema` + loaders por app (`loadApiEnv()`, `loadBotEnv()`, `loadWorkerEnv()`) e tipos dedicados (`ApiEnv`, `BotEnv`, `WorkerEnv`)
- `packages/logger` — Winston estruturado
- `packages/git-collector` — 29 testes (bun test)
- `packages/db` — StandupRepository + JobRunRepository, 31 testes (bun test)
- `packages/standup-generator` — generateStandup + MCP enrichment, 18 testes (vitest)

### Apps completos

- `apps/api` — 23 testes (vitest)
  - `standup/router.ts`: `createStandupRouter(opts)` — 4 rotas
    - `GET /standups` — lista com filtros opcionais `?status=&date=`
    - `GET /standups/:id` — detalhe por ID
    - `PATCH /standups/:id/status` — atualiza status (state machine valida transições)
    - `POST /standups/trigger` — trigger manual com auth via session ou internal secret
  - handlers por responsabilidade: `standup/list.ts`, `standup/get-by-id.ts`, `standup/update-status.ts`
  - handler de trigger: `standup/trigger.ts`
  - service isolado: `services/standup-service.ts`
  - service de trigger interno: `services/standup-trigger-service.ts`
  - middleware HTTP extraido: `http/middleware.ts`
  - `index.ts`: entrypoint — middleware logging, health, monta standup router

- `apps/worker` — 26 testes (vitest)
  - `job/standup-job.ts`: pipeline com lock + retry + idempotencia + notify
  - `http/router.ts`: auth middleware + POST /internal/trigger/standup
  - handler por responsabilidade: `http/trigger/standup.ts`
  - middleware extraido: `http/middleware/auth.ts`
  - `notifications/notify-standup-ready.ts`: POST /internal/notify/standup-ready
  - `notifications/notify-job-failed.ts`: POST /internal/notify/job-failed
  - `scheduler.ts`: startScheduler() + recoveryCron (Padrao 5)
  - `index.ts`: entrypoint puro (scheduler + HTTP interno)

- `apps/discord-bot` — 55 testes (vitest)
  - `http/router.ts`: auth middleware + POST /internal/notify/standup-ready + /job-failed
  - handlers por responsabilidade: `http/notify/standup-ready.ts` e `http/notify/job-failed.ts`
  - middleware extraido: `http/middleware/auth.ts`
  - services isolados: `services/standup-notification-service.ts`, `services/job-notification-service.ts` e `services/trigger-standup-service.ts`
  - `discord/notifications/send-review-dm.ts`: DM com embed azul + botoes
  - `discord/notifications/send-channel-notification.ts`: helper generico de canal
  - `discord/notifications/publish-standup.ts`: publica embed verde no canal
  - `discord/handlers/interaction-handler.ts`: logica approve/reject/regenerate
  - `discord/handlers/button-handler.ts`: handler de botoes com emojis (Padrao 2)
  - `/standup trigger`: integrado ao API (`POST /standups/trigger`) com feedback ephemeral
  - `discord/handlers/slash-command-handler.ts`: roteador de slash commands
  - `discord/commands/`: register + trigger + list + approve (Padrao 13)
  - `discord/embeds.ts`: builders de embed (Padrao 3)
  - `index.ts`: entrypoint puro — env + Client + HTTP + event listeners

### CI

- `bun run ci` — 33/33 tasks verde (lint + typecheck + test em todos os pacotes/apps)

## Proximos Passos
