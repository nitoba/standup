# TAS-18: Send to Discord Automation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Send to Discord" button in the standup detail page that sends approved standups to a Discord channel via an external headless browser automation server.

**Architecture:** New `send-to-discord/` subfolder in `contexts/standups/` with controller + service following the existing ApproveStandup pattern. HMAC-SHA256 signing in a pure utility function. Frontend adds button + mutation to existing detail page. New `sentToDiscordAt` DB column tracks send history.

**Tech Stack:** NestJS (controller/service/DI), Drizzle ORM (migration + schema), node:crypto (HMAC), Angular 21 (standalone components + signals), TanStack Query (mutations), Orval (API client gen), Zard UI (buttons + dialogs)

**Spec:** `docs/superpowers/specs/2026-03-20-send-to-discord-automation-design.md`

---

## File Structure

### New Files
| File | Responsibility |
|------|----------------|
| `apps/api/src/shared/utils/sign-webhook-payload.ts` | Pure HMAC-SHA256 signing function |
| `apps/api/src/shared/utils/sign-webhook-payload.spec.ts` | Tests for signing function |
| `apps/api/src/contexts/standups/send-to-discord/send-to-discord.service.ts` | Orchestrates: validate state → sign → fetch → update DB |
| `apps/api/src/contexts/standups/send-to-discord/send-to-discord.controller.ts` | HTTP endpoint POST /standups/:id/send-to-discord |
| `apps/api/src/contexts/standups/send-to-discord/send-to-discord.service.spec.ts` | Service unit tests |
| `apps/api/src/contexts/standups/send-to-discord/send-to-discord.controller.spec.ts` | Controller HTTP tests |
| Drizzle migration file (auto-generated) | `sent_to_discord_at` column |
| `apps/web/src/app/features/standup-detail/components/resend-confirm-dialog/resend-confirm-dialog.ts` | Confirmation dialog for re-sends |

### Modified Files
| File | Change |
|------|--------|
| `apps/api/src/shared/domain/types.ts:107-119` | Add `sentToDiscordAt: number \| null` to StandupRecord |
| `apps/api/src/platform/database/schema.ts:73-89` | Add `sentToDiscordAt` column |
| `apps/api/src/platform/database/repositories/standup.repository.ts:41-55` | Add field to `toRecord()` + new `updateSentToDiscordAt()` method |
| `apps/api/src/platform/env/env.schema.ts:3-34` | Add 4 automation env vars |
| `apps/api/src/platform/env/env.service.ts:5-80` | Add `automation` getter |
| `apps/api/src/shared/openapi/response-dtos.ts:21-56` | Add `sentToDiscordAt` to StandupRecordDto |
| `apps/api/src/contexts/standups/standups.module.ts:17-43` | Register new controller + service |
| `apps/api/src/contexts/standups/shared/format-standup-record.ts:4-13` | Pass through `sentToDiscordAt` (already works via spread, no change needed) |
| `apps/web/src/app/shared/models/standup-models.ts:133-147` | Add `sentToDiscordAt` to Standup interface |
| `apps/web/src/app/features/dashboard/services/standup-service.ts:377-390` | Map `sentToDiscordAt` in `mapStandup()` + add mutation |
| `apps/web/src/app/features/standup-detail/standup-detail-page.ts:169-214` | Add send button + dialog logic |

---

## Task 1: Database — Add `sentToDiscordAt` column

**Files:**
- Modify: `apps/api/src/shared/domain/types.ts:107-119`
- Modify: `apps/api/src/platform/database/schema.ts:73-89`
- Modify: `apps/api/src/platform/database/repositories/standup.repository.ts:41-55`
- Modify: `apps/api/src/shared/openapi/response-dtos.ts:21-56`
- Create: Drizzle migration (auto-generated)

- [ ] **Step 1: Add field to StandupRecord type**

In `apps/api/src/shared/domain/types.ts`, add `sentToDiscordAt` after `updatedAt` (line 118):

```ts
export interface StandupRecord {
  id: string
  date: string
  meetingType: string
  content: string
  sourceData: string
  customEntries: CustomEntries | null
  status: StandupStatus
  userId: string | null
  dmMessageId: string | null
  createdAt: number
  updatedAt: number
  sentToDiscordAt: number | null
}
```

- [ ] **Step 2: Add column to Drizzle schema**

In `apps/api/src/platform/database/schema.ts`, add after `updatedAt` (line 88):

```ts
sentToDiscordAt: integer('sent_to_discord_at'),
```

- [ ] **Step 3: Update `toRecord()` mapping**

In `apps/api/src/platform/database/repositories/standup.repository.ts`, add to `toRecord()` (line 53, after `updatedAt`):

```ts
sentToDiscordAt: row.sentToDiscordAt ?? null,
```

