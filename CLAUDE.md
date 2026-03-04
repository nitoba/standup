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
         header: x-internal-secret                  │
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

## Estrutura de Pastas

```
standup/
  apps/
    api/              # Hono API (health, busca, filtros, triggers manuais)
    discord-bot/      # Bot Discord (DM, botoes de revisao, comandos)
      src/
        discord/      # Logica Discord: send-review-dm, handlers de botao
        http/         # Rotas Hono internas: internal-routes.ts
        index.ts      # Entrypoint: sobe Hono + gateway Discord
    worker/           # Scheduler e orquestracao de jobs
      src/
        standup-job.ts        # Pipeline collect→generate→persist→notify
        standup-notifier.ts   # POST /internal/notify/standup-ready
        index.ts              # Scheduler (croner)
        vitest.setup.ts       # Shim Bun globals para Vitest
      vitest.config.ts        # Config Vitest local (aponta setupFiles)
  packages/
    config/           # Env vars e configuracao tipada
    domain/           # Types, schemas, errors, state machine
    db/               # Drizzle schema, conexao, repositories
    git-collector/    # Coleta de commits dos repositorios
    standup-generator/# Geracao de standup via AI SDK + MCP enrichments
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
- AI SDK: usar `@ai-sdk/anthropic` com `generateText` para geracao de standups
- croner: alternativa leve ao node-cron, funciona bem com Bun

### Vitest + Bun globals (oven-sh/bun#4145)

Vitest roda seus workers em **Node**, nao no runtime Bun. Globais como `Bun.randomUUIDv7()`
nao existem no ambiente de teste. Solucao adotada: shim em `vitest.setup.ts`:

```ts
// apps/worker/src/vitest.setup.ts
import { randomUUID } from 'node:crypto'
if (typeof globalThis.Bun === 'undefined') {
  Object.assign(globalThis, { Bun: { randomUUIDv7: (): string => randomUUID() } })
}
```

Referenciar no `vitest.config.ts` local do pacote:
```ts
// apps/worker/vitest.config.ts
export default defineConfig({ test: { setupFiles: ['./src/vitest.setup.ts'] } })
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
vi.mock('@standup/db', () => {
  function StandupRepository() { return { create: mocks.repoCreate } }
  return { getDb: mocks.getDb, StandupRepository }
})
```

O mesmo padrao se aplica ao `discord.js Client`:
```ts
function Client(this: Record<string, unknown>) {
  this.login = mocks.login
  this.once = mocks.once
}
```

### vi.hoisted() para evitar TDZ em vi.mock factories

Quando factories de `vi.mock()` referenciam variaveis declaradas no mesmo escopo,
usar `vi.hoisted()` para evitar TDZ (Temporal Dead Zone):

```ts
const mocks = vi.hoisted(() => ({
  collect: vi.fn(),
  notifyStandupReady: vi.fn(),
}))
vi.mock('./standup-notifier.js', () => ({ notifyStandupReady: mocks.notifyStandupReady }))
```

### discord.js: race condition no ClientReady

`client.login()` e async mas o client so esta pronto no evento `ClientReady`.
Padrao correto para aguardar conexao:

```ts
await new Promise<void>((resolve, reject) => {
  client.once(Events.ClientReady, () => resolve())
  client.once(Events.Error, reject)
  client.login(token).catch(reject)
})
```

### Hono middleware deve retornar `next()` explicitamente

```ts
// ERRADO — causa "Not all code paths return a value"
app.use('/internal/*', async (c, next) => {
  if (!valid) return c.json({ error: 'Unauthorized' }, 401)
  await next()  // nao retorna
})

// CORRETO
app.use('/internal/*', async (c, next) => {
  if (!valid) return c.json({ error: 'Unauthorized' }, 401)
  return next()  // retorna a Promise
})
```

## Estado Atual (o que esta completo)

### Pacotes completos (com testes)
- `packages/domain` — types, schemas Zod, state machine, TaggedErrors
- `packages/config` — `loadEnv()` com todas as env vars
- `packages/logger` — Winston estruturado
- `packages/git-collector` — 29 testes (bun test)
- `packages/db` — StandupRepository completo, 18 testes (bun test)
- `packages/standup-generator` — generateStandup + MCP enrichment, 18 testes (vitest)

### Apps completos
- `apps/worker` — scheduler + pipeline completo + notifier HTTP, 10 testes (vitest)
  - `standup-job.ts`: collect → generate → persist → notify
  - `standup-notifier.ts`: POST /internal/notify/standup-ready
- `apps/discord-bot` — internal HTTP route + send-review-dm stub, 6 testes (vitest)
  - `src/http/internal-routes.ts`: POST /internal/notify/standup-ready (auth + DB lookup + DM)
  - `src/discord/send-review-dm.ts`: envia DM com botoes Aprovar/Rejeitar/Regenerar
  - `src/index.ts`: sobe Hono (BOT_INTERNAL_PORT) + gateway Discord

### CI
- `bun run ci` — 33/33 tasks verde (lint + typecheck + test em todos os pacotes/apps)

## Proximos Passos

1. **Slice 5 — Handlers de aprovacao/rejeicao no discord-bot**
   - `src/discord/interaction-handler.ts` — logica de approve/reject/regenerate
   - Ao aprovar: `repo.updateStatus(id, 'approved')` → publica no canal Discord
   - Ao rejeitar: `repo.updateStatus(id, 'rejected')`
   - Ao regenerar: chama worker via HTTP trigger → novo standup substitui o draft
   - Responder ao botao com `interaction.update()` (edita a mensagem original)

2. **Slice 6 — apps/api rotas reais**
   - `GET /standups` — lista com filtros (status, date)
   - `GET /standups/:id` — detalhe
   - `POST /standups/trigger` — trigger manual do job (chama worker via HTTP ou importa diretamente)
   - `PATCH /standups/:id/status` — aprovacao manual sem Discord

3. **Publicacao no canal Discord**
   - `src/discord/publish-standup.ts` — posta no `DISCORD_CHANNEL_ID`
   - Chamado apos aprovacao (Slice 5)

4. **Docker + docker-compose**
   - Dockerfile multi-stage para cada app
   - `docker-compose.yml` orquestrando api + discord-bot + worker

5. **`.env.example`** na raiz do monorepo
