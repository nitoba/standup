# Standup Bot Monorepo

Monorepo com Turborepo para separar serviços independentes:

- `apps/api`: API HTTP (Hono)
- `apps/discord-bot`: bot de revisão/aprovação no Discord
- `apps/worker`: scheduler + jobs de geração/publicação
- `packages/*`: módulos de domínio e integrações compartilhadas

## Setup

```bash
bun install
```

## Testar Local Com Bot de Dev

1. Crie um bot de desenvolvimento no Discord Developer Portal.
2. Convide no servidor de dev com scopes `bot` e `applications.commands`.
3. Preencha os valores em `.env.local` (token do bot dev, guild, channel, user id).
4. Rode os 3 serviços em terminais separados:

```bash
bun run dev:local:api
bun run dev:local:worker
bun run dev:local:bot
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

## Observação

A modelagem de banco de dados e migrations vão entrar na Fase 2 (persistence),
depois que Fase 1 (fundações + contratos + testes) estiver 100% verde.
