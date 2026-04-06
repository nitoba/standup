# Discord DM-Only Bot Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transformar o bot Discord de canal-publico para DM-only, removendo `DISCORD_CHANNEL_ID`, adicionando estado `delivery_pending`, e corrigindo o bug de standups ficarem presos em `draft`.

**Architecture:**
- Remover `DISCORD_CHANNEL_ID` de todo o sistema.
- Adicionar estado `delivery_pending` entre `draft` e `pending_review`.
- DM de revisao falha -> standup vai para `delivery_pending` em vez de ficar em `draft`.
- Job termina com `success` mesmo quando DM falha, mas o standup fica aguardando entrega.
- Web app mostra estado de entrega pendente e orienta usuario a abrir DM do bot.
- Aprovacao salva apenas no sistema, sem publicacao em canal Discord.

**Tech Stack:** NestJS, Drizzle ORM, discord.js, Better Auth

---

## Chunk 1: Schema e Tipos

### Task 1: Atualizar schema de env

**Files:**
- Modify: `apps/api/src/platform/env/env.schema.ts:31`
- Modify: `apps/api/src/platform/env/env.service.ts:36-43`

- [ ] **Step 1: Remover DISCORD_CHANNEL_ID do schema**

```typescript
// apps/api/src/platform/env/env.schema.ts
// Remover linha 31:
// DISCORD_CHANNEL_ID: z.string().optional(),
```

- [ ] **Step 2: Atualizar EnvService**

```typescript
// apps/api/src/platform/env/env.service.ts
// No getter discord(), remover channelId:
// Antes:
// discord() {
//   return {
//     gatewayEnabled: this.get('DISCORD_GATEWAY_ENABLED'),
//     token: this.get('DISCORD_BOT_TOKEN'),
//     channelId: this.get('DISCORD_CHANNEL_ID'),  // REMOVER
//     guildId: this.get('DISCORD_GUILD_ID'),
//   }
// }
```

- [ ] **Step 3: Remover de .env.local se existir**

```bash
# Verificar se existe em .env.local e remover
grep -n "DISCORD_CHANNEL_ID" .env.local 2>/dev/null || echo "não existe"
```

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/platform/env/env.schema.ts apps/api/src/platform/env/env.service.ts
git commit -m "refactor: remove DISCORD_CHANNEL_ID do schema de env"
```

### Task 2: Adicionar estado delivery_pending

**Files:**
- Modify: `apps/api/src/platform/database/schema.ts`
- Modify: `apps/api/src/shared/domain/types.ts:25-30`
- Modify: `apps/api/src/shared/domain/state-machine.ts`
- Modify: `apps/api/src/shared/domain/schemas.ts`
- Modify: `apps/api/src/shared/openapi/response-dtos.ts:41`

- [ ] **Step 1: Atualizar schema do banco**

```typescript
// apps/api/src/platform/database/schema.ts
// Em standups.status enum:
// Antes: enum: ['draft', 'pending_review', 'approved', 'rejected', 'published']
// Depois: enum: ['draft', 'delivery_pending', 'pending_review', 'approved', 'rejected']
```

- [ ] **Step 2: Atualizar tipos TypeScript**

```typescript
// apps/api/src/shared/domain/types.ts
export type StandupStatus =
  | 'draft'
  | 'delivery_pending'  // NOVO
  | 'pending_review'
  | 'approved'
  | 'rejected'
```

- [ ] **Step 3: Atualizar state machine**

```typescript
// apps/api/src/shared/domain/state-machine.ts
// Atualizar transicoes:
// draft: ['delivery_pending'],
// delivery_pending: ['pending_review', 'draft'],
// pending_review: ['approved', 'rejected', 'draft'],
```

- [ ] **Step 4: Atualizar schemas Zod**

```typescript
// apps/api/src/shared/domain/schemas.ts
// No standupStatusEnum:
// Antes: 'draft' | 'pending_review' | 'approved' | 'rejected' | 'published'
// Depois: 'draft' | 'delivery_pending' | 'pending_review' | 'approved' | 'rejected'
```

- [ ] **Step 5: Atualizar OpenAPI DTOs**

```typescript
// apps/api/src/shared/openapi/response-dtos.ts
// Atualizar enum de status para incluir delivery_pending
```

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/platform/database/schema.ts apps/api/src/shared/domain/types.ts apps/api/src/shared/domain/state-machine.ts apps/api/src/shared/domain/schemas.ts apps/api/src/shared/openapi/response-dtos.ts
git commit -m "feat: adicionar estado delivery_pending ao standup"
```

