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
6. **Persistencia**: Todos os standups ficam salvos em banco SQLite/libSQL (local ou Turso) para busca/filtro/resumos

### Modos de Operacao

- **Cron**: Horario fixo configuravel (ex: 17:30 em dias uteis)
- **Manual**: Trigger via comando no Discord ou HTTP API
- **Lembrete**: 5-10 min antes do cron, DM com opcao de adiar/cancelar

## Stack

- Runtime: Bun 1.x
- Linguagem: TypeScript (strict mode)
- Testes: Vitest
- Linter/Formatter: Biome
- ORM: Drizzle ORM + SQLite/libSQL (Turso-ready)
- HTTP Server: NestJS 11 com `@kiyasov/platform-hono`
- Validacao: `class-validator`/`class-transformer` para DTOs HTTP; Zod para env e alguns schemas internos
- Error Handling: better-result (Result + TaggedError)
- LLM: AI SDK da Vercel (provider configuravel)
- Azure DevOps: MCP client para work items e PRs
- Discord: discord.js (gateway, slash commands, modais, DMs)
- Scheduler: `@nestjs/schedule` + `croner` para avaliacao de cron por usuario
- Logs: Winston via `nest-winston`
- Observabilidade: OpenTelemetry via `nestjs-otel` + NodeSDK
- Deploy: Docker + Kamal + Colima ARM64 via Tailscale

## Design Patterns

- Workspace ativo com `apps/api` e `apps/web`
- O backend roda como um monolito modular em NestJS
- Modulos independentes nao devem se chamar diretamente quando o contrato for de integracao; use eventos internos
- Services encapsulam logica de aplicacao por contexto funcional
- DTOs com `class-validator` para body; parse pipes built-in do Nest para query/path params
- Erros explicitos com better-result (Result + TaggedError, sem try/catch)
- Jobs idempotentes
- Logs estruturados; evitar `console.log`
- Barrel exports apenas em modulos publicos
- Nunca use `any` — prefira `unknown` + type guard
- Prefira composicao sobre heranca
- Estado de standups via state machine simples: draft -> pending_review -> approved -> published (ou rejected -> draft)

## Configuracao de Ambiente

- O backend usa um unico schema em `apps/api/src/shared/env/env.schema.ts`
- O acesso tipado a env fica em `EnvService`
- Nao reintroduzir loaders separados por processo antigo (`loadApiEnv`, `loadBotEnv`, `loadWorkerEnv`)
- Se uma nova env for necessaria, adicione no schema e exponha via `EnvService`

## Arquitetura de Comunicacao

```
                    ┌──────────────────────────────────────────────────┐
                    │                    web (Angular)                 │
                    │  REST + EventSource /standups/events            │
                    └───────────────────┬──────────────────────────────┘
                                        │
                                        ▼
┌────────────────────────────────────────────────────────────────────────────┐
│                            apps/api (porta 3333)                          │
│                                                                            │
│  Auth + Better Auth                                                        │
│  HTTP + SSE                                                                │
│  Standups CRUD/trigger/approve/status/settings                             │
│  Scheduler + reminders + digests                                           │
│  Git collector + Azure DevOps enrichment + geracao via LLM                 │
│  Discord gateway + slash commands + DMs + publicacao                       │
│  Email + SMTP                                                              │
│  Event bus interno para desacoplar modulos                                 │
└────────────────────────────────────────────────────────────────────────────┘
```

### Regras de comunicacao

