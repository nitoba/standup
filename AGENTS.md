# Projeto: Standup Bot

## Visao Geral

Servico que automatiza a geracao de standups diarios baseado no historico de commits
dos repositorios da empresa. Coleta dados git, enriquece com Azure DevOps via MCP/REST,
gera relatorios via IA (AI SDK da Vercel + pi-ai), permite revisao/aprovacao via bot do Discord,
e publica standups aprovados num canal do Discord.

O usuario e um desenvolvedor web full stack que precisa gerar reports de standup ao final do dia.
Este projeto transforma isso num servico persistente com agendamento, lembretes e publicacao automatizada.

### Fluxo Principal

1. **Coleta**: Busca commits do dia nos repos da empresa via git (fetch + log)
2. **Enriquecimento**: Consulta Azure DevOps via MCP ou REST para detalhes de work items e PRs
3. **Geracao**: LLM (Google, Groq, OpenRouter ou pi-ai) gera o standup formatado em portugues
4. **Revisao**: Bot do Discord envia DM com preview + botoes (Aprovar/Rejeitar/Ajustar/Regenerar)
5. **Publicacao**: Standup aprovado e publicado no canal do Discord
6. **Persistencia**: Todos os standups ficam salvos em banco SQLite/libSQL (local ou Turso)

### Modos de Operacao

- **Cron**: Horario fixo configuravel por usuario (ex: 17:30 em dias uteis)
- **Manual**: Trigger via comando no Discord ou HTTP API
- **Lembrete**: Antes do cron, DM com opcao de adiar/cancelar

## Stack

- Runtime: Bun 1.x
- Linguagem: TypeScript (strict mode)
- Testes: Vitest
- Linter/Formatter: Biome
- ORM: Drizzle ORM + SQLite/libSQL (Turso-ready)
- HTTP Server: NestJS 11 com `@kiyasov/platform-hono` + `@hono/node-server`
- Validacao: `class-validator`/`class-transformer` para DTOs HTTP; Zod para env e schemas internos
- Error Handling: better-result (Result + TaggedError)
- LLM: AI SDK da Vercel (`@ai-sdk/google`, `@ai-sdk/groq`, `@openrouter/ai-sdk-provider`) + pi-ai (`@mariozechner/pi-agent-core`)
- Azure DevOps: MCP client (`@modelcontextprotocol/sdk`) + REST client para work items e PRs
- Discord: discord.js (gateway, slash commands, modais, DMs, botoes)
- Scheduler: `@nestjs/schedule` + `croner` para avaliacao de cron por usuario
- Logs: Winston via `nest-winston`
- Observabilidade: OpenTelemetry via `nestjs-otel` + NodeSDK
- API Docs: `@scalar/nestjs-api-reference` + `@nestjs/swagger`
- Throttle: `@nestjs/throttler`
- Auth: Better Auth (`@thallesp/nestjs-better-auth`) + OAuth Discord
- Deploy: Docker + Kamal + Colima ARM64 via Tailscale

## Design Patterns

- Monorepo com `apps/api` (NestJS monolito) e `apps/web` (Angular SPA)
- Modulos independentes nao devem se chamar diretamente via contexto de integracao; use eventos internos (`EventBusService`)
- Controllers delegam para services; services encapsulam logica por contexto funcional
- DTOs com `class-validator` para body; parse pipes built-in do Nest para query/path params
- Erros explicitos com better-result (Result + TaggedError, sem try/catch)
- Jobs idempotentes com lock por `(jobName, date)`
- Logs estruturados via `AppLoggerFactory`; evitar `console.log`
- Barrel exports apenas em modulos publicos
- Nunca use `any` — prefira `unknown` + type guard
- Prefira composicao sobre heranca
- Estado de standups via state machine simples: `draft -> pending_review -> approved -> published` (ou `rejected -> draft`)
- Estrategias para pipeline: `generate`, `regenerate`, `adjust` (Strategy pattern em `worker/standup/strategies/`)

## Configuracao de Ambiente

- Schema unico em `apps/api/src/platform/env/env.schema.ts`
- Acesso tipado via `EnvService` (injetavel no Nest)
- Nao criar loaders separados por processo — tudo centralizado no `EnvModule`
- Para nova env: adicionar no schema e expor via `EnvService`

## Arquitetura de Comunicacao