- [ ] **Step 4: Update OpenAPI response DTO**

In `apps/api/src/shared/openapi/response-dtos.ts`, add after `updatedAt` (line 55):

```ts
@ApiPropertyOptional({ nullable: true })
sentToDiscordAt!: number | null
```

- [ ] **Step 5: Generate Drizzle migration**

Run: `cd /Users/nitoba/Documents/standup && bun run drizzle-kit generate`

Expected: New migration file created in `drizzle/` directory with ALTER TABLE adding `sent_to_discord_at` column.

- [ ] **Step 6: Apply migration**

Run: `cd /Users/nitoba/Documents/standup && bun run drizzle-kit push`

Expected: Migration applied successfully.

- [ ] **Step 7: Verify typecheck passes**

Run: `cd /Users/nitoba/Documents/standup && bun run turbo run typecheck`

Expected: No type errors. All usages of StandupRecord now include `sentToDiscordAt`.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/shared/domain/types.ts apps/api/src/platform/database/schema.ts apps/api/src/platform/database/repositories/standup.repository.ts apps/api/src/shared/openapi/response-dtos.ts drizzle/
git commit -m "feat(db): add sentToDiscordAt column to standups table (TAS-18)"
```

---

## Task 2: Repository — Add `updateSentToDiscordAt()` method

**Files:**
- Modify: `apps/api/src/platform/database/repositories/standup.repository.ts`

- [ ] **Step 1: Add `updateSentToDiscordAt` method to StandupRepository**

Add this method to the `StandupRepository` class (after the existing `updateDmMessageId` or similar update method):

```ts
async updateSentToDiscordAt(
  id: string,
): Promise<Result<StandupRecord, NotFoundError | DbError>> {
  try {
    const now = Date.now()
    const rows = await this.db
      .update(standups)
      .set({ sentToDiscordAt: now, updatedAt: now })
      .where(eq(standups.id, id))
      .returning()

    if (rows.length === 0) {
      return Result.err(
        new NotFoundError({
          resource: 'standup',
          id,
          message: `Standup ${id} not found`,
        }),
      )
    }

    return Result.ok(toRecord(rows[0]))
  } catch (error) {
    return Result.err(
      new DbError({
        operation: 'updateSentToDiscordAt',
        message: error instanceof Error ? error.message : String(error),
      }),
    )
  }
}
```

- [ ] **Step 2: Write repository tests for `updateSentToDiscordAt`**

Add to the existing repository test file (find it via `standup.repository.spec.ts` or `standup.repository.test.ts`):

```ts
describe('updateSentToDiscordAt', () => {
  it('updates sentToDiscordAt and returns the record', async () => {
    // Create a standup first via repository.create(...)
    const created = await repository.create({ /* valid input */ })
    expect(created.isOk()).toBe(true)

    const result = await repository.updateSentToDiscordAt(created.value.id)

    expect(result.isOk()).toBe(true)
    expect(result.value.sentToDiscordAt).toBeTypeOf('number')
    expect(result.value.sentToDiscordAt).toBeGreaterThan(0)
  })

  it('returns NotFoundError for nonexistent id', async () => {
    const result = await repository.updateSentToDiscordAt('nonexistent-id')

    expect(result.isErr()).toBe(true)
    expect(result.error).toBeInstanceOf(NotFoundError)
  })
})
```

Adapt the test setup to match the existing test patterns in the file (in-memory DB, seeded data, etc.).

- [ ] **Step 3: Run tests to verify they pass**

Run: `cd /Users/nitoba/Documents/standup && bun run turbo run test --filter=@standup/api`

Expected: All tests pass including the 2 new ones.

- [ ] **Step 4: Verify typecheck passes**

Run: `cd /Users/nitoba/Documents/standup && bun run turbo run typecheck --filter=@standup/api`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/platform/database/repositories/standup.repository.ts apps/api/src/platform/database/repositories/standup.repository.spec.ts
git commit -m "feat(db): add updateSentToDiscordAt repository method with tests (TAS-18)"
```

---

## Task 3: Environment — Add automation env vars

**Files:**
- Modify: `apps/api/src/platform/env/env.schema.ts:3-34`
- Modify: `apps/api/src/platform/env/env.service.ts:5-80`

- [ ] **Step 1: Add env vars to schema**

In `apps/api/src/platform/env/env.schema.ts`, add before the closing `})` (after line 33, before line 34):

```ts
DISCORD_AUTOMATION_URL: z.string().url().optional(),
DISCORD_AUTOMATION_CHANNEL_URL: z.string().url().optional(),
DISCORD_AUTOMATION_WEBHOOK_SECRET: z.string().optional(),
DISCORD_SEND_TIMEOUT_MS: z.coerce.number().default(60000),
```