- O frontend conversa com a API por REST + SSE (`/standups/events`)
- O monolito nao usa mais HTTP interno nem `x-internal-secret`
- Modulos independentes se coordenam por eventos internos do Nest
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
    api/                    # Monolito NestJS ativo
      src/
        app.module.ts
        main.ts
        modules/
          auth/             # Better Auth, OAuth Discord, session
          discord/          # Gateway, slash commands, interacoes, DMs
          email/            # SMTP client, templates, composicao de email
          events/           # Event bus interno e contratos de eventos
          http/             # Health endpoints
          settings/         # GET/PUT /settings/me
          standups/         # query, trigger, approval, status, SSE
          worker/           # scheduler, repos, reminders, digests, pipeline
        shared/
          auth/            # helpers de sessao
          database/        # schema, migrations, repositories, runner
          domain/          # types, errors, state machine, schemas
          env/             # env schema + EnvService
          logger/          # nest-winston + factory tipada
          observability/   # NodeSDK + nestjs-otel
          repos/           # parse-selected-repos
          time/            # local date/time services

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

  data/               # SQLite files locais para dev (gitignored)
  turbo.json          # Pipeline: lint → typecheck → test → build
```

## Ordem de Implementacao (Obrigatoria)

1. Fase 0: contrato de arquitetura + responsabilidades por app
2. Fase 1: fundacoes (turbo, tsconfig strict, biome, vitest, CI)
3. Fase 1: contratos de dominio e testes dos paths Ok/Err
4. Fase 2: features por fatias pequenas (collector, generator, persistence, bot, scheduler)
5. So com `bun run ci` verde: lint + typecheck + test

## Regras de Banco de Dados (Drizzle)

- **NUNCA criar arquivos de migration manualmente** — sempre usar `bun run db:generate` no `apps/api`
- `db:generate` atualiza o `_journal.json` e cria o snapshot corretamente; criar arquivos `.sql` manualmente quebra o journal e pode causar migrations aplicadas parcialmente
- `db:migrate` aplica as migrations pendentes usando `apps/api/src/shared/database/migrate.ts` com `--env-file=../../.env.local`
- Em container, as migrations rodam no entrypoint da API antes do binario compilado subir
- Sempre rodar `db:migrate` apos `db:generate` para aplicar no banco configurado no ambiente (`file:...`, `http://127.0.0.1:8080`, `libsql://...`)
- Desenvolvimento local pode usar:
  - `DATABASE_URL=file:./data/standup.db` para SQLite local
  - `turso dev --db-file ./data/standup.db` + `DATABASE_URL=http://127.0.0.1:8080` para libSQL local via Turso CLI
  - `DATABASE_URL=libsql://...` + `DATABASE_AUTH_TOKEN=...` para Turso remoto

Fluxo correto para adicionar ou alterar schema:
1. Editar `apps/api/src/shared/database/schema.ts`
2. `bun run db:generate` (dentro de `apps/api`) — gera o `.sql` e atualiza o journal
3. `bun run db:migrate` (dentro de `apps/api`) — aplica no banco

## Regras de Monorepo (Turborepo)

- Scripts de task ficam em cada pacote/app (`build`, `lint`, `typecheck`, `test`)
- Root apenas delega: `turbo run <task>`
- Evitar logica de build no root `package.json`
- Definir outputs de build para cache (`dist/**`)
- Dependencias internas sempre via `workspace:*`
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

# Worker internals
SCHEDULER_ENABLED=true
AI_PROVIDER_API_KEY=
AZURE_DEVOPS_ORG=
AZURE_DEVOPS_PAT=
AZURE_DEVOPS_DEFAULT_PROJECT=AGROTRACE
AZURE_DEVOPS_PROJECTS=

# SMTP
SMTP_HOST=
SMTP_PORT=1025
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

## Hurdles (Barreiras Conhecidas)

- discord.js com Bun: funciona nativamente desde Bun 1.1+
- SQLite WAL mode: necessario para leitura concorrente entre HTTP, scheduler e jobs
- AI SDK: usar provider configuravel com `generateObject` para geracao de standups
- croner: usado para avaliar cron por usuario dentro do scheduler do Nest

### Vitest roda em Node

Vitest nao roda no runtime Bun. Evite depender de globais exclusivas do Bun no codigo
que precisa ser testado. Prefira `node:crypto`, APIs Web padrao e mocks explicitos.

