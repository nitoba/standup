# Standup Bot Monorepo

Monorepo com a topologia atual concentrada em:

- `apps/api-new`: monólito NestJS com HTTP, scheduler, Discord, jobs e email
- `apps/web`: frontend Angular

## Setup

```bash
bun install
```

## Banco local

O projeto agora aceita 3 modos de banco no ambiente local:

- `SQLite local`: use `DATABASE_URL=file:./data/standup.db`
- `Turso CLI`: rode `turso dev --db-file ./data/standup.db` e use `DATABASE_URL=http://127.0.0.1:8080`
- `Turso remoto`: use `DATABASE_URL=libsql://...` + `DATABASE_AUTH_TOKEN=...`

Para desenvolvimento local simples, o caminho mais direto continua sendo SQLite em arquivo.
Se quiser validar comportamento mais proximo do Turso/libSQL, use o `turso dev`.

## Rodar localmente

1. Crie um bot de desenvolvimento no Discord Developer Portal.
2. Convide no servidor de dev com scopes `bot` e `applications.commands`.
3. Preencha os valores em `.env.local`.
4. Rode a API monolítica e o web:

```bash
bun run dev:local:api
bun run dev:local:web
```

Exemplo com Turso CLI em outro terminal:

```bash
turso dev --db-file ./data/standup.db
bun run db:migrate
bun run dev:local
```

Com `DISCORD_GUILD_ID` preenchido, os slash commands propagam rápido para o servidor de dev.

## Comandos

```bash
bun run dev
bun run build
bun run lint
bun run typecheck
bun run test
bun run ci
```

## Banco e migrations

O schema, as migrations e a configuração do Drizzle ficam em `apps/api-new`.

```bash
bun run db:generate
bun run db:migrate
bun run db:studio
```