---

## Chunk 2: Repositorios

### Task 3: Atualizar repositories para suportar delivery_pending

**Files:**
- Modify: `apps/api/src/platform/database/repositories/standup-write.repository.ts`
- Modify: `apps/api/src/platform/database/repositories/standup-read.repository.ts`
- Modify: `apps/api/src/platform/database/repositories/standup-helpers.ts`
- Test: `apps/api/src/platform/database/repositories/standup-write.repository.spec.ts` (se existir)

- [ ] **Step 1: Adicionar updateStatus para delivery_pending**

```typescript
// apps/api/src/platform/database/repositories/standup-write.repository.ts
// Metodo updateStatus ja deve suportar qualquer status valido
// Verificar se ha validacao que precisa ser atualizada
```

- [ ] **Step 2: Verificar findLatestByUserAndDate**

```typescript
// apps/api/src/platform/database/repositories/standup-read.repository.ts
// Este metodo ja retorna o ultimo standup independente do status
// Nao precisa de mudanca
```

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/platform/database/repositories/
git commit -m "refactor: repositories suportam delivery_pending"
```

---

## Chunk 3: StandupPipeline e notificacao

### Task 4: Atualizar pipeline para transicionar para delivery_pending quando DM falha

**Files:**
- Modify: `apps/api/src/interfaces/discord/services/standup-notification.service.ts`
- Modify: `apps/api/src/contexts/standups/worker/standup/standup-pipeline.service.ts`
- Test: `apps/api/src/interfaces/discord/services/standup-notification.service.spec.ts`

- [ ] **Step 1: Atualizar StandupNotificationService**

```typescript
// apps/api/src/interfaces/discord/services/standup-notification.service.ts
// Na linha ~62-69, quando DM falha:
// Antes:
// return Result.ok({ standupId, dmSent: false, transitioned: false })

// Depois:
// Transicionar para delivery_pending
const transitionResult = await this.standupWrite.updateStatus(standupId, 'delivery_pending')
if (transitionResult.isErr()) {
  this.logger.warn('Failed to transition standup to delivery_pending', {...})
  return Result.ok({ standupId, dmSent: false, transitioned: false })
}
return Result.ok({ standupId, dmSent: false, transitioned: true, newStatus: 'delivery_pending' })
```

- [ ] **Step 2: Atualizar interface StandupReadyResult**

```typescript
// Adicionar novo campo:
export interface StandupReadyResult {
  standupId: string
  dmSent: boolean
  transitioned: boolean
  newStatus?: 'pending_review' | 'delivery_pending'
}
```

- [ ] **Step 3: Atualizar pipeline para esperar entrega**

```typescript
// apps/api/src/contexts/standups/worker/standup/standup-pipeline.service.ts
// Na secao que chama notifyStandupReady (~linha 128):
// O pipeline ja delega para o evento, mas precisamos garantir
// que o job so termina apos a transicao (ou falha) ser processada.
// Como emit e fire-and-forget, o pipeline nao tem como saber o resultado.
// Solucao: o pipeline marca o standup como delivery_pending primeiro,
// e so transiciona para pending_review se receber confirmacao.
```

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/interfaces/discord/services/standup-notification.service.ts
git commit -m "feat: transicionar para delivery_pending quando DM falha"
```

### Task 5: Executar migrate para novo status

**Files:**
- Modify: `apps/api/data/migrations/` (criar nova migration)

- [ ] **Step 1: Gerar migration**

```bash
cd apps/api
bun run db:generate
```

- [ ] **Step 2: Aplicar migration**

```bash
bun run db:migrate
```

- [ ] **Step 3: Commit**

```bash
git add apps/api/data/migrations/
git commit -m "db: adicionar estado delivery_pending"
```

---

## Chunk 4: Remover publicacao em canal

### Task 6: Remover logica de publicacao em canal

**Files:**
- Modify: `apps/api/src/interfaces/discord/services/standup-status-sync.service.ts`
- Modify: `apps/api/src/interfaces/discord/notifications/discord-messages.service.ts`
- Modify: `apps/api/src/interfaces/discord/embeds.ts`
- Modify: `apps/api/src/contexts/standups/publication/publish-standup.service.ts`

- [ ] **Step 1: Simplificar StandupStatusSyncService**