### Biome --unsafe pode trocar node:crypto por Bun globals

`biome check --write --unsafe` pode substituir `crypto.randomUUID()` por `Bun.randomUUIDv7()`.
Isso quebra testes Vitest (que rodam em Node). Sempre revisar o diff apos `--unsafe`
e manter `node:crypto` quando o codigo tambem roda em testes.

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

### Vitest + import transitive de router (driver de banco)

Quando um teste importa um controller/module, ele carrega services e repositories
transitivamente. Se algum caminho tocar no driver real de banco, o teste deixa de
ser unitario e pode quebrar por boundary errado.

Padrao para testes de controller/module: mockar **todos** os services e repositories
importados transitivamente, mesmo os nao usados diretamente no caso testado.

Exemplo: ao testar `POST /standups/trigger`, mockar tambem dependencias de query/status
caso o modulo carregue esses providers juntos.

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

### Nest SSE: bus separado do EventEmitter interno

Nao reutilize o `EventEmitter2` diretamente como stream de SSE. O padrao atual e:

- `EventBusService` para eventos internos entre modulos
- `StandupSseBusService` para conexoes abertas por `userId`
- `@Sse()` retornando `Observable<MessageEvent>`

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

### Docker ARM + libsql nativo

O runtime de producao e ARM64 e a API e compilada com `bun build --compile`.
`@libsql/client` ainda carrega addon nativo dinamicamente, entao o Dockerfile precisa:

- copiar o binario do Bun para o runtime
- copiar o pacote nativo `@libsql/linux-arm64-gnu` para `/app/node_modules/@libsql`
- rodar `migrate.ts` no entrypoint antes do binario compilado

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

- `notifyJobFailed()` publica evento interno
- `DiscordMessagesService` e `StandupNotificationService` cuidam das mensagens finais
- Falha na notificacao e logada, mas nao deve derrubar o fluxo principal quando o dado ja foi salvo
- Non-fatal em dois niveis: falha na notificacao e logada mas nao propaga

**Padrao 13 — Application Commands:**

- `SlashCommandBuilder` com `/standup` e 3 subcommands: `trigger`, `list`, `approve <id>`
- `trigger` dispara o mesmo fluxo de aplicacao usado pelo endpoint HTTP
- `registerApplicationCommands()` chamado no `ClientReady` — idempotente, safe on reconnect
- Guild commands (propagacao instantanea) quando `DISCORD_GUILD_ID` presente, global caso contrario
- Implementado em `modules/discord/commands/command-registration.service.ts`

## Padroes de Jobs Resilientes (Akita)

Implementados em `apps/api/src/modules/worker` e `apps/api/src/shared/database`:

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

- `WorkerEventPublisherService` publica eventos de dominio
- `discord` e `standups/events` reagem sem acoplamento direto

### TaggedErrors

```ts
LlmTemporaryError; // erro transitorio de LLM (safe to retry)
McpConnectionError; // falha de conexao MCP (safe to retry)
LockAlreadyHeldError; // job ja esta rodando para (jobName, date)
JobAlreadyCompletedError; // job ja completou com sucesso para (jobName, date)
```

### JobRunRepository

`acquireLock(jobName, date)`, `releaseLock(id, status, error?)`, `findStaleRuns(maxAgeMs)`, `findByJobAndDate(jobName, date)` — 13 testes unitarios.

Schema `job_runs` atualizado com campo `date TEXT NOT NULL` para scope do lock por dia.

## Estado Atual

- `apps/api` e a fonte de verdade do backend, do scheduler, do Discord, do email, das migrations e da observabilidade
- `apps/web` continua como frontend Angular consumindo REST + SSE
- Os antigos apps e packages foram internalizados ou arquivados
- O deploy sobe 2 imagens: `standup-api` e `standup-web`
- As migrations rodam no startup da API, nao em container separado