```
                    ┌──────────────────────────────────────────────────┐
                    │                    web (Angular)                 │
                    │  REST + EventSource /standups/events             │
                    └───────────────────┬──────────────────────────────┘
                                        │
                                        ▼
┌────────────────────────────────────────────────────────────────────────────┐
│                            apps/api (porta 3333)                          │
│                                                                            │
│  Auth + Better Auth (OAuth Discord)                                        │
│  HTTP + SSE                                                                │
│  Standups CRUD / trigger / approve / status / send-to-discord / events     │
│  Preferences (settings/me)                                                 │
│  Scheduler + reminders + digests                                           │
│  Git collector + clone + Azure DevOps (MCP + REST) + geracao via LLM       │
│  Discord gateway + slash commands + DMs + publicacao                       │
│  Email + SMTP (weekly digest)                                              │
│  Event bus interno (EventBusService) para desacoplar contextos             │
└────────────────────────────────────────────────────────────────────────────┘
```

### Regras de comunicacao

- O frontend conversa com a API por REST + SSE (`/standups/events`)
- Nao ha mais HTTP interno nem `x-internal-secret` — tudo e um monolito
- Contextos independentes se coordenam por eventos internos do Nest (`EventBusService`)
- Triggers HTTP e Discord convergem para os mesmos services/eventos de aplicacao
- Falha em DM/email e non-fatal quando o dado principal do standup ja foi persistido
- O scheduler roda dentro da API e pode ser desabilitado por `SCHEDULER_ENABLED`
- O gateway do Discord roda dentro da API e pode ser desabilitado por `DISCORD_GATEWAY_ENABLED`
- Porta publica do backend: `3333`

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
- Arquivos: kebab-case (ex: standup-generator.service.ts, discord-messages.service.ts)
- Testes: co-locados com `.spec.ts` (ex: approve-standup.service.spec.ts)

## Principios de Organizacao de Arquivos

### Uma responsabilidade por arquivo

Cada arquivo exporta uma unica classe/funcao principal. Nunca agrupar responsabilidades nao relacionadas.

### Agrupamento por contexto funcional, nao por tipo tecnico

Pastas agrupam pelo **que fazem juntos**. Contextos de dominio em `contexts/`, adapters externos em `interfaces/`, infra em `platform/`.

### Controllers sao entrypoints HTTP puros

Controllers delegam para services; nenhuma logica de negocio inline no controller.

### Arquivo utilitario fica proximo de quem o usa

`embeds.ts` fica na raiz de `interfaces/discord/`, acessivel tanto por `notifications/` quanto por `handlers/`.

## Estrutura de Pastas

