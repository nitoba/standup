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
- LLM: AI SDK da Vercel (@ai-sdk/anthropic)
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

## Arquitetura de Comunicacao

```
worker ──POST /internal/notify/standup-ready──► discord-bot (porta BOT_INTERNAL_PORT)
         header: x-internal-secret                   │
                                                     ├─ busca standup no DB
                                                     └─ envia DM ao usuario (non-fatal)
```

- Worker nao sabe que Discord existe — apenas faz POST HTTP generico
- discord-bot sobe **dois servidores** na mesma instancia:
  - Hono na `BOT_INTERNAL_PORT` (3334) para rotas internas
  - Gateway Discord (discord.js) para interacoes com botoes
- Autenticacao interna: header `x-internal-secret` com `INTERNAL_SECRET`
- Falha no DM e **non-fatal**: standup ja esta salvo no DB, usuario pode aprovar via API
- Cada app na sua porta: `api=3333`, `discord-bot=3334` (`BOT_INTERNAL_PORT`)

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
    await handleSlashCommand(interaction, client, env)  // delega
    return
  }
  if (interaction.isButton()) {
    await handleButtonInteraction(interaction, client, env)  // delega
  }
})
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
          internal-routes.ts      # POST /internal/notify/* (auth + DB + DM)
          internal-routes.test.ts
        index.ts            # Entrypoint: env + Client + HTTP server + event listeners

    worker/                 # Scheduler e orquestracao de jobs
      src/
        job/                # Pipeline de geracao de standup
          standup-job.ts        # collect → generate → persist → notify
          standup-job.test.ts
        notifications/      # Notificacoes HTTP para o discord-bot
          notify-standup-ready.ts     # POST /internal/notify/standup-ready
          notify-standup-ready.test.ts
          notify-job-failed.ts        # POST /internal/notify/job-failed
          notify-job-failed.test.ts
        scheduler.ts        # startScheduler() — setup de cron jobs
        index.ts            # Entrypoint: loadEnv → startScheduler
        vitest.setup.ts     # Shim Bun.randomUUIDv7 para Vitest
      vitest.config.ts      # Config Vitest local (aponta setupFiles)

  packages/
    config/           # Env vars e configuracao tipada (loadEnv, AppEnv)
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
  turbo.json          # Pipeline monorepo
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
# Discord
DISCORD_BOT_TOKEN=
DISCORD_CHANNEL_ID=       # Canal onde publica standups
DISCORD_USER_ID=          # Seu user ID para DMs
DISCORD_GUILD_ID=         # Opcional: guild commands (dev) vs global (prod)

# LLM
ANTHROPIC_API_KEY=

# Azure DevOps (via MCP)
AZURE_DEVOPS_ORG=
AZURE_DEVOPS_PAT=

# Git
REPOS_BASE_PATH=/home/nitoba/Documents/repos/ibs/repos
GIT_AUTHOR=bruno.alves@biosistemico.com.br
GIT_SINCE_PERIOD=16 hours ago

# App
DATABASE_URL=./data/standup.db
PORT=3333
NODE_ENV=development

# Comunicacao interna worker→bot
BOT_INTERNAL_URL=http://localhost:3334
BOT_INTERNAL_PORT=3334
INTERNAL_SECRET=change-me-in-production
```

## Hurdles (Barreiras Conhecidas)

- discord.js com Bun: funciona nativamente desde Bun 1.1+
- SQLite WAL mode: necessario para leitura concorrente (bot + scheduler + API)
- AI SDK: usar `@ai-sdk/anthropic` com `generateObject` para geracao de standups
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
  throw new ExternalServiceError({ service: 'discord', message: 'Not a sendable channel' })
}
await channel.send({ content })
```

`SendableChannels` e exportado como tipo: `type SendableChannels = Extract<Channel, { send: (...args: any[]) => any }>`.

### interaction.deferUpdate() para evitar timeout de 3s no Discord

