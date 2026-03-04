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
- Testes: Vitest
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
    worker/           # Scheduler e orquestracao de jobs
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
```

## Hurdles (Barreiras Conhecidas)

- discord.js com Bun: funciona nativamente desde Bun 1.1+
- SQLite WAL mode: necessario para leitura concorrente (bot + scheduler + API)
- AI SDK: usar `@ai-sdk/anthropic` com `generateText` para geracao de standups
- croner: alternativa leve ao node-cron, funciona bem com Bun