```
standup/
  apps/
    api/                    # Monolito NestJS
      src/
        app.module.ts       # Modulo raiz
        main.ts             # Bootstrap NestJS + Hono
        contexts/           # Logica de dominio (bounded contexts)
          identity/         # Auth + Better Auth + OAuth Discord
          preferences/
            me/             # GET/PUT /settings/me (MeSettingsController)
          standups/         # Contexto principal de standups
            approval/       # POST /standups/:id/approve
            events/         # SSE /standups/events (StandupSseBusService)
            publication/    # PublishStandupService (publica no Discord)
            query/          # GET /standups, GET /standups/:id
            send-to-discord/# POST /standups/:id/send-to-discord
            shared/         # Utilitarios compartilhados entre sub-contextos
            status/         # PATCH /standups/:id/status
            trigger/        # POST /standups/trigger
            worker/         # Pipeline de geracao e infraestrutura do worker
              azure-devops/ # MCP + REST client para Azure DevOps
              digests/      # Weekly digest (job + dispatch + controller)
              git-collector/# Coleta de commits + repo clone
              reminders/    # Lembretes pre-standup (controller + actions)
              repos/        # Listagem de repos disponiveis
              scheduler/    # WorkerSchedulerService + is-cron-due-now
              standup/      # Pipeline principal (run-standup-job, dispatch, strategies)
                strategies/ # execute-generate, execute-regenerate, execute-adjust
              standup-agent/# Agente LLM com pi-ai (session manager, tools, prompts)
              standup-generator/ # StandupGeneratorService + prompts + LlmProviderRegistry
        interfaces/         # Adapters de interfaces externas
          discord/          # Gateway Discord completo
            commands/       # CommandRegistrationService (slash commands)
            handlers/       # StandupInteractionService, ButtonInteractionService,
                            #   ModalInteractionService, ReminderInteractionService,
                            #   TriggerConfirmationService, CopyInteractionService,
                            #   SlashCommandHandlerService, CommandCooldownService
            listeners/      # DiscordGatewayService, DiscordStreamingListener
            notifications/  # DiscordMessagesService
            services/       # StandupNotificationService, StandupStatusSyncService,
                            #   DiscordTriggerService, DiscordAuthService,
                            #   DiscordAvailableReposService, DiscordServiceHealthService
            discord-client.service.ts
            discord.module.ts
            embeds.ts       # Builders de embed (review, published, job-failed, reminder)
          email/            # SMTP + templates
            services/       # EmailClientService, WeeklyDigestEmailService
            templates/      # weekly-digest.ts (HTML template)
            utils/
        platform/           # Infraestrutura tecnica
          database/
            migrations/     # SQL gerados por drizzle-kit
            repositories/   # job-run, standup-read, standup-write, user, user-settings,
                            #   weekly-digest
            schema.ts       # Schema Drizzle (fonte de verdade do banco)
            database.module.ts
            database.service.ts
            migrate.ts      # Runner de migrations (entrypoint do container)
          env/              # EnvModule + EnvService + env.schema.ts
          events/           # EventBusService + contratos de eventos (standup-events.ts)
          http/
            controllers/    # HealthController, ApiReferenceController
            filters/        # GlobalExceptionFilter
            throttler/      # ThrottlerConfig
          logger/           # AppLoggerFactory + create-winston-options
          observability/    # AppTracingService + NodeSDK
          time/             # Servicos de data/hora local
        shared/             # Cross-cutting concerns
          auth/             # Helpers de sessao
          domain/           # Types, errors, state machine, schemas Zod
          openapi/          # Decorators Swagger
          repos/            # parse-selected-repos
          utils/
          validators/
        test/               # Helpers de teste (e2e, fixtures)

    web/                    # Angular SPA
      src/app/
        api/
          endpoints/        # standups, settings, digests, reminders, repos
          model/            # DTOs gerados (OpenAPI)
        core/               # auth, layout
        features/
          dashboard/        # Tabela de standups, filtros, metricas
          login/
          settings/         # Configuracoes do usuario
          standup-detail/   # Detalhe com acoes (approve/reject/adjust/regenerate)
          weekly-digest/    # Visualizacao do digest semanal
        shared/             # components, core, models, pipes, services, utils

  data/               # SQLite files locais para dev (gitignored)
  config/             # Kamal deploy configs (deploy.api.yml, deploy.web.yml)
  scripts/            # Scripts utilitarios
  turbo.json          # Pipeline: lint → typecheck → test → build
```

## Regras de Banco de Dados (Drizzle)

- **NUNCA criar arquivos de migration manualmente** — sempre usar `bun run db:generate` no `apps/api`
- `db:generate` atualiza o `_journal.json` e cria o snapshot corretamente; criar arquivos `.sql` manualmente quebra o journal
- `db:migrate` aplica as migrations pendentes usando `apps/api/src/platform/database/migrate.ts`
- Em container, as migrations rodam no entrypoint da API antes do binario compilado subir
- Desenvolvimento local:
  - `DATABASE_URL=file:./data/standup.db` para SQLite local
  - `turso dev --db-file ./data/standup.db` + `DATABASE_URL=http://127.0.0.1:8080` para libSQL local
  - `DATABASE_URL=libsql://...` + `DATABASE_AUTH_TOKEN=...` para Turso remoto

Fluxo correto para adicionar ou alterar schema:
1. Editar `apps/api/src/platform/database/schema.ts`
2. `bun run db:generate` (dentro de `apps/api`) — gera o `.sql` e atualiza o journal
3. `bun run db:migrate` (dentro de `apps/api`) — aplica no banco

## Regras de Monorepo (Turborepo)

- Scripts de task ficam em cada app (`build`, `lint`, `typecheck`, `test`)
- Root apenas delega: `turbo run <task>`
- Evitar logica de build no root `package.json`
- Definir outputs de build para cache (`dist/**`)
- Cache stale apos mudancas de biome/lint: usar `--force` para invalidar

## Env Vars Necessarias