- [ ] **Step 2: Add `automation` getter to EnvService**

In `apps/api/src/platform/env/env.service.ts`, add a new getter before the generic `get()` method (before line 77):

```ts
get automation() {
  return {
    url: this.get('DISCORD_AUTOMATION_URL'),
    channelUrl: this.get('DISCORD_AUTOMATION_CHANNEL_URL'),
    webhookSecret: this.get('DISCORD_AUTOMATION_WEBHOOK_SECRET'),
    sendTimeoutMs: this.get('DISCORD_SEND_TIMEOUT_MS'),
  }
}
```

- [ ] **Step 3: Verify typecheck passes**

Run: `cd /Users/nitoba/Documents/standup && bun run turbo run typecheck --filter=@standup/api`

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/platform/env/env.schema.ts apps/api/src/platform/env/env.service.ts
git commit -m "feat(env): add discord automation env vars (TAS-18)"
```

---

## Task 4: HMAC Helper — `signWebhookPayload`

**Files:**
- Create: `apps/api/src/shared/utils/sign-webhook-payload.ts`
- Create: `apps/api/src/shared/utils/sign-webhook-payload.spec.ts`

- [ ] **Step 1: Write the failing tests**

Create `apps/api/src/shared/utils/sign-webhook-payload.spec.ts`:

```ts
import { createHmac } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { signWebhookPayload } from './sign-webhook-payload'