```typescript
// apps/api/src/interfaces/discord/services/standup-status-sync.service.ts
// Remover logica de publicacao em canal (linhas ~92-127)
// Agora so atualiza DM quando aprovado/rejeitado
```

- [ ] **Step 2: Remover publishStandup de discord-messages**

```typescript
// apps/api/src/interfaces/discord/notifications/discord-messages.service.ts
// Remover metodo publishStandup se existir
```

- [ ] **Step 3: Comentar buildPublishedEmbed**

```typescript
// apps/api/src/interfaces/discord/embeds.ts
// Comentar ou remover buildPublishedEmbed
// (pode manter para referencia historica)
```

- [ ] **Step 4: Remover contexto de publication**

```typescript
// O contexto contexts/standups/publication/ pode ser removido ou esvaziado
// Verificar se ha dependencias antes de deletar
```

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/interfaces/discord/services/standup-status-sync.service.ts apps/api/src/interfaces/discord/notifications/discord-messages.service.ts apps/api/src/interfaces/discord/embeds.ts
git commit -m "refactor: remover publicacao em canal do Discord"
```

---

## Chunk 5: Reenvio de DM pendente

### Task 7: Criar servico de retry de DM

**Files:**
- Create: `apps/api/src/contexts/standups/delivery/retry-dm.service.ts`
- Create: `apps/api/src/contexts/standups/delivery/retry-dm.controller.ts`

- [ ] **Step 1: Criar RetryDmService**

```typescript
// apps/api/src/contexts/standups/delivery/retry-dm.service.ts
import { Injectable } from '@nestjs/common'
import { StandupReadRepository } from '../../../platform/database/repositories/standup-read.repository'
import { StandupWriteRepository } from '../../../platform/database/repositories/standup-write.repository'
import { DiscordMessagesService } from '../../../interfaces/discord/notifications/discord-messages.service'
import { AppLoggerFactory } from '../../../platform/logger'
import { Result } from '../../../shared/domain'

@Injectable()
export class RetryDmService {
  private readonly logger: ReturnType<AppLoggerFactory['create']>
  constructor(
    private readonly loggerFactory: AppLoggerFactory,
    private readonly standupRead: StandupReadRepository,
    private readonly standupWrite: StandupWriteRepository,
    private readonly messages: DiscordMessagesService,
  ) {
    this.logger = this.loggerFactory.create('retry-dm')
  }

  async retryDm(standupId: string, userId: string, discordUserId: string) {
    const found = await this.standupRead.findById(standupId)
    if (found.isErr()) {
      return Result.err(found.error)
    }

    const record = found.value
    if (record.status !== 'delivery_pending') {
      return Result.err(new Error('Standup not in delivery_pending state'))
    }

    const dmResult = await this.messages.sendReviewDm(record, discordUserId)
    if (dmResult.isErr()) {
      return dmResult
    }

    await this.standupWrite.updateDmMessageId(standupId, dmResult.value.messageId)
    return this.standupWrite.updateStatus(standupId, 'pending_review')
  }
}
```

- [ ] **Step 2: Criar RetryDmController**

```typescript
// apps/api/src/contexts/standups/delivery/retry-dm.controller.ts
import { Controller, Post, Param, Body, UseGuards, BadRequestException } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger'
import { RetryDmService } from './retry-dm.service'
import { UserRepository } from '../../../platform/database/repositories/user.repository'
import { UserSettingsRepository } from '../../../platform/database/repositories/user-settings.repository'
import { Result } from '../../../shared/domain'

@ApiTags('standups')
@Controller('standups')
export class RetryDmController {
  constructor(
    private readonly retryDm: RetryDmService,
    private readonly userRepo: UserRepository,
    private readonly settingsRepo: UserSettingsRepository,
  ) {}

  @Post(':id/retry-dm')
  @ApiOperation({ summary: 'Reenviar DM de revisao pendente' })
  @ApiResponse({ status: 200, description: 'DM reenviada com sucesso' })
  @ApiResponse({ status: 400, description: 'Standup nao esta em estado pendente' })
  async retryDmDelivery(
    @Param('id') standupId: string,
    @Body('userId') userId: string,
  ) {
    const discordResult = await this.userRepo.findDiscordIdByUserId(userId)
    if (discordResult.isErr() || !discordResult.value) {
      throw new BadRequestException('Usuario sem Discord vinculado')
    }

    const result = await this.retryDm.retryDm(standupId, userId, discordResult.value)
    if (result.isErr()) {
      throw new BadRequestException(result.error.message)
    }

    return { ok: true, standupId }
  }
}
```

- [ ] **Step 3: Registrar no modulo**

```typescript
// Adicionar ao StandupsModule:
// RetryDmService,
// RetryDmController,
// (entao adicionar controller ao providers do modulo)
```

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/contexts/standups/delivery/
git commit -m "feat: adicionar servico de reenvio de DM pendente"
```