```
# Core
NODE_ENV=development
PORT=3333
CORS_ORIGIN=http://localhost:4200
APP_URL=http://localhost:4200
DATABASE_URL=file:./data/standup.db
DATABASE_AUTH_TOKEN=
REPOS_ROOT_PATH=/home/nitoba/Documents/repos/ibs/repos

# Auth
DISCORD_CLIENT_ID=
DISCORD_CLIENT_SECRET=
BETTER_AUTH_SECRET=
BETTER_AUTH_URL=http://localhost:3333

# Discord
DISCORD_BOT_TOKEN=
DISCORD_CHANNEL_ID=
DISCORD_GUILD_ID=
DISCORD_GATEWAY_ENABLED=true
DISCORD_SEND_TIMEOUT_MS=60000

# Discord Automation (opcional — webhook para notificacoes de CI/deploy)
DISCORD_AUTOMATION_URL=
DISCORD_AUTOMATION_CHANNEL_URL=
DISCORD_AUTOMATION_WEBHOOK_SECRET=

# Worker internals
SCHEDULER_ENABLED=true
MEETING_PLANNING_WEB_CYCLE_START_DATE=2026-04-22
MEETING_SPOTLIGHT_ROTATION_START_DATE=2026-04-29
MEETING_SPOTLIGHT_ROTATION_START_TEAM=Web

# LLM Providers (pelo menos um obrigatorio)
GOOGLE_API_KEY=
GROQ_API_KEY=
OPENROUTER_API_KEY=
LLM_PROVIDERS_CONFIG=    # JSON de configuracao de provedores (opcional)

# Azure DevOps
AZURE_DEVOPS_ORG=
AZURE_DEVOPS_PAT=
AZURE_DEVOPS_DEFAULT_PROJECT=AGROTRACE
AZURE_DEVOPS_PROJECTS=AGROTRACE,CHECKMILK,JASPER-RELATORIOS

# SMTP
SMTP_HOST=
SMTP_PORT=587
SMTP_SECURE=false
SMTP_FROM=
SMTP_USER=
SMTP_PASS=

# OpenTelemetry (opcional)
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318

# Docker Compose (infra)
HOST_REPOS_ROOT_PATH=/home/nitoba/Documents/repos/ibs/repos
HOST_SSH_PATH=~/.ssh
```

## Padroes de Jobs Resilientes

Implementados em `contexts/standups/worker/standup/` e `platform/database/repositories/job-run.repository.ts`:

**Padrao 1 — Retry com Backoff Exponencial:**

- `withRetry()` helper: 3 tentativas, delays 5s→10s→20s
- So retenta `LlmTemporaryError` e `McpConnectionError` (erros transitorios)

**Padrao 2 — Lock Distribuido via `job_runs`:**

- `JobRunRepository.acquireLock(jobName, date)`:
  - `running` existente → `LockAlreadyHeldError`
  - `success` existente → `JobAlreadyCompletedError`
  - `failed` existente → deleta e permite nova tentativa
- `releaseLock(id, 'success'|'failed', error?)` no `finally` do job
- Lock scoped por `(jobName, date)`

**Padrao 3 — Idempotencia:**

- `JobAlreadyCompletedError` torna o job no-op se ja teve `success` no dia

**Padrao 5 — Recovery Cron:**

- `WorkerSchedulerService` — executado 30 min apos o cron principal salvo em `user_settings`
- Busca runs em `running` com mais de 1h → marca como `failed`
- Verifica se existe `success` para hoje → se nao, re-executa

**Padrao 6 — Notificacoes:**

- `WorkerEventPublisherService` publica eventos de dominio via `EventBusService`
- `interfaces/discord` e `contexts/standups/events` reagem sem acoplamento direto

### TaggedErrors

```ts
LlmTemporaryError;        // erro transitorio de LLM (safe to retry)
McpConnectionError;       // falha de conexao MCP (safe to retry)
LockAlreadyHeldError;     // job ja esta rodando para (jobName, date)
JobAlreadyCompletedError; // job ja completou com sucesso para (jobName, date)
```

## Padroes do Discord (Akita)

**Padrao 2 — Reacoes como Status:**

- `approve` → `✅`, `reject` → `❌`, `regenerate` → `🔄`, `adjust` → `✏️`
- Implementado em `interfaces/discord/handlers/standup-interaction.service.ts`

**Padrao 3 — Embeds Ricos:**

- DM de revisao: embed **azul** (`0x3498DB`) — `buildReviewEmbed`
- Publicacao no canal: embed **verde** (`0x2ECC71`) — `buildPublishedEmbed`
- Notificacao de falha: embed **vermelho** (`0xE74C3C`) — `buildJobFailedEmbed`
- Lembrete: embed **ambar** (`0xF39C12`) — `buildReminderEmbed`
- Limites Discord: title=256, description=4096, field_value=1024 — sempre truncar
- Todos os builders em `interfaces/discord/embeds.ts`

