# API Nova

Esta app e o backend ativo do projeto. A antiga topologia separada foi
arquivada fora do workspace.

## Mapeamento da arquitetura

- `src/modules/http`
  Controllers HTTP, auth, SSE e coordenacao de casos de uso.
- `src/modules/worker`
  Scheduler, pipeline de geracao e jobs internos.
- `src/modules/discord`
  Gateway Discord, DMs, slash commands e publicacao.
- `src/modules/events`
  Eventos do Nest para desacoplamento interno entre modulos.

## Fundacoes implementadas

- `@kiyasov/platform-hono` como adapter HTTP do Nest
- `@thallesp/nestjs-better-auth` com `forRootAsync`
- `@sixaphone/nestjs-drizzle` com schema local em `src/shared/database`
- `nestjs/config` + Zod em `src/shared/env`
- `@nestjs/event-emitter` para desacoplamento entre modulos
- `@nestjs/schedule` para substituir `croner`
- `vitest` + `biome` + `bun`

## Estrutura

```text
src/
  app.module.ts
  main.ts
  shared/
    env/
    database/
  modules/
    auth/
    discord/
    events/
    http/
    standups/
    worker/
```

## Banco e migrations

O `api` e a fonte de verdade do schema e das migrations do banco.

- Schema: `src/shared/database/schema.ts`
- Migrations: `src/shared/database/migrations`
- Config do Drizzle: `drizzle.config.ts`

Comandos:

```bash
bun run db:generate
bun run db:migrate
bun run db:studio
```

No root do monorepo, os mesmos comandos delegam para `@standup-api`.

No container, o entrypoint roda `src/shared/database/migrate.ts` antes de iniciar o binario compilado da API. Nao existe mais um container dedicado de migrations.

## Status

O `api` concentra o backend, o scheduler, o Discord e as migrations do
banco.
