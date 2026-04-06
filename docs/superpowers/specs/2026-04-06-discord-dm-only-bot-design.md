# Discord DM-Only Bot Design

> **Contexto:** Resolver o problema de "no mutual guilds" e remover a dependencia de canal publico no Discord, transformando o bot em um canal pessoal por DM.

## Problema

- O bot falha ao enviar DMs quando nao ha relacao valida com o usuario.
- O fluxo depende de `DISCORD_CHANNEL_ID` para publicar standups aprovados.
- Standups ficam presos em `draft` quando a DM falha.
- O job pode terminar como `success` mesmo sem entregar a revisao.

## Objetivo

- Remover `DISCORD_CHANNEL_ID` do sistema.
- Operar o bot exclusivamente via DM.
- Usuario pode usar slash commands na DM do bot.
- Se DM proativa falhar, o web app avisa e orienta o usuario a abrir a DM.
- Aprovacao salva apenas no sistema, sem publicar em canal.

## Design

### 1. Remocao de `DISCORD_CHANNEL_ID`

- Remover `DISCORD_CHANNEL_ID` do `env.schema.ts`.
- Remover `channelId` do getter `discord` em `EnvService`.
- Remover `DISCORD_CHANNEL_ID` de `.env.local`, `docker-compose.yml`, deploy configs, docs.
- Remover `publishStandup` do fluxo de aprovacao normal.
- Remover `StandupStatusSyncService` da logica de publicacao em canal.

### 2. Novo Estado de Entrega

Adicionar `delivery_pending` a `standups.status`:

```
draft -> delivery_pending -> pending_review -> approved -> published (removido)
draft -> rejected -> draft
```

- `delivery_pending`: standup gerado, mas DM de revisao nao foi entregue.
- O job nao considera o standup "pronto" ate que a DM seja entregue ou falhe explicitamente.
- O web app mostra estado de `delivery_pending` e instrui o usuario a abrir a DM do bot.

### 3. Fluxo de Geracao e Entrega

1. Worker gera standup e salva como `draft`.
2. Tenta enviar DM de revisao.
3. Se DM funcionar:
   - Salva `dmMessageId`.
   - Transiciona para `pending_review`.
   - Job termina com `success`.
4. Se DM falhar:
   - Transiciona para `delivery_pending`.
   - Job termina com `success` mas com flag de entrega pendente.
   - Web app mostra "aguardando abertura de DM".

### 4. Reenvio de DM Pendente

- Endpoint `POST /standups/:id/retry-dm`.
- Comando `/standup retry` na DM do bot.
- Listener tenta reenviar a DM e transicionar para `pending_review`.

### 5. Comandos em DM

- Registrar comandos como globais (ja suportado quando `DISCORD_GUILD_ID` nao existe).
- Garantir que `interaction.isChatInputCommand()` funcione em DM.
- Remover `DISCORD_GUILD_ID` como dependencia opcional.

### 6. Job Status

- O job so considera `success` quando:
  - Standup foi gerado E
  - DM foi entregue OU falhou explicitamente (e status foi atualizado).
- Se DM falhar, o job ainda termina com `success` mas o standup fica em `delivery_pending`.

### 7. Remocao de Publicacao em Canal

- Remover `publishStandup` de `StandupStatusSyncService`.
- Remover `buildPublishedEmbed` de `embeds.ts` (ou manter so para referencia historica).
- Remover `POST /standups/:id/send-to-discord` do controller.
- Remover `sentToDiscordAt` do schema de standups.

## Arquivos a Modificar

| Arquivo | Mudanca |
|---------|---------|
| `platform/env/env.schema.ts` | Remover `DISCORD_CHANNEL_ID` |
| `platform/env/env.service.ts` | Remover `channelId` do getter `discord` |
| `platform/database/schema.ts` | Adicionar `delivery_pending`, remover `published` |
| `platform/database/repositories/standup-write.repository.ts` | Suporte a `delivery_pending` |
| `platform/database/repositories/standup-read.repository.ts` | Suporte a `delivery_pending` em queries |
| `platform/database/repositories/standup-helpers.ts` | Atualizar `toRecord` |
| `shared/domain/types.ts` | Atualizar `StandupStatus` |
| `shared/domain/state-machine.ts` | Atualizar transicoes |
| `shared/domain/schemas.ts` | Atualizar validacao Zod |
| `shared/openapi/response-dtos.ts` | Atualizar enum de status |
| `contexts/standups/worker/standup/standup-pipeline.service.ts` | Transicionar para `delivery_pending` se DM falhar |
| `interfaces/discord/services/standup-notification.service.ts` | Transicionar para `delivery_pending` em vez de deixar em `draft` |
| `interfaces/discord/services/standup-status-sync.service.ts` | Remover logica de publicacao em canal |
| `interfaces/discord/notifications/discord-messages.service.ts` | Remover `publishStandup` |
| `interfaces/discord/commands/command-registration.service.ts` | Remover logica de guild commands |
| `interfaces/discord/embeds.ts` | Remover `buildPublishedEmbed` |
| `contexts/standups/send-to-discord/` | Remover contexto inteiro |
| `.env.local` | Remover `DISCORD_CHANNEL_ID` |

## Arquivos a Criar

| Arquivo | Responsabilidade |
|---------|-----------------|
| `contexts/standups/delivery/retry-dm.service.ts` | Reenviar DM pendente |
| `contexts/standups/delivery/retry-dm.controller.ts` | Endpoint `POST /standups/:id/retry-dm` |

## Testes

- Testar transicao `draft -> delivery_pending` quando DM falha.
- Testar reenvio de DM pendente.
- Testar que job termina com `success` mesmo quando DM falha.
- Testar que `DISCORD_CHANNEL_ID` nao existe mais no schema.
- Testar que comandos funcionam em DM.

## Riscos e Mitigacoes

| Risco | Mitigacao |
|-------|-----------|
| Discord bloqueia DM proativa mesmo apos login | Web app mostra estado e orienta usuario a abrir DM |
| Usuario nao sabe como interagir com bot | Instrucoes claras no web app e na primeira DM |
| Comandos globais demoram para propagar | Registrar como globais, mas aceitar delay de ate 1h |