**Padrao 8 — Notificacoes de Status:**

- `WorkerEventPublisherService` publica evento interno
- `DiscordMessagesService` e `StandupNotificationService` cuidam das mensagens finais
- Falha na notificacao e logada, mas nao deve derrubar o fluxo principal

**Padrao 13 — Application Commands:**

- `SlashCommandBuilder` com `/standup` e subcommands: `trigger`, `list`, `approve <id>`, `settings`
- `CommandRegistrationService.registerApplicationCommands()` chamado no `ClientReady` — idempotente
- Guild commands quando `DISCORD_GUILD_ID` presente, global caso contrario

### Nest SSE: bus separado do EventEmitter interno

- `EventBusService` para eventos internos entre contextos
- `StandupSseBusService` para conexoes abertas por `userId`
- `@Sse()` retornando `Observable<MessageEvent>`

### discord.js: message.edit() em DM causa "channel not in cache"

Usar apenas `interaction.editReply()` — opera via webhook da interacao, sem cache:

```ts
// CORRETO
await interaction.editReply(payload)
// ERRADO em DM — crasha
await interaction.message?.edit(payload)
```

### interaction.deferUpdate() para evitar timeout de 3s

```ts
await interaction.deferUpdate();
// ... logica async ...
await interaction.editReply({ content: result.message, components: [] });
```

### discord.js isSendable() para channels com send()

```ts
if (!channel.isTextBased() || !channel.isSendable()) {
  throw new ExternalServiceError({ service: "discord", message: "Not a sendable channel" });
}
await channel.send({ content });
```

### discord.js: race condition no ClientReady

```ts
await new Promise<void>((resolve, reject) => {
  client.once(Events.ClientReady, () => resolve());
  client.once(Events.Error, reject);
  client.login(token).catch(reject);
});
```

## Hurdles (Barreiras Conhecidas)

- discord.js com Bun: funciona nativamente desde Bun 1.1+
- SQLite WAL mode: necessario para leitura concorrente
- AI SDK: usar provider configuravel; `LlmProviderRegistry` centraliza a selecao de provider
- croner: usado para avaliar cron por usuario dentro do `WorkerSchedulerService`

### Vitest roda em Node

Vitest nao roda no runtime Bun. Evite depender de globais exclusivas do Bun no codigo testado. Prefira `node:crypto`, APIs Web padrao e mocks explicitos.

### Biome --unsafe pode trocar node:crypto por Bun globals

`biome check --write --unsafe` pode substituir `crypto.randomUUID()` por `Bun.randomUUIDv7()`.
Isso quebra testes Vitest. Sempre revisar o diff apos `--unsafe`.

### vi.mock com classes instanciadas com `new`

`vi.fn().mockImplementation(() => ...)` cria arrow function — nao funciona com `new`.
Usar funcao construtora real:

```ts
vi.mock("../shared/database/repositories/standup.repository", () => {
  function StandupRepository() {
    return { create: mocks.repoCreate };
  }
  return { StandupRepository };
});
```

### vi.hoisted() para evitar TDZ em vi.mock factories

```ts
const mocks = vi.hoisted(() => ({
  collect: vi.fn(),
  notifyStandupReady: vi.fn(),
}));
vi.mock("../notifications/notify-standup-ready.js", () => ({
  notifyStandupReady: mocks.notifyStandupReady,
}));
```

### Vitest + import transitive de repositorios

Ao testar controllers/modules, mockar **todos** os services e repositories importados transitivamente,
mesmo os nao usados diretamente no caso testado, para evitar que o driver real de banco seja carregado.

### Docker ARM + libsql nativo

O runtime de producao e ARM64 e a API e compilada com `bun build --compile`.
`@libsql/client` ainda carrega addon nativo dinamicamente, entao o Dockerfile precisa:
- copiar o binario do Bun para o runtime
- copiar o pacote nativo `@libsql/linux-arm64-gnu` para `/app/node_modules/@libsql`
- rodar `migrate.ts` no entrypoint antes do binario compilado

## Estado Atual

- `apps/api` e a fonte de verdade do backend: scheduler, Discord, email, migrations, observabilidade
- `apps/web` e o frontend Angular consumindo REST + SSE
- Deploy sobe 2 imagens: `standup-api` e `standup-web`
- As migrations rodam no startup da API, nao em container separado
- CI verde: lint + typecheck + test em todos os contextos/apps