Operacoes de DB + publicacao podem demorar mais que 3s (limite do Discord para interacoes).
Padrao correto:

```ts
await interaction.deferUpdate()         // avisa Discord que estamos processando
// ... logica async ...
await interaction.editReply({           // atualiza a mensagem original
  content: result.message,
  components: [],                        // remove os botoes apos a acao
})
```

`deferUpdate()` edita a mensagem original (botoes permanecem desabilitados).
`editReply()` com `components: []` remove os botoes para evitar cliques duplicados.

### Mock de discord.js Client para testes

O Client real conecta ao Discord. Para testes unitarios, passar um fake client tipado:

```ts
const fakeClient = {} as unknown as Client

// Para testar funcoes que usam channels.fetch:
function makeClient(channelResult: unknown) {
  const fetchChannel = vi.fn().mockResolvedValue(channelResult)
  return {
    client: { channels: { fetch: fetchChannel } } as unknown as Client,
    fetchChannel,
  }
}
// Canal mock precisa de isTextBased() + isSendable() + send():
function makeChannel() {
  const send = vi.fn()
  return { channel: { isTextBased: () => true, isSendable: () => true, send }, send }
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
- `registerApplicationCommands()` chamado no `ClientReady` — idempotente, safe on reconnect
- Guild commands (propagacao instantanea) quando `DISCORD_GUILD_ID` presente, global caso contrario
- Implementado em `discord/commands/register.ts`

## Estado Atual (o que esta completo)

### Pacotes completos (com testes)

- `packages/domain` — types, schemas Zod, state machine, TaggedErrors
- `packages/config` — `loadEnv()` com todas as env vars (incluindo `DISCORD_GUILD_ID` opcional)
- `packages/logger` — Winston estruturado
- `packages/git-collector` — 29 testes (bun test)
- `packages/db` — StandupRepository completo, 18 testes (bun test)
- `packages/standup-generator` — generateStandup + MCP enrichment, 18 testes (vitest)

### Apps completos

- `apps/worker` — 15 testes (vitest)
  - `job/standup-job.ts`: pipeline collect→generate→persist→notify
  - `notifications/notify-standup-ready.ts`: POST /internal/notify/standup-ready
  - `notifications/notify-job-failed.ts`: POST /internal/notify/job-failed (Padrao 8)
  - `scheduler.ts`: startScheduler() com croner
  - `index.ts`: entrypoint puro

- `apps/discord-bot` — 44 testes (vitest)
  - `http/internal-routes.ts`: POST /internal/notify/standup-ready + job-failed
  - `discord/notifications/send-review-dm.ts`: DM com embed azul + botoes
  - `discord/notifications/send-channel-notification.ts`: helper generico de canal
  - `discord/notifications/publish-standup.ts`: publica embed verde no canal
  - `discord/handlers/interaction-handler.ts`: logica approve/reject/regenerate
  - `discord/handlers/button-handler.ts`: handler de botoes com emojis (Padrao 2)
  - `discord/handlers/slash-command-handler.ts`: roteador de slash commands
  - `discord/commands/`: register + trigger + list + approve (Padrao 13)
  - `discord/embeds.ts`: builders de embed (Padrao 3)
  - `index.ts`: entrypoint puro — env + Client + HTTP + event listeners

### CI

- `bun run ci` — 33/33 tasks verde (lint + typecheck + test em todos os pacotes/apps)

## Proximos Passos

1. **Slice 6 — apps/api rotas reais**
   - `GET /standups` — lista com filtros (status, date)
   - `GET /standups/:id` — detalhe
   - `POST /standups/trigger` — trigger manual do job
   - `PATCH /standups/:id/status` — aprovacao manual sem Discord

2. **Docker + docker-compose**
   - Dockerfile multi-stage para cada app
   - `docker-compose.yml` orquestrando api + discord-bot + worker

3. **`.env.example`** na raiz do monorepo