describe('signWebhookPayload', () => {
  it('returns header in format "timestamp,hmacHex"', () => {
    const result = signWebhookPayload('test-secret', '{"key":"value"}')

    expect(result.header).toMatch(/^\d+,[a-f0-9]{64}$/)
  })

  it('generates correct HMAC-SHA256 signature', () => {
    const now = 1710950400000
    vi.spyOn(Date, 'now').mockReturnValue(now)

    const secret = 'my-secret'
    const body = '{"channelUrl":"https://discord.com/channels/1/2","message":"hello"}'
    const result = signWebhookPayload(secret, body)

    const expectedPayload = `${now}.${body}`
    const expectedHmac = createHmac('sha256', secret)
      .update(expectedPayload)
      .digest('hex')

    expect(result.header).toBe(`${now},${expectedHmac}`)
    expect(result.timestamp).toBe(now.toString())

    vi.restoreAllMocks()
  })

  it('returns numeric timestamp string', () => {
    const result = signWebhookPayload('secret', 'body')

    expect(result.timestamp).toMatch(/^\d+$/)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/nitoba/Documents/standup && bun run vitest run apps/api/src/shared/utils/sign-webhook-payload.spec.ts`

Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

Create `apps/api/src/shared/utils/sign-webhook-payload.ts`:

```ts
import { createHmac } from 'node:crypto'

export function signWebhookPayload(
  secret: string,
  body: string,
): { header: string; timestamp: string } {
  const timestamp = Date.now().toString()
  const payload = `${timestamp}.${body}`
  const hmac = createHmac('sha256', secret).update(payload).digest('hex')

  return {
    header: `${timestamp},${hmac}`,
    timestamp,
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/nitoba/Documents/standup && bun run vitest run apps/api/src/shared/utils/sign-webhook-payload.spec.ts`

Expected: 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/shared/utils/sign-webhook-payload.ts apps/api/src/shared/utils/sign-webhook-payload.spec.ts
git commit -m "feat: add HMAC-SHA256 webhook signing utility (TAS-18)"
```

---

## Task 5: Backend Service — `SendToDiscordService`

**Files:**
- Create: `apps/api/src/contexts/standups/send-to-discord/send-to-discord.service.ts`
- Create: `apps/api/src/contexts/standups/send-to-discord/send-to-discord.service.spec.ts`

- [ ] **Step 1: Write the failing tests**

Create `apps/api/src/contexts/standups/send-to-discord/send-to-discord.service.spec.ts`:

```ts
import { NotFoundException, ServiceUnavailableException, ConflictException } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { StandupRepository } from '../../../platform/database/repositories/standup.repository'
import { EnvService } from '../../../platform/env/env.service'
import { LocalDateService } from '../../../platform/time/local-date.service'
import { UserSettingsRepository } from '../../../platform/database/repositories/user-settings.repository'
import { Result, NotFoundError, DbError } from '../../../shared/domain'
import type { StandupRecord } from '../../../shared/domain'
import { SendToDiscordService } from './send-to-discord.service'

const makeStandup = (overrides: Partial<StandupRecord> = {}): StandupRecord => ({
  id: 'standup-1',
  date: '2026-03-20',
  meetingType: 'daily',
  content: 'Test standup content',
  sourceData: '{}',
  customEntries: null,
  status: 'approved',
  userId: 'user-1',
  dmMessageId: null,
  createdAt: 1710950400000,
  updatedAt: 1710950400000,
  sentToDiscordAt: null,
  ...overrides,
})

const automationEnv = {
  url: 'http://host.docker.internal:4000',
  channelUrl: 'https://discord.com/channels/1/2',
  webhookSecret: 'test-secret',
  sendTimeoutMs: 60000,
}

describe('SendToDiscordService', () => {
  let service: SendToDiscordService
  let standupRepository: { findByIdForUser: ReturnType<typeof vi.fn>; updateSentToDiscordAt: ReturnType<typeof vi.fn> }
  let envService: { automation: typeof automationEnv }
  let localDateService: { formatIsoForTimezone: ReturnType<typeof vi.fn> }
  let userSettingsRepository: { findByUserId: ReturnType<typeof vi.fn> }

  beforeEach(async () => {
    standupRepository = {
      findByIdForUser: vi.fn(),
      updateSentToDiscordAt: vi.fn(),
    }
    envService = { automation: { ...automationEnv } }
    localDateService = { formatIsoForTimezone: vi.fn((date: string) => date) }
    userSettingsRepository = { findByUserId: vi.fn().mockResolvedValue(Result.ok(null)) }

    const module = await Test.createTestingModule({
      providers: [
        SendToDiscordService,
        { provide: StandupRepository, useValue: standupRepository },
        { provide: EnvService, useValue: envService },
        { provide: LocalDateService, useValue: localDateService },
        { provide: UserSettingsRepository, useValue: userSettingsRepository },
      ],
    }).compile()

    service = module.get(SendToDiscordService)
  })

  it('throws NotFoundException when standup not found', async () => {
    standupRepository.findByIdForUser.mockResolvedValue(
      Result.err(new NotFoundError({ resource: 'standup', id: 'x', message: 'not found' })),
    )

    await expect(service.send('user-1', 'x')).rejects.toThrow(NotFoundException)
  })

  it('throws ConflictException when standup status is draft', async () => {
    standupRepository.findByIdForUser.mockResolvedValue(
      Result.ok(makeStandup({ status: 'draft' })),
    )

    await expect(service.send('user-1', 'standup-1')).rejects.toThrow(ConflictException)
  })

  it('throws ConflictException when standup status is pending_review', async () => {
    standupRepository.findByIdForUser.mockResolvedValue(
      Result.ok(makeStandup({ status: 'pending_review' })),
    )

    await expect(service.send('user-1', 'standup-1')).rejects.toThrow(ConflictException)
  })

  it('throws ConflictException when standup status is rejected', async () => {
    standupRepository.findByIdForUser.mockResolvedValue(
      Result.ok(makeStandup({ status: 'rejected' })),
    )

    await expect(service.send('user-1', 'standup-1')).rejects.toThrow(ConflictException)
  })

  it('throws ServiceUnavailableException when automation URL is not configured', async () => {
    standupRepository.findByIdForUser.mockResolvedValue(Result.ok(makeStandup()))
    envService.automation = { ...automationEnv, url: undefined as unknown as string }

    await expect(service.send('user-1', 'standup-1')).rejects.toThrow(ServiceUnavailableException)
  })

  it('throws ServiceUnavailableException when fetch fails (network error)', async () => {
    standupRepository.findByIdForUser.mockResolvedValue(Result.ok(makeStandup()))
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('fetch failed'))

    await expect(service.send('user-1', 'standup-1')).rejects.toThrow(ServiceUnavailableException)

    vi.restoreAllMocks()
  })

  it('throws ServiceUnavailableException when fetch times out', async () => {
    standupRepository.findByIdForUser.mockResolvedValue(Result.ok(makeStandup()))
    const abortError = new DOMException('The operation was aborted', 'AbortError')
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(abortError)

    await expect(service.send('user-1', 'standup-1')).rejects.toThrow(ServiceUnavailableException)

    vi.restoreAllMocks()
  })

  it('throws ServiceUnavailableException when automate returns non-200', async () => {
    standupRepository.findByIdForUser.mockResolvedValue(Result.ok(makeStandup()))
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: 'bad' }), { status: 500 }),
    )

    await expect(service.send('user-1', 'standup-1')).rejects.toThrow(ServiceUnavailableException)

    vi.restoreAllMocks()
  })

  it('updates sentToDiscordAt and returns formatted record on success', async () => {
    const standup = makeStandup()
    const updatedStandup = makeStandup({ sentToDiscordAt: 1710950500000 })
    standupRepository.findByIdForUser.mockResolvedValue(Result.ok(standup))
    standupRepository.updateSentToDiscordAt.mockResolvedValue(Result.ok(updatedStandup))
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    )

    const result = await service.send('user-1', 'standup-1')

    expect(standupRepository.updateSentToDiscordAt).toHaveBeenCalledWith('standup-1')
    expect(result.sentToDiscordAt).toBe(1710950500000)

    vi.restoreAllMocks()
  })

  it('works for published standups', async () => {
    const standup = makeStandup({ status: 'published' })
    const updatedStandup = makeStandup({ status: 'published', sentToDiscordAt: 1710950500000 })
    standupRepository.findByIdForUser.mockResolvedValue(Result.ok(standup))
    standupRepository.updateSentToDiscordAt.mockResolvedValue(Result.ok(updatedStandup))
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    )

    const result = await service.send('user-1', 'standup-1')

    expect(result.sentToDiscordAt).toBe(1710950500000)

    vi.restoreAllMocks()
  })

  it('allows re-send (updates sentToDiscordAt again)', async () => {
    const standup = makeStandup({ sentToDiscordAt: 1710950400000 })
    const updatedStandup = makeStandup({ sentToDiscordAt: 1710950500000 })
    standupRepository.findByIdForUser.mockResolvedValue(Result.ok(standup))
    standupRepository.updateSentToDiscordAt.mockResolvedValue(Result.ok(updatedStandup))
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    )

    const result = await service.send('user-1', 'standup-1')

    expect(result.sentToDiscordAt).toBe(1710950500000)

    vi.restoreAllMocks()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/nitoba/Documents/standup && bun run vitest run apps/api/src/contexts/standups/send-to-discord/send-to-discord.service.spec.ts`

Expected: FAIL — module not found.

- [ ] **Step 3: Write the service implementation**

Create `apps/api/src/contexts/standups/send-to-discord/send-to-discord.service.ts`:

```ts
import { Injectable } from '@nestjs/common'
import { StandupRepository } from '../../../platform/database/repositories/standup.repository'
import { UserSettingsRepository } from '../../../platform/database/repositories/user-settings.repository'
import { EnvService } from '../../../platform/env/env.service'
import { LocalDateService } from '../../../platform/time/local-date.service'
import { ExternalServiceError, InvalidStateTransitionError } from '../../../shared/domain'
import { signWebhookPayload } from '../../../shared/utils/sign-webhook-payload'
import { formatStandupRecord } from '../shared/format-standup-record'
import { throwStandupHttpError } from '../shared/throw-standup-http-error'

const ALLOWED_STATES = new Set(['approved', 'published'])

@Injectable()
export class SendToDiscordService {
  constructor(
    private readonly standupRepository: StandupRepository,
    private readonly envService: EnvService,
    private readonly localDateService: LocalDateService,
    private readonly userSettingsRepository: UserSettingsRepository,
  ) {}

  async send(userId: string, standupId: string) {
    const found = await this.standupRepository.findByIdForUser(standupId, userId)
    if (found.isErr()) {
      throwStandupHttpError(found.error)
    }

    const standup = found.value
    if (!ALLOWED_STATES.has(standup.status)) {
      throwStandupHttpError(
        new InvalidStateTransitionError({
          from: standup.status,
          to: 'send_to_discord',
        }),
      )
    }

    const { url, channelUrl, webhookSecret, sendTimeoutMs } = this.envService.automation
    if (!url || !channelUrl || !webhookSecret) {
      throwStandupHttpError(
        new ExternalServiceError({
          service: 'discord-automation',
          message: 'Discord automation is not configured. Set DISCORD_AUTOMATION_URL, DISCORD_AUTOMATION_CHANNEL_URL, and DISCORD_AUTOMATION_WEBHOOK_SECRET.',
        }),
      )
    }

    const body = JSON.stringify({ channelUrl, message: standup.content })
    const { header } = signWebhookPayload(webhookSecret, body)

    let response: Response
    try {
      response = await fetch(`${url}/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-webhook-signature': header,
        },
        body,
        signal: AbortSignal.timeout(sendTimeoutMs),
      })
    } catch (error) {
      const message =
        error instanceof TypeError
          ? `Network error connecting to automation server: ${error.message}`
          : `Request to automation server timed out after ${sendTimeoutMs}ms`

      throwStandupHttpError(
        new ExternalServiceError({
          service: 'discord-automation',
          message,
        }),
      )
    }

    if (!response.ok) {
      const detail = await response.text().catch(() => 'unknown error')
      throwStandupHttpError(
        new ExternalServiceError({
          service: 'discord-automation',
          message: `Automation server returned ${response.status}: ${detail}`,
        }),
      )
    }

    const updated = await this.standupRepository.updateSentToDiscordAt(standupId)
    if (updated.isErr()) {
      throwStandupHttpError(updated.error)
    }

    return formatStandupRecord(
      updated.value,
      this.localDateService,
      await this.resolveTimezone(userId),
    )
  }

  private async resolveTimezone(userId: string): Promise<string> {
    const settingsResult = await this.userSettingsRepository.findByUserId(userId)
    if (settingsResult.isOk() && settingsResult.value?.timezone) {
      return settingsResult.value.timezone
    }
    return 'America/Sao_Paulo'
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/nitoba/Documents/standup && bun run vitest run apps/api/src/contexts/standups/send-to-discord/send-to-discord.service.spec.ts`

Expected: All 10 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/contexts/standups/send-to-discord/send-to-discord.service.ts apps/api/src/contexts/standups/send-to-discord/send-to-discord.service.spec.ts
git commit -m "feat: add SendToDiscordService with tests (TAS-18)"
```

---

## Task 6: Backend Controller — `SendToDiscordController`

**Files:**
- Create: `apps/api/src/contexts/standups/send-to-discord/send-to-discord.controller.ts`
- Create: `apps/api/src/contexts/standups/send-to-discord/send-to-discord.controller.spec.ts`
- Modify: `apps/api/src/contexts/standups/standups.module.ts:17-43`

- [ ] **Step 1: Write the controller**

Create `apps/api/src/contexts/standups/send-to-discord/send-to-discord.controller.ts`:

```ts
import { Controller, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common'
import {
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger'
import { Session } from '@thallesp/nestjs-better-auth'
import type { AuthSession } from '../../../shared/auth/auth-session'
import { requireSessionUserId } from '../../../shared/auth/require-session-user-id'
import { StandupDetailResponseDto } from '../../../shared/openapi/response-dtos'
import { SendToDiscordService } from './send-to-discord.service'

@ApiTags('standups')
@Controller('standups')
export class SendToDiscordController {
  constructor(private readonly sendToDiscord: SendToDiscordService) {}

  @Post(':id/send-to-discord')
  @HttpCode(200)
  @ApiOperation({
    operationId: 'sendToDiscord',
    summary: 'Envia standup aprovado para o Discord via automacao',
  })
  @ApiParam({ name: 'id', type: String, format: 'uuid' })
  @ApiOkResponse({
    description: 'Standup enviado com sucesso.',
    type: StandupDetailResponseDto,
  })
  async send(
    @Session() session: AuthSession | null,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const userId = requireSessionUserId(session)

    return {
      data: await this.sendToDiscord.send(userId, id),
    }
  }
}
```

- [ ] **Step 2: Register in StandupsModule**

In `apps/api/src/contexts/standups/standups.module.ts`, add imports and register:

Add to imports at top:
```ts
import { SendToDiscordController } from './send-to-discord/send-to-discord.controller'
import { SendToDiscordService } from './send-to-discord/send-to-discord.service'
```

Add `SendToDiscordController` to the `controllers` array (after `ApproveStandupController`).
Add `SendToDiscordService` to the `providers` array (after `ApproveStandupService`).

- [ ] **Step 3: Write controller tests**

Create `apps/api/src/contexts/standups/send-to-discord/send-to-discord.controller.spec.ts`:

```ts
import { ConflictException, NotFoundException, ServiceUnavailableException } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { SendToDiscordController } from './send-to-discord.controller'
import { SendToDiscordService } from './send-to-discord.service'
import type { StandupRecord } from '../../../shared/domain'

const mockRecord: StandupRecord = {
  id: 'standup-1',
  date: '20/03/2026',
  meetingType: 'daily',
  content: 'Test content',
  sourceData: '{}',
  customEntries: null,
  status: 'approved',
  userId: 'user-1',
  dmMessageId: null,
  createdAt: 1710950400000,
  updatedAt: 1710950400000,
  sentToDiscordAt: 1710950500000,
}

describe('SendToDiscordController', () => {
  let controller: SendToDiscordController
  let service: { send: ReturnType<typeof vi.fn> }

  beforeEach(async () => {
    service = { send: vi.fn() }

    const module = await Test.createTestingModule({
      controllers: [SendToDiscordController],
      providers: [{ provide: SendToDiscordService, useValue: service }],
    }).compile()

    controller = module.get(SendToDiscordController)
  })

  it('returns 200 with { data: record } on success', async () => {
    service.send.mockResolvedValue(mockRecord)

    const result = await controller.send(
      { session: { userId: 'user-1' } } as any,
      'standup-1',
    )

    expect(result).toEqual({ data: mockRecord })
    expect(service.send).toHaveBeenCalledWith('user-1', 'standup-1')
  })

  it('propagates NotFoundException from service', async () => {
    service.send.mockRejectedValue(new NotFoundException('not found'))

    await expect(
      controller.send({ session: { userId: 'user-1' } } as any, 'x'),
    ).rejects.toThrow(NotFoundException)
  })

  it('propagates ConflictException from service', async () => {
    service.send.mockRejectedValue(new ConflictException('invalid state'))

    await expect(
      controller.send({ session: { userId: 'user-1' } } as any, 'standup-1'),
    ).rejects.toThrow(ConflictException)
  })

  it('propagates ServiceUnavailableException from service', async () => {
    service.send.mockRejectedValue(new ServiceUnavailableException('offline'))

    await expect(
      controller.send({ session: { userId: 'user-1' } } as any, 'standup-1'),
    ).rejects.toThrow(ServiceUnavailableException)
  })
})
```

- [ ] **Step 4: Run all tests**

Run: `cd /Users/nitoba/Documents/standup && bun run vitest run apps/api/src/contexts/standups/send-to-discord/`

Expected: All tests PASS (service + controller specs).

- [ ] **Step 5: Verify full API typecheck**

Run: `cd /Users/nitoba/Documents/standup && bun run turbo run typecheck --filter=@standup/api`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/contexts/standups/send-to-discord/send-to-discord.controller.ts apps/api/src/contexts/standups/send-to-discord/send-to-discord.controller.spec.ts apps/api/src/contexts/standups/standups.module.ts
git commit -m "feat: add SendToDiscordController with tests (TAS-18)"
```

---

## Task 7: Generate OpenAPI spec + Orval client

**Files:**
- Auto-generated: OpenAPI JSON spec
- Auto-generated: `apps/web/src/app/api/endpoints/standups/standups.ts`

- [ ] **Step 1: Start the API server to generate fresh OpenAPI spec**

Run: `cd /Users/nitoba/Documents/standup && bun run turbo run build --filter=@standup/api`

Note: Check how the project generates the OpenAPI JSON — it may be via `swagger-spec` script or by starting the server. Look for scripts in `apps/api/package.json`.

- [ ] **Step 2: Regenerate Orval client**

Run: `cd /Users/nitoba/Documents/standup/apps/web && bun run orval`

Expected: New `sendToDiscord` function generated in `apps/web/src/app/api/endpoints/standups/standups.ts`.

- [ ] **Step 3: Verify the generated function exists**

Check that `apps/web/src/app/api/endpoints/standups/standups.ts` now exports `sendToDiscord`.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/api/
git commit -m "chore: regenerate Orval client with sendToDiscord endpoint (TAS-18)"
```

---

## Task 8: Frontend — Update models and service

**Files:**
- Modify: `apps/web/src/app/shared/models/standup-models.ts:133-147`
- Modify: `apps/web/src/app/features/dashboard/services/standup-service.ts:377-390`

- [ ] **Step 1: Add `sentToDiscordAt` to Standup interface**

In `apps/web/src/app/shared/models/standup-models.ts`, add after `sources` (line 146):

```ts
sentToDiscordAt?: number | null
```

- [ ] **Step 2: Update `mapStandup()` to propagate field**

In `apps/web/src/app/features/dashboard/services/standup-service.ts`, in the `mapStandup` method (line ~389), add:

```ts
sentToDiscordAt: dto.sentToDiscordAt ?? null,
```

- [ ] **Step 3: Add `sendToDiscord` mutation to StandupService**

In `apps/web/src/app/features/dashboard/services/standup-service.ts`, add a new private mutation (near the other mutations like `approveMutation`):

```ts
private readonly sendToDiscordMutation = injectMutation(() => ({
  mutationKey: ['sendToDiscord'],
  mutationFn: async (vars: { id: string }) => {
    return sendToDiscord(this.http, vars.id)
  },
  onSuccess: () => {
    const id = this.selectedStandupId()
    if (id) {
      this.queryClient.invalidateQueries({ queryKey: getGetStandupByIdQueryKey(id) })
    }
    this.queryClient.invalidateQueries({ queryKey: getListStandupsQueryKey() })
  },
}))
```

Add the import for `sendToDiscord` from the Orval-generated client at the top of the file.

Add a public method:

```ts
sendToDiscord(id: string) {
  return this.sendToDiscordMutation.mutateAsync({ id })
}
```

- [ ] **Step 4: Verify typecheck**

Run: `cd /Users/nitoba/Documents/standup && bun run turbo run typecheck --filter=@standup/web`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/shared/models/standup-models.ts apps/web/src/app/features/dashboard/services/standup-service.ts
git commit -m "feat(web): add sendToDiscord mutation and model field (TAS-18)"
```

---

## Task 9: Frontend — Resend confirmation dialog

**Files:**
- Create: `apps/web/src/app/features/standup-detail/components/resend-confirm-dialog/resend-confirm-dialog.ts`

- [ ] **Step 1: Create the dialog component**

Create `apps/web/src/app/features/standup-detail/components/resend-confirm-dialog/resend-confirm-dialog.ts`:

```ts
import { Component, inject } from '@angular/core'
import {
  Z_MODAL_DATA,
  ZardDialogRef,
} from '../../../../shared/components/dialog'
import { ZardButtonComponent } from '../../../../shared/components/button/button.component'

interface ResendDialogData {
  sentAt: string
  onConfirm: () => void
}

@Component({
  selector: 'app-resend-confirm-dialog',
  standalone: true,
  imports: [ZardButtonComponent],
  template: `
    <div class="flex flex-col gap-4 p-4">
      <p class="text-sm text-muted-foreground font-[var(--font-ibm)]">
        Standup já enviado em {{ data.sentAt }}. Deseja enviar novamente?
      </p>
      <div class="flex flex-col-reverse gap-[12px] md:flex-row md:justify-end pt-[4px]">
        <button type="button" z-button zType="outline" class="md:min-w-[140px]" (click)="onCancel()">
          $ cancelar
        </button>
        <button type="button" z-button zType="default" class="md:min-w-[180px]" (click)="onConfirm()">
          $ enviar novamente
        </button>
      </div>
    </div>
  `,
})
export class ResendConfirmDialog {
  private readonly dialogRef = inject(ZardDialogRef<ResendConfirmDialog>)
  readonly data = inject<ResendDialogData>(Z_MODAL_DATA)

  onCancel() {
    this.dialogRef.close()
  }

  onConfirm() {
    this.data.onConfirm()
    this.dialogRef.close()
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/app/features/standup-detail/components/resend-confirm-dialog/
git commit -m "feat(web): add resend confirmation dialog component (TAS-18)"
```

---

## Task 10: Frontend — Add button to detail page

**Files:**
- Modify: `apps/web/src/app/features/standup-detail/standup-detail-page.ts:169-214`

- [ ] **Step 1: Add the "Enviar para Discord" button to the template**

In `apps/web/src/app/features/standup-detail/standup-detail-page.ts`, in the button area (after line 213, before the closing `</div>` on line 214), add:

```html
@if (isApproved(detail.status)) {
  <button
    type="button"
    z-button
    zType="default"
    class="w-full md:w-auto"
    [zDisabled]="actionLoading()"
    (click)="handleSendToDiscord(detail)"
  >
    <z-icon zType="send" zSize="sm" class="mr-2" />
    {{ detail.sentToDiscordAt ? 'Reenviar para Discord' : 'Enviar para Discord' }}
  </button>
}
```

- [ ] **Step 2: Add the helper methods and computed signals**

In the component class, add:

```ts
isApproved(status: string): boolean {
  return status === 'approved'
}

handleSendToDiscord(detail: Standup) {
  if (detail.sentToDiscordAt) {
    const sentDate = formatTimestampPtBr(detail.sentToDiscordAt)
    this.dialogService.create({
      zTitle: '// reenviar para discord',
      zContent: ResendConfirmDialog,
      zHideFooter: true,
      zData: {
        sentAt: sentDate,
        onConfirm: () => this.executeSendToDiscord(detail.id),
      },
    })
  } else {
    void this.executeSendToDiscord(detail.id)
  }
}

private async executeSendToDiscord(id: string) {
  this.actionLoading.set(true)
  try {
    await this.standupService.sendToDiscord(id)
    toast.success('Standup enviado para o Discord')
  } catch {
    toast.error('Falha ao enviar para o Discord')
  } finally {
    this.actionLoading.set(false)
  }
}
```

This uses the existing `actionLoading` signal pattern (same as approve/reject).

Add necessary imports at the top:
- `ResendConfirmDialog` from the dialog component
- `toast` from `ngx-sonner`
- `formatTimestampPtBr` from utils
- `ZardIconComponent` if not already imported (add to `imports` array)

- [ ] **Step 3: Verify typecheck**

Run: `cd /Users/nitoba/Documents/standup && bun run turbo run typecheck --filter=@standup/web`

Expected: PASS

- [ ] **Step 4: Manual test in browser**

1. Start the dev server: `cd /Users/nitoba/Documents/standup && bun run dev`
2. Navigate to a standup in `approved` status
3. Verify the "Enviar para Discord" button is visible
4. Verify button is NOT visible for `pending_review`, `draft`, or `rejected` standups

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/features/standup-detail/standup-detail-page.ts
git commit -m "feat(web): add send-to-discord button in standup detail page (TAS-18)"
```

---

## Task 11: Integration verification

- [ ] **Step 1: Run full CI check**

Run: `cd /Users/nitoba/Documents/standup && bun run ci`

Expected: All tasks pass (lint + typecheck + test across all packages/apps).

- [ ] **Step 2: Fix any issues found**

If any lint/type/test errors, fix them before committing.

- [ ] **Step 3: Final commit if needed**

```bash
git add -A
git commit -m "fix: address CI issues for TAS-18"
```
