# API Nova

Esta app substitui a topologia atual de `apps/api`, `apps/worker` e
`apps/discord-bot` por um monolito modular em NestJS.

## Mapeamento da arquitetura

- `apps/api` -> `src/modules/http`
  Responsavel por controllers HTTP, auth, SSE e coordenacao de casos de uso.
- `apps/worker` -> `src/modules/worker`
  Responsavel por scheduler, pipeline de geracao e jobs internos.
- `apps/discord-bot` -> `src/modules/discord`
  Responsavel por gateway Discord, DMs, slash commands e publicacao.
- Comunicacao interna HTTP -> `src/modules/events`
  Eventos do Nest substituem chamadas `POST /internal/*` entre processos.

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

## Proximo passo de migracao

1. Mover os casos de uso do `api` atual para `modules/standups` e `modules/http`.
2. Portar o pipeline do `worker` para `modules/worker`.
3. Portar o cliente Discord e handlers para `modules/discord`.
4. Remover os apps antigos quando as rotas e automacoes estiverem paritarias.