---

## Chunk 6: Testes

### Task 8: Testar nova logica de entrega

**Files:**
- Test: `apps/api/src/interfaces/discord/services/standup-notification.service.spec.ts`
- Test: `apps/api/src/contexts/standups/delivery/retry-dm.service.spec.ts` (criar)

- [ ] **Step 1: Atualizar teste de falha de DM**

```typescript
// apps/api/src/interfaces/discord/services/standup-notification.service.spec.ts
// Teste existente "does not transition when sending the review DM fails"
// Agora deve verificar que transiciona para delivery_pending
it('transitions to delivery_pending when DM fails', async () => {
  // ... setup com sendReviewDm retornando erro ...
  
  expect(standupRepository.updateStatus).toHaveBeenCalledWith(
    'standup-1',
    'delivery_pending',  // ERA draft, agora delivery_pending
  )
})
```

- [ ] **Step 2: Criar teste para RetryDmService**

```typescript
// apps/api/src/contexts/standups/delivery/retry-dm.service.spec.ts
import { describe, expect, it, vi } from 'vitest'
import { Result } from '../../../../shared/domain'
import { RetryDmService } from './retry-dm.service'

describe('RetryDmService', () => {
  it('reenvia DM e transiciona para pending_review', async () => {
    const messages = {
      sendReviewDm: vi.fn().mockResolvedValue(
        Result.ok({ messageId: 'msg-1' })
      ),
    }
    const service = new RetryDmService(
      makeLoggerFactory() as never,
      {
        findById: vi.fn().mockResolvedValue(
          Result.ok({ id: 'standup-1', status: 'delivery_pending' })
        ),
      } as never,
      {
        updateDmMessageId: vi.fn().mockResolvedValue(Result.ok({})),
        updateStatus: vi.fn().mockResolvedValue(Result.ok({})),
      } as never,
      messages as never,
    )

    const result = await service.retryDm('standup-1', 'user-1', 'discord-1')
    
    expect(result.isOk()).toBe(true)
    expect(messages.sendReviewDm).toHaveBeenCalled()
  })

  it('falha quando standup nao esta em delivery_pending', async () => {
    // ... setup com status draft ...
    
    const result = await service.retryDm('standup-1', 'user-1', 'discord-1')
    expect(result.isErr()).toBe(true)
  })
})
```

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/
git commit -m "test: adicionar testes para delivery_pending e retry DM"
```

---

## Chunk 7: Verificacao Final

### Task 9: Verificar integracao

- [ ] **Step 1: Rodar typecheck**

```bash
cd apps/api && bun run typecheck
```

- [ ] **Step 2: Rodar testes**

```bash
cd apps/api && bun run test
```

- [ ] **Step 3: Verificar lint**

```bash
cd apps/api && bun run lint
```

- [ ] **Step 4: Build**

```bash
cd apps/api && bun run build
```

- [ ] **Step 5: Commit final**

```bash
git add -A
git commit -m "feat: implementar fluxo DM-only sem canal pubblico"
```

---

## Resumo de Arquivos Modificados

| Chunk | Arquivos |
|-------|----------|
| 1 | `env.schema.ts`, `env.service.ts` |
| 2 | `schema.ts`, `types.ts`, `state-machine.ts`, `schemas.ts`, `response-dtos.ts` |
| 3 | `standup-write.repository.ts`, `standup-read.repository.ts`, `standup-helpers.ts` |
| 4 | `standup-notification.service.ts`, `standup-pipeline.service.ts` |
| 5 | `standup-status-sync.service.ts`, `discord-messages.service.ts`, `embeds.ts`, `publication/` |
| 6 | `delivery/retry-dm.service.ts`, `delivery/retry-dm.controller.ts` |
| 7 | Testes diversos |

## Pendencias a Verificar Antes de Executar

1. Verificar se `publication` context tem outras dependencias
2. Verificar se `send-to-discord` controller precisa ser removido
3. Verificar se hay alguma logica de `sentToDiscordAt` que precisa ser limpa
4. Verificar dashboard web para exibir novo estado `delivery_pending`
