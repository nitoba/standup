# Standup Bot Monorepo

Monorepo com Turborepo para separar servicos independentes:

- `apps/api`: API HTTP (Hono)
- `apps/discord-bot`: bot de revisao/aprovacao no Discord
- `apps/worker`: scheduler + jobs de geracao/publicacao
- `packages/*`: modulos de dominio e integracoes compartilhadas

## Setup

```bash
bun install
```

## Comandos

```bash
bun run dev
bun run build
bun run lint
bun run typecheck
bun run test
bun run ci
```

## Observacao

A modelagem de banco de dados e migrations vao entrar na Fase 2 (persistence),
depois que Fase 1 (fundacoes + contratos + testes) estiver 100% verde.
