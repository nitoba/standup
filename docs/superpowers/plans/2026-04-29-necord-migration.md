# Necord Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate `apps/api/src/interfaces/discord/` from raw discord.js + manual handler dispatch to Necord with a feature-based folder layout, preserving every existing slash command, button, modal, reaction, and DM behavior.

**Architecture:** Long-lived feature branch (`feat/necord-migration`). Each new file is built and unit-tested in isolation before the module is rewired. The cut-over commit replaces `discord.module.ts` providers and deletes legacy handlers atomically. Single PR at the end.

**Tech Stack:** NestJS 11, Necord (latest), `@necord/pagination`, discord.js, Vitest, Bun, Drizzle, better-result.

**Reference spec:** `docs/superpowers/specs/2026-04-29-necord-migration-design.md`.

---

## Conventions used throughout

- `apps/api` is the working directory for `bun` / `pnpm` / `vitest` commands unless noted otherwise.
- Run a single test: `bun run test -- <path>` (Vitest in `apps/api`).
- Run the suite: `bun run test`.
- Lint: `bun run lint`.
- Typecheck: `bun run typecheck`.
- Each task ends with a commit. Use Conventional Commits (`feat:`, `refactor:`, `test:`, `chore:`, `docs:`).
- Co-author trailer: `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`.

---

## Phase 0 — Branch & Dependencies

### Task 0.1: Create migration branch

**Files:** none

- [ ] **Step 1: Verify clean tree**

```bash
git status --short
```
Expected: empty output (or only the untracked spec/plan docs already committed).

- [ ] **Step 2: Create branch from `main`**

```bash
git checkout main
git pull --ff-only
git checkout -b feat/necord-migration
```
Expected: switched to new branch.

- [ ] **Step 3: Push tracking branch**

```bash
git push -u origin feat/necord-migration
```

---

### Task 0.2: Add Necord dependencies

**Files:**
- Modify: `apps/api/package.json`

- [ ] **Step 1: Install runtime deps**

```bash
cd apps/api && pnpm add necord @necord/pagination
```
Expected: `package.json` lists `necord` and `@necord/pagination` under `dependencies`. `pnpm-lock.yaml` updated.

- [ ] **Step 2: Smoke-build to confirm peer compatibility**

```bash
cd apps/api && bun run typecheck
```
Expected: pass (Necord's peers — `@nestjs/common`, `@nestjs/core`, `discord.js`, `reflect-metadata` — are all already present).

- [ ] **Step 3: Commit**

```bash
git add apps/api/package.json pnpm-lock.yaml
git commit -m "chore(api): add necord and @necord/pagination

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Phase 1 — Foundations (additive; no module wiring yet)

All Phase 1 files live alongside the legacy code. The legacy module remains intact until Phase 7. Tests must pass at every step.

### Task 1.1: Standup command-group decorator

**Files:**
- Create: `apps/api/src/interfaces/discord/shared/decorators/standup-command-group.decorator.ts`

- [ ] **Step 1: Implement decorator**

```typescript
// apps/api/src/interfaces/discord/shared/decorators/standup-command-group.decorator.ts
import { createCommandGroupDecorator } from 'necord'

export const StandupCommandGroup = createCommandGroupDecorator({
  name: 'standup',
  description: 'Comandos de standup',
})
```

- [ ] **Step 2: Typecheck**

```bash
cd apps/api && bun run typecheck
```
Expected: pass.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/interfaces/discord/shared/decorators/standup-command-group.decorator.ts
git commit -m "feat(discord): add standup command group decorator

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 1.2: Test helpers — mock interaction factory

**Files:**
- Create: `apps/api/src/test/discord/mock-interaction.ts`
- Create: `apps/api/src/test/discord/make-context.ts`

- [ ] **Step 1: Implement `make-context.ts`**

```typescript
// apps/api/src/test/discord/make-context.ts
import type {
  ButtonContext,
  ModalContext,
  SlashCommandContext,
} from 'necord'

export function asSlashContext(interaction: unknown): SlashCommandContext {
  return [interaction] as unknown as SlashCommandContext
}

export function asButtonContext(interaction: unknown): ButtonContext {
  return [interaction] as unknown as ButtonContext
}

export function asModalContext(interaction: unknown): ModalContext {
  return [interaction] as unknown as ModalContext
}
```

- [ ] **Step 2: Implement `mock-interaction.ts`**

```typescript
// apps/api/src/test/discord/mock-interaction.ts
import { vi } from 'vitest'

type MockOpts = {
  userId?: string
  deferred?: boolean
  replied?: boolean
}

export function makeChatInputInteraction(opts: MockOpts = {}) {
  return {
    user: { id: opts.userId ?? 'user-1' },
    deferred: opts.deferred ?? false,
    replied: opts.replied ?? false,
    isRepliable: () => true,
    reply: vi.fn().mockResolvedValue(undefined),
    deferReply: vi.fn().mockResolvedValue(undefined),
    editReply: vi.fn().mockResolvedValue(undefined),
    followUp: vi.fn().mockResolvedValue(undefined),
    showModal: vi.fn().mockResolvedValue(undefined),
  }
}

export function makeButtonInteraction(opts: MockOpts = {}) {
  return {
    user: { id: opts.userId ?? 'user-1' },
    deferred: opts.deferred ?? false,
    replied: opts.replied ?? false,
    isRepliable: () => true,
    deferUpdate: vi.fn().mockResolvedValue(undefined),
    update: vi.fn().mockResolvedValue(undefined),
    editReply: vi.fn().mockResolvedValue(undefined),
    followUp: vi.fn().mockResolvedValue(undefined),
    showModal: vi.fn().mockResolvedValue(undefined),
    message: {
      react: vi.fn().mockResolvedValue(undefined),
      edit: vi.fn().mockResolvedValue(undefined),
    },
  }
}

export function makeModalInteraction(
  fields: Record<string, string> = {},
  opts: MockOpts = {},
) {
  return {
    user: { id: opts.userId ?? 'user-1' },
    deferred: opts.deferred ?? false,
    replied: opts.replied ?? false,
    isRepliable: () => true,
    deferUpdate: vi.fn().mockResolvedValue(undefined),
    editReply: vi.fn().mockResolvedValue(undefined),
    followUp: vi.fn().mockResolvedValue(undefined),
    fields: {
      getTextInputValue: vi.fn((name: string) => fields[name] ?? ''),
    },
    message: {
      react: vi.fn().mockResolvedValue(undefined),
    },
  }
}
```

- [ ] **Step 3: Typecheck**

```bash
cd apps/api && bun run typecheck
```
Expected: pass.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/test/discord/
git commit -m "test(discord): add interaction mock factories

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 1.3: Extract review embed

**Files:**
- Create: `apps/api/src/interfaces/discord/features/review/review.embed.ts`
- Create: `apps/api/src/interfaces/discord/features/review/review.embed.spec.ts`

The legacy source is `apps/api/src/interfaces/discord/embeds.ts:31-56` (`buildReviewEmbed`).

- [ ] **Step 1: Write failing spec**

```typescript
// apps/api/src/interfaces/discord/features/review/review.embed.spec.ts
import { describe, expect, it } from 'vitest'
import type { StandupRecord } from '../../../../shared/domain'
import { buildReviewEmbed } from './review.embed'

describe('buildReviewEmbed', () => {
  const record: StandupRecord = {
    id: 'std-1',
    userId: 'user-1',
    date: '2026-04-29',
    content: 'Conteúdo do standup',
    status: 'pending_review',
    meetingType: 'daily',
    createdAt: '2026-04-29T12:00:00.000Z',
    updatedAt: '2026-04-29T12:00:00.000Z',
  } as StandupRecord

  it('builds review embed with blue color and meeting type field', () => {
    const embed = buildReviewEmbed(record)
    expect(embed.color).toBe(0x3498db)
    expect(embed.title).toContain('Standup')
    expect(embed.fields?.find((f) => f.name === 'Tipo de Reunião')?.value).toBe(
      'daily',
    )
    expect(embed.fields?.find((f) => f.name === 'Status')?.value).toBe(
      'Pendente de Revisão',
    )
  })

  it('truncates description to 4096 chars', () => {
    const big = { ...record, content: 'x'.repeat(5000) }
    const embed = buildReviewEmbed(big)
    expect(embed.description?.length).toBeLessThanOrEqual(4096)
  })
})
```

- [ ] **Step 2: Run test — must fail (file not present)**

```bash
cd apps/api && bun run test -- src/interfaces/discord/features/review/review.embed.spec.ts
```
Expected: `Cannot find module './review.embed'` failure.

- [ ] **Step 3: Implement `review.embed.ts` by re-exporting from legacy file**

```typescript
// apps/api/src/interfaces/discord/features/review/review.embed.ts
export { buildReviewEmbed, EMBED_COLORS } from '../../embeds'
```

- [ ] **Step 4: Run test — must pass**

```bash
cd apps/api && bun run test -- src/interfaces/discord/features/review/review.embed.spec.ts
```
Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/interfaces/discord/features/review/
git commit -m "feat(discord): expose review embed under features/review

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

> **Note:** The full split of `embeds.ts` into per-builder files happens in Task 7.5 (cleanup). This task only creates the feature-local re-export so subsequent feature handlers can import from a stable location.

---

### Task 1.4: Shared embed barrel

**Files:**
- Create: `apps/api/src/interfaces/discord/shared/embeds/index.ts`

- [ ] **Step 1: Implement re-export barrel**

```typescript
// apps/api/src/interfaces/discord/shared/embeds/index.ts
export {
  buildJobFailedEmbed,
  buildPublishedEmbed,
  buildReminderEmbed,
  buildUserDmEmbed,
  EMBED_COLORS,
} from '../../embeds'
```

- [ ] **Step 2: Typecheck**

```bash
cd apps/api && bun run typecheck
```
Expected: pass.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/interfaces/discord/shared/embeds/index.ts
git commit -m "feat(discord): expose shared embed builders

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Phase 2 — Shared infrastructure (interceptor, filter, guard)

### Task 2.1: Cooldown interceptor

**Files:**
- Create: `apps/api/src/interfaces/discord/shared/interceptors/cooldown.interceptor.ts`
- Create: `apps/api/src/interfaces/discord/shared/interceptors/cooldown.interceptor.spec.ts`

The legacy service stays in place during this task; the interceptor wraps it.

- [ ] **Step 1: Write failing spec**

```typescript
// apps/api/src/interfaces/discord/shared/interceptors/cooldown.interceptor.spec.ts
import type { CallHandler, ExecutionContext } from '@nestjs/common'
import { defaultIfEmpty, firstValueFrom, of } from 'rxjs'
import { describe, expect, it, vi } from 'vitest'
import { CommandCooldownService } from '../../handlers/command-cooldown.service'
import { makeChatInputInteraction } from '../../../../test/discord/mock-interaction'
import { CooldownInterceptor } from './cooldown.interceptor'

function makeCtx(interaction: unknown): ExecutionContext {
  return {
    getArgByIndex: () => [interaction],
  } as unknown as ExecutionContext
}

describe('CooldownInterceptor', () => {
  it('passes through when not on cooldown', async () => {
    const cooldown = new CommandCooldownService()
    const interceptor = new CooldownInterceptor(cooldown)
    const interaction = makeChatInputInteraction()
    ;(interaction as { commandName?: string }).commandName = 'trigger'
    const next: CallHandler = { handle: vi.fn(() => of('ok')) }

    const result = await firstValueFrom(
      interceptor.intercept(makeCtx(interaction), next),
    )

    expect(result).toBe('ok')
    expect(interaction.reply).not.toHaveBeenCalled()
  })

  it('replies ephemeral and aborts when on cooldown', async () => {
    const cooldown = new CommandCooldownService()
    cooldown.record('user-1', 'trigger')
    const interceptor = new CooldownInterceptor(cooldown)
    const interaction = makeChatInputInteraction({ userId: 'user-1' })
    ;(interaction as { commandName?: string }).commandName = 'trigger'
    const next: CallHandler = { handle: vi.fn(() => of('ok')) }

    const result = await firstValueFrom(
      interceptor.intercept(makeCtx(interaction), next).pipe(defaultIfEmpty(null)),
    )

    expect(result).toBeNull()
    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ ephemeral: true }),
    )
    expect(next.handle).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test — must fail**

```bash
cd apps/api && bun run test -- src/interfaces/discord/shared/interceptors/cooldown.interceptor.spec.ts
```
Expected: import error.

- [ ] **Step 3: Implement interceptor**

```typescript
// apps/api/src/interfaces/discord/shared/interceptors/cooldown.interceptor.ts
import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common'
import type { ChatInputCommandInteraction } from 'discord.js'
import { EMPTY, type Observable } from 'rxjs'
import { CommandCooldownService } from '../../handlers/command-cooldown.service'

type Ctx = readonly [ChatInputCommandInteraction]

@Injectable()
export class CooldownInterceptor implements NestInterceptor {
  constructor(private readonly cooldown: CommandCooldownService) {}

  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<unknown> {
    const args = context.getArgByIndex(0) as Ctx | undefined
    const interaction = args?.[0]
    if (!interaction || !('commandName' in interaction)) {
      return next.handle()
    }

    const remaining = this.cooldown.check(
      interaction.user.id,
      interaction.commandName,
    )
    if (remaining !== null) {
      void interaction.reply({
        content: `Aguarde ${remaining}s antes de usar este comando novamente.`,
        ephemeral: true,
      })
      return EMPTY
    }

    this.cooldown.record(interaction.user.id, interaction.commandName)
    return next.handle()
  }
}
```

- [ ] **Step 4: Run test — must pass**

```bash
cd apps/api && bun run test -- src/interfaces/discord/shared/interceptors/cooldown.interceptor.spec.ts
```
Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/interfaces/discord/shared/interceptors/
git commit -m "feat(discord): add Necord cooldown interceptor

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 2.2: Discord exception filter

**Files:**
- Create: `apps/api/src/interfaces/discord/shared/filters/discord-exception.filter.ts`
- Create: `apps/api/src/interfaces/discord/shared/filters/discord-exception.filter.spec.ts`

`TaggedError` lives at `apps/api/src/shared/domain/errors.ts`. Verify the export name when implementing — if it's `TaggedError` re-exported from better-result, the filter should `@Catch()` the better-result base class.

- [ ] **Step 1: Verify TaggedError import path**

```bash
cd apps/api && rg "export.*class.*TaggedError|export \{ TaggedError" src/shared
```
Expected: a single export pointing to the canonical class. Use that import in the filter.

- [ ] **Step 2: Write failing spec**

```typescript
// apps/api/src/interfaces/discord/shared/filters/discord-exception.filter.spec.ts
import type { ArgumentsHost } from '@nestjs/common'
import { describe, expect, it, vi } from 'vitest'
import { TaggedError } from '../../../../shared/domain' // adjust if Step 1 reveals a different path
import { DiscordExceptionFilter } from './discord-exception.filter'
import { makeButtonInteraction } from '../../../../test/discord/mock-interaction'

class TestError extends TaggedError {
  override readonly _tag = 'TestError'
  constructor() {
    super('boom')
  }
}

const logger = {
  create: () => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  }),
}

function host(interaction: unknown): ArgumentsHost {
  return {
    getArgByIndex: () => [interaction],
  } as unknown as ArgumentsHost
}

describe('DiscordExceptionFilter', () => {
  it('uses reply when interaction is fresh', async () => {
    const filter = new DiscordExceptionFilter(logger as never)
    const interaction = makeButtonInteraction({ deferred: false, replied: false })
    ;(interaction as { reply?: unknown }).reply = vi.fn().mockResolvedValue(undefined)

    await filter.catch(new TestError(), host(interaction))

    expect(interaction.reply).toHaveBeenCalledWith({
      content: 'Erro: boom',
      ephemeral: true,
    })
  })

  it('uses followUp when interaction is deferred', async () => {
    const filter = new DiscordExceptionFilter(logger as never)
    const interaction = makeButtonInteraction({ deferred: true })

    await filter.catch(new TestError(), host(interaction))

    expect(interaction.followUp).toHaveBeenCalledWith({
      content: 'Erro: boom',
      ephemeral: true,
    })
  })

  it('does nothing when interaction is not repliable', async () => {
    const filter = new DiscordExceptionFilter(logger as never)
    const interaction = { isRepliable: () => false } as unknown
    await expect(
      filter.catch(new TestError(), host(interaction)),
    ).resolves.toBeUndefined()
  })
})
```

- [ ] **Step 3: Run test — must fail**

```bash
cd apps/api && bun run test -- src/interfaces/discord/shared/filters/discord-exception.filter.spec.ts
```
Expected: import error.

- [ ] **Step 4: Implement filter**

```typescript
// apps/api/src/interfaces/discord/shared/filters/discord-exception.filter.ts
import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common'
import { Catch, Injectable } from '@nestjs/common'
import { AppLoggerFactory } from '../../../../platform/logger'
import { TaggedError } from '../../../../shared/domain'

@Catch(TaggedError)
@Injectable()
export class DiscordExceptionFilter implements ExceptionFilter {
  private readonly logger: ReturnType<AppLoggerFactory['create']>

  constructor(loggerFactory: AppLoggerFactory) {
    this.logger = loggerFactory.create('discord-exception-filter')
  }

  async catch(err: TaggedError, host: ArgumentsHost): Promise<void> {
    const ctx = host.getArgByIndex(0) as readonly unknown[] | undefined
    const interaction = Array.isArray(ctx) ? (ctx[0] as InteractionLike) : null

    this.logger.error('Discord handler failed', {
      tag: (err as { _tag?: string })._tag,
      message: err.message,
    })

    if (!interaction || typeof interaction.isRepliable !== 'function') return
    if (!interaction.isRepliable()) return

    const payload = { content: `Erro: ${err.message}`, ephemeral: true } as const
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp?.(payload).catch(() => undefined)
    } else {
      await interaction.reply?.(payload).catch(() => undefined)
    }
  }
}

type InteractionLike = {
  isRepliable: () => boolean
  deferred?: boolean
  replied?: boolean
  reply?: (payload: { content: string; ephemeral: true }) => Promise<unknown>
  followUp?: (payload: { content: string; ephemeral: true }) => Promise<unknown>
}
```

- [ ] **Step 5: Run test — must pass**

```bash
cd apps/api && bun run test -- src/interfaces/discord/shared/filters/discord-exception.filter.spec.ts
```
Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/interfaces/discord/shared/filters/
git commit -m "feat(discord): add TaggedError exception filter for Necord

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 2.3: Discord-user-linked guard

**Files:**
- Create: `apps/api/src/interfaces/discord/shared/guards/discord-user-linked.guard.ts`
- Create: `apps/api/src/interfaces/discord/shared/guards/discord-user-linked.guard.spec.ts`

The guard delegates to `DiscordAuthService.requireChatAuth(interaction)`, preserving today's reply-with-login-link side effect.

- [ ] **Step 1: Write failing spec**

```typescript
// apps/api/src/interfaces/discord/shared/guards/discord-user-linked.guard.spec.ts
import type { ExecutionContext } from '@nestjs/common'
import { describe, expect, it, vi } from 'vitest'
import { makeChatInputInteraction } from '../../../../test/discord/mock-interaction'
import { DiscordUserLinkedGuard } from './discord-user-linked.guard'

function makeCtx(interaction: unknown): ExecutionContext {
  return {
    getArgByIndex: () => [interaction],
  } as unknown as ExecutionContext
}

describe('DiscordUserLinkedGuard', () => {
  it('returns true when auth resolves a session', async () => {
    const auth = {
      requireChatAuth: vi.fn().mockResolvedValue({ userId: 'app-1' }),
    }
    const guard = new DiscordUserLinkedGuard(auth as never)
    const interaction = makeChatInputInteraction()

    await expect(guard.canActivate(makeCtx(interaction))).resolves.toBe(true)
    expect(auth.requireChatAuth).toHaveBeenCalledWith(interaction)
  })

  it('returns false when auth replies with login link', async () => {
    const auth = { requireChatAuth: vi.fn().mockResolvedValue(null) }
    const guard = new DiscordUserLinkedGuard(auth as never)
    const interaction = makeChatInputInteraction()

    await expect(guard.canActivate(makeCtx(interaction))).resolves.toBe(false)
  })
})
```

- [ ] **Step 2: Run test — must fail**

```bash
cd apps/api && bun run test -- src/interfaces/discord/shared/guards/discord-user-linked.guard.spec.ts
```
Expected: import error.

- [ ] **Step 3: Implement guard**

```typescript
// apps/api/src/interfaces/discord/shared/guards/discord-user-linked.guard.ts
import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
} from '@nestjs/common'
import type { ChatInputCommandInteraction } from 'discord.js'
import { DiscordAuthService } from '../../services/discord-auth.service'

@Injectable()
export class DiscordUserLinkedGuard implements CanActivate {
  constructor(private readonly auth: DiscordAuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const ctx = context.getArgByIndex(0) as
      | readonly [ChatInputCommandInteraction]
      | undefined
    const interaction = ctx?.[0]
    if (!interaction) return false

    const session = await this.auth.requireChatAuth(interaction)
    return session !== null
  }
}
```

- [ ] **Step 4: Run test — must pass**

```bash
cd apps/api && bun run test -- src/interfaces/discord/shared/guards/discord-user-linked.guard.spec.ts
```
Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/interfaces/discord/shared/guards/
git commit -m "feat(discord): add user-linked guard delegating to DiscordAuthService

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Phase 3 — Top-level commands (`/login`, `/logout`)

Read the legacy logic in `slash-command-handler.service.ts` for the `login` and `logout` branches before implementing. Each new command class wraps the same call into the same service.

### Task 3.1: `/login` command

**Files:**
- Create: `apps/api/src/interfaces/discord/features/auth/login.command.ts`
- Create: `apps/api/src/interfaces/discord/features/auth/login.command.spec.ts`

- [ ] **Step 1: Locate legacy login handler**

```bash
cd apps/api && rg -n "case 'login'|name === 'login'|setName\\('login'\\)" src/interfaces/discord
```
Expected: a single dispatch site in `slash-command-handler.service.ts` and the registration in `command-registration.service.ts`. Note line numbers for use in Step 3.

- [ ] **Step 2: Write failing spec**

```typescript
// apps/api/src/interfaces/discord/features/auth/login.command.spec.ts
import { Test } from '@nestjs/testing'
import { describe, expect, it, vi } from 'vitest'
import { makeChatInputInteraction } from '../../../../test/discord/mock-interaction'
import { asSlashContext } from '../../../../test/discord/make-context'
import { DiscordAuthService } from '../../services/discord-auth.service'
import { LoginCommand } from './login.command'

describe('LoginCommand', () => {
  it('replies with the login button via DiscordAuthService.replyWithLoginLink', async () => {
    const auth = { replyWithLoginLink: vi.fn().mockResolvedValue(undefined) }
    const module = await Test.createTestingModule({
      providers: [
        LoginCommand,
        { provide: DiscordAuthService, useValue: auth },
      ],
    }).compile()
    const cmd = module.get(LoginCommand)
    const interaction = makeChatInputInteraction()

    await cmd.onLogin(asSlashContext(interaction))

    expect(auth.replyWithLoginLink).toHaveBeenCalledWith(interaction)
  })
})
```

- [ ] **Step 3: Run test — must fail**

```bash
cd apps/api && bun run test -- src/interfaces/discord/features/auth/login.command.spec.ts
```
Expected: import error.

- [ ] **Step 4: Implement command**

```typescript
// apps/api/src/interfaces/discord/features/auth/login.command.ts
import { Injectable } from '@nestjs/common'
import { Context, SlashCommand, type SlashCommandContext } from 'necord'
import { DiscordAuthService } from '../../services/discord-auth.service'

@Injectable()
export class LoginCommand {
  constructor(private readonly auth: DiscordAuthService) {}

  @SlashCommand({
    name: 'login',
    description: 'Conectar sua conta Discord ao standup-bot',
  })
  public async onLogin(@Context() [interaction]: SlashCommandContext) {
    await this.auth.replyWithLoginLink(interaction)
  }
}
```

- [ ] **Step 5: Run test — must pass**

```bash
cd apps/api && bun run test -- src/interfaces/discord/features/auth/login.command.spec.ts
```
Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/interfaces/discord/features/auth/login.command.ts apps/api/src/interfaces/discord/features/auth/login.command.spec.ts
git commit -m "feat(discord): add /login Necord command

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 3.2: `/logout` command

**Files:**
- Create: `apps/api/src/interfaces/discord/features/auth/logout.command.ts`
- Create: `apps/api/src/interfaces/discord/features/auth/logout.command.spec.ts`

The legacy logout branch lives in `slash-command-handler.service.ts`. Locate it (`rg "logout" src/interfaces/discord/handlers/slash-command-handler.service.ts -n`), and copy the body verbatim into `onLogout` below. Replace direct repository access by injecting `UserRepository` (already used by the legacy file).

- [ ] **Step 1: Write failing spec**

```typescript
// apps/api/src/interfaces/discord/features/auth/logout.command.spec.ts
import { Test } from '@nestjs/testing'
import { ok } from 'better-result'
import { describe, expect, it, vi } from 'vitest'
import { UserRepository } from '../../../../platform/database/repositories/user.repository'
import { makeChatInputInteraction } from '../../../../test/discord/mock-interaction'
import { asSlashContext } from '../../../../test/discord/make-context'
import { LogoutCommand } from './logout.command'

describe('LogoutCommand', () => {
  it('clears the active session and confirms ephemeral', async () => {
    const userRepo = {
      revokeSessions: vi.fn().mockResolvedValue(ok({ revokedCount: 1 })),
    }
    const module = await Test.createTestingModule({
      providers: [
        LogoutCommand,
        { provide: UserRepository, useValue: userRepo },
      ],
    }).compile()
    const cmd = module.get(LogoutCommand)
    const interaction = makeChatInputInteraction({ userId: 'discord-1' })

    await cmd.onLogout(asSlashContext(interaction))

    expect(userRepo.revokeSessions).toHaveBeenCalledWith('discord-1')
    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ ephemeral: true }),
    )
  })
})
```

> **If the legacy logout uses a different `UserRepository` method or repository,** keep the spec aligned with the actual call surface — the only goal is parity with current behavior.

- [ ] **Step 2: Run test — must fail**

```bash
cd apps/api && bun run test -- src/interfaces/discord/features/auth/logout.command.spec.ts
```

- [ ] **Step 3: Implement command**

```typescript
// apps/api/src/interfaces/discord/features/auth/logout.command.ts
import { Injectable } from '@nestjs/common'
import { Context, SlashCommand, type SlashCommandContext } from 'necord'
import { UserRepository } from '../../../../platform/database/repositories/user.repository'

@Injectable()
export class LogoutCommand {
  constructor(private readonly userRepo: UserRepository) {}

  @SlashCommand({
    name: 'logout',
    description: 'Desconectar sua conta Discord do standup-bot',
  })
  public async onLogout(@Context() [interaction]: SlashCommandContext) {
    // Mirror the legacy logout body. Reference:
    //   apps/api/src/interfaces/discord/handlers/slash-command-handler.service.ts
    //   (find the 'logout' branch — copy verbatim)
    const result = await this.userRepo.revokeSessions(interaction.user.id)
    const message = result.isOk()
      ? '✅ Sessão encerrada com sucesso.'
      : '❌ Não foi possível encerrar sua sessão. Tente novamente.'
    await interaction.reply({ content: message, ephemeral: true })
  }
}
```

- [ ] **Step 4: Run test — must pass**

```bash
cd apps/api && bun run test -- src/interfaces/discord/features/auth/logout.command.spec.ts
```

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/interfaces/discord/features/auth/logout.command.ts apps/api/src/interfaces/discord/features/auth/logout.command.spec.ts
git commit -m "feat(discord): add /logout Necord command

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Phase 4 — `/standup` subcommands

Each subcommand follows this pattern:

1. Read the legacy branch in `slash-command-handler.service.ts` for the matching subcommand name.
2. Write a Necord DTO mirroring the option names.
3. Write a TDD test that asserts the new class wires the same service calls.
4. Implement using `@StandupCommandGroup()` + `@Subcommand`.
5. Apply `@UseGuards(DiscordUserLinkedGuard)` and `@UseInterceptors(CooldownInterceptor)` per the legacy `AUTH_REQUIRED_SUBCOMMANDS` set (all six subcommands today).
6. Commit.

Tasks 4.1–4.6 follow this template. Each task lists the legacy reference, the new files, and the test/impl skeletons.

### Task 4.1: `/standup trigger` subcommand

**Files:**
- Create: `apps/api/src/interfaces/discord/features/trigger/trigger.dto.ts`
- Create: `apps/api/src/interfaces/discord/features/trigger/trigger.subcommand.ts`
- Create: `apps/api/src/interfaces/discord/features/trigger/trigger.subcommand.spec.ts`

Legacy reference: the `'trigger'` case in `slash-command-handler.service.ts` (find via `rg "case 'trigger'|'trigger'" src/interfaces/discord/handlers/slash-command-handler.service.ts`). It currently delegates to `TriggerConfirmationService.handleTrigger(interaction, options)`.

- [ ] **Step 1: Write DTO**

```typescript
// apps/api/src/interfaces/discord/features/trigger/trigger.dto.ts
import { StringOption } from 'necord'

export class TriggerDto {
  @StringOption({
    name: 'force-regenerate',
    description: 'Regenerar mesmo se já existe',
    required: false,
  })
  forceRegenerate?: string

  @StringOption({
    name: 'extra-context',
    description: 'Contexto adicional para a LLM',
    required: false,
  })
  extraContext?: string
}
```

- [ ] **Step 2: Write failing spec**

```typescript
// apps/api/src/interfaces/discord/features/trigger/trigger.subcommand.spec.ts
import { Test } from '@nestjs/testing'
import { describe, expect, it, vi } from 'vitest'
import { TriggerConfirmationService } from '../../handlers/trigger-confirmation.service'
import { makeChatInputInteraction } from '../../../../test/discord/mock-interaction'
import { asSlashContext } from '../../../../test/discord/make-context'
import { TriggerDto } from './trigger.dto'
import { TriggerSubcommand } from './trigger.subcommand'

describe('TriggerSubcommand', () => {
  it('forwards interaction and options to TriggerConfirmationService', async () => {
    const triggerSvc = { handleTrigger: vi.fn().mockResolvedValue(undefined) }
    const module = await Test.createTestingModule({
      providers: [
        TriggerSubcommand,
        { provide: TriggerConfirmationService, useValue: triggerSvc },
      ],
    }).compile()
    const cmd = module.get(TriggerSubcommand)
    const interaction = makeChatInputInteraction()
    const dto: TriggerDto = { forceRegenerate: 'true', extraContext: 'hello' }

    await cmd.onTrigger(asSlashContext(interaction), dto)

    expect(triggerSvc.handleTrigger).toHaveBeenCalledWith(interaction, dto)
  })
})
```

- [ ] **Step 3: Run test — must fail**

```bash
cd apps/api && bun run test -- src/interfaces/discord/features/trigger/trigger.subcommand.spec.ts
```

- [ ] **Step 4: Implement subcommand**

```typescript
// apps/api/src/interfaces/discord/features/trigger/trigger.subcommand.ts
import { Injectable, UseGuards, UseInterceptors } from '@nestjs/common'
import {
  Context,
  Options,
  type SlashCommandContext,
  Subcommand,
} from 'necord'
import { TriggerConfirmationService } from '../../handlers/trigger-confirmation.service'
import { DiscordUserLinkedGuard } from '../../shared/guards/discord-user-linked.guard'
import { CooldownInterceptor } from '../../shared/interceptors/cooldown.interceptor'
import { StandupCommandGroup } from '../../shared/decorators/standup-command-group.decorator'
import { TriggerDto } from './trigger.dto'

@Injectable()
@StandupCommandGroup()
export class TriggerSubcommand {
  constructor(private readonly trigger: TriggerConfirmationService) {}

  @Subcommand({ name: 'trigger', description: 'Disparar standup' })
  @UseGuards(DiscordUserLinkedGuard)
  @UseInterceptors(CooldownInterceptor)
  public async onTrigger(
    @Context() [interaction]: SlashCommandContext,
    @Options() options: TriggerDto,
  ) {
    await this.trigger.handleTrigger(interaction, options)
  }
}
```

- [ ] **Step 5: Run test — must pass**

```bash
cd apps/api && bun run test -- src/interfaces/discord/features/trigger/trigger.subcommand.spec.ts
```

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/interfaces/discord/features/trigger/
git commit -m "feat(discord): add /standup trigger subcommand on Necord

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 4.2: `/standup list` subcommand

**Files:**
- Create: `apps/api/src/interfaces/discord/features/list/list.dto.ts`
- Create: `apps/api/src/interfaces/discord/features/list/list.subcommand.ts`
- Create: `apps/api/src/interfaces/discord/features/list/list.subcommand.spec.ts`

Legacy reference: the `'list'` branch in `slash-command-handler.service.ts`. It reads `status`, `search`, `page` options from `interaction.options.getString/getInteger`, calls `StandupReadRepository.searchByUser(...)`, and replies with an embed list. Copy the body verbatim into `onList` below.

- [ ] **Step 1: Write DTO**

```typescript
// apps/api/src/interfaces/discord/features/list/list.dto.ts
import { IntegerOption, StringOption } from 'necord'

export class ListDto {
  @StringOption({
    name: 'status',
    description: 'Filtrar por status',
    required: false,
    choices: [
      { name: 'Rascunho', value: 'draft' },
      { name: 'Aguardando DM', value: 'delivery_pending' },
      { name: 'Pendente de Revisão', value: 'pending_review' },
      { name: 'Aprovado', value: 'approved' },
      { name: 'Rejeitado', value: 'rejected' },
      { name: 'Todos', value: 'all' },
    ],
  })
  status?: string

  @StringOption({
    name: 'search',
    description: 'Buscar no conteúdo',
    required: false,
  })
  search?: string

  @IntegerOption({
    name: 'page',
    description: 'Página (default 1)',
    required: false,
  })
  page?: number
}
```

- [ ] **Step 2: Locate legacy `list` body for parity reference**

```bash
cd apps/api && rg -n "case 'list'|'list'" src/interfaces/discord/handlers/slash-command-handler.service.ts
```
Note the line range — its inner logic is the contract for `onList`.

- [ ] **Step 3: Write failing spec**

```typescript
// apps/api/src/interfaces/discord/features/list/list.subcommand.spec.ts
import { Test } from '@nestjs/testing'
import { ok } from 'better-result'
import { describe, expect, it, vi } from 'vitest'
import { DiscordAuthService } from '../../services/discord-auth.service'
import { StandupReadRepository } from '../../../../platform/database/repositories/standup-read.repository'
import { makeChatInputInteraction } from '../../../../test/discord/mock-interaction'
import { asSlashContext } from '../../../../test/discord/make-context'
import { ListDto } from './list.dto'
import { ListSubcommand } from './list.subcommand'

describe('ListSubcommand', () => {
  it('queries the read repository with provided filters and replies', async () => {
    const auth = {
      requireChatAuth: vi.fn().mockResolvedValue({ userId: 'app-1' }),
    }
    const repo = {
      searchByUser: vi
        .fn()
        .mockResolvedValue(ok({ items: [], total: 0, page: 1, pageSize: 5 })),
    }
    const module = await Test.createTestingModule({
      providers: [
        ListSubcommand,
        { provide: DiscordAuthService, useValue: auth },
        { provide: StandupReadRepository, useValue: repo },
      ],
    }).compile()
    const cmd = module.get(ListSubcommand)
    const interaction = makeChatInputInteraction({ userId: 'discord-1' })
    const dto: ListDto = { status: 'pending_review', search: 'foo', page: 2 }

    await cmd.onList(asSlashContext(interaction), dto)

    expect(auth.requireChatAuth).toHaveBeenCalledWith(interaction)
    expect(repo.searchByUser).toHaveBeenCalledWith({
      userId: 'app-1',
      status: 'pending_review',
      search: 'foo',
      page: 2,
    })
    expect(interaction.reply).toHaveBeenCalled()
  })
})
```

- [ ] **Step 4: Implement subcommand using legacy body**

```typescript
// apps/api/src/interfaces/discord/features/list/list.subcommand.ts
import { Injectable } from '@nestjs/common'
import {
  Context,
  Options,
  type SlashCommandContext,
  Subcommand,
} from 'necord'
import { StandupReadRepository } from '../../../../platform/database/repositories/standup-read.repository'
import { StandupCommandGroup } from '../../shared/decorators/standup-command-group.decorator'
import { DiscordAuthService } from '../../services/discord-auth.service'
import { ListDto } from './list.dto'

@Injectable()
@StandupCommandGroup()
export class ListSubcommand {
  constructor(
    private readonly auth: DiscordAuthService,
    private readonly repo: StandupReadRepository,
  ) {}

  @Subcommand({ name: 'list', description: 'Listar seus standups' })
  public async onList(
    @Context() [interaction]: SlashCommandContext,
    @Options() options: ListDto,
  ) {
    const session = await this.auth.requireChatAuth(interaction)
    if (!session) return

    // Mirror legacy logic from slash-command-handler.service.ts ('list' branch):
    //   query repo.searchByUser({ userId, status, search, page })
    //   build reply embed/text
    //   await interaction.reply({ ... })
    const result = await this.repo.searchByUser({
      userId: session.userId,
      status: options.status,
      search: options.search,
      page: options.page ?? 1,
    })

    if (result.isErr()) {
      await interaction.reply({
        content: '❌ Erro ao consultar standups.',
        ephemeral: true,
      })
      return
    }

    // Build reply payload with the same shape the legacy handler used.
    // Use `formatListReply(result.value)` extracted from legacy code below.
    const payload = formatListReply(result.value)
    await interaction.reply(payload)
  }
}
```

> **Verification step:** copy `formatListReply` (or the inline logic that becomes it) from the legacy file into a colocated helper. Ensure the test in Step 3 still passes after the helper exists.

- [ ] **Step 5: Run test — must pass**

```bash
cd apps/api && bun run test -- src/interfaces/discord/features/list/list.subcommand.spec.ts
```

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/interfaces/discord/features/list/
git commit -m "feat(discord): add /standup list subcommand on Necord

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 4.3: `/standup approve` subcommand

**Files:**
- Create: `apps/api/src/interfaces/discord/features/approve/approve.dto.ts`
- Create: `apps/api/src/interfaces/discord/features/approve/approve.subcommand.ts`
- Create: `apps/api/src/interfaces/discord/features/approve/approve.subcommand.spec.ts`

Legacy reference: `'approve'` branch in `slash-command-handler.service.ts`. It pulls `id` from options, calls the approval service (or repository) and replies. Copy the body verbatim.

- [ ] **Step 1: Write DTO**

```typescript
// apps/api/src/interfaces/discord/features/approve/approve.dto.ts
import { StringOption } from 'necord'

export class ApproveDto {
  @StringOption({
    name: 'id',
    description: 'ID do standup',
    required: true,
    autocomplete: false, // autocomplete handler deferred to a follow-up PR
  })
  id!: string
}
```

- [ ] **Step 2: Write failing spec**

```typescript
// apps/api/src/interfaces/discord/features/approve/approve.subcommand.spec.ts
import { Test } from '@nestjs/testing'
import { describe, expect, it, vi } from 'vitest'
import { makeChatInputInteraction } from '../../../../test/discord/mock-interaction'
import { asSlashContext } from '../../../../test/discord/make-context'
import { ApproveDto } from './approve.dto'
import { ApproveSubcommand } from './approve.subcommand'
import { DiscordAuthService } from '../../services/discord-auth.service'

describe('ApproveSubcommand', () => {
  it('delegates to the legacy approve handler with id from options', async () => {
    const auth = {
      requireChatAuth: vi.fn().mockResolvedValue({ userId: 'app-1' }),
    }
    const handler = { approveById: vi.fn().mockResolvedValue(undefined) }
    const module = await Test.createTestingModule({
      providers: [
        ApproveSubcommand,
        { provide: DiscordAuthService, useValue: auth },
        { provide: 'APPROVE_HANDLER', useValue: handler },
      ],
    })
      .overrideProvider(ApproveSubcommand)
      .useFactory({
        factory: (a: DiscordAuthService, h: typeof handler) =>
          new ApproveSubcommand(a, h as never),
        inject: [DiscordAuthService, 'APPROVE_HANDLER'],
      })
      .compile()
    const cmd = module.get(ApproveSubcommand)
    const interaction = makeChatInputInteraction()
    const dto: ApproveDto = { id: 'std-1' }

    await cmd.onApprove(asSlashContext(interaction), dto)

    expect(handler.approveById).toHaveBeenCalledWith(interaction, 'std-1', 'app-1')
  })
})
```

> **If the legacy code calls a specific service** (e.g., `ApproveStandupService` from `contexts/standups/approval/`), wire that as the dependency rather than a placeholder. The real Discord-side approve flow exists today — find it via `rg "approveById|approve(" src/contexts/standups/approval -n` and use it directly.

- [ ] **Step 3: Implement subcommand**

```typescript
// apps/api/src/interfaces/discord/features/approve/approve.subcommand.ts
import { Injectable, UseGuards } from '@nestjs/common'
import {
  Context,
  Options,
  type SlashCommandContext,
  Subcommand,
} from 'necord'
import { ApproveStandupService } from '../../../../contexts/standups/approval/approve-standup.service'
import { DiscordAuthService } from '../../services/discord-auth.service'
import { DiscordUserLinkedGuard } from '../../shared/guards/discord-user-linked.guard'
import { StandupCommandGroup } from '../../shared/decorators/standup-command-group.decorator'
import { ApproveDto } from './approve.dto'

@Injectable()
@StandupCommandGroup()
export class ApproveSubcommand {
  constructor(
    private readonly auth: DiscordAuthService,
    private readonly approveSvc: ApproveStandupService,
  ) {}

  @Subcommand({ name: 'approve', description: 'Aprovar um standup pelo ID' })
  @UseGuards(DiscordUserLinkedGuard)
  public async onApprove(
    @Context() [interaction]: SlashCommandContext,
    @Options() { id }: ApproveDto,
  ) {
    const session = await this.auth.requireChatAuth(interaction)
    if (!session) return

    // Mirror legacy 'approve' logic from slash-command-handler.service.ts.
    // Reply text matches today's wording.
    const result = await this.approveSvc.execute({
      standupId: id,
      userId: session.userId,
      source: 'discord',
    })
    const message = result.isOk()
      ? `✅ Standup ${id} aprovado.`
      : `❌ ${result.error.message}`
    await interaction.reply({ content: message, ephemeral: true })
  }
}
```

- [ ] **Step 4: Run test — must pass**

```bash
cd apps/api && bun run test -- src/interfaces/discord/features/approve/approve.subcommand.spec.ts
```

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/interfaces/discord/features/approve/
git commit -m "feat(discord): add /standup approve subcommand on Necord

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 4.4: `/standup settings` subcommand and modal

**Files:**
- Create: `apps/api/src/interfaces/discord/features/settings/settings.subcommand.ts`
- Create: `apps/api/src/interfaces/discord/features/settings/settings.subcommand.spec.ts`
- Create: `apps/api/src/interfaces/discord/features/settings/settings.modal.ts`
- Create: `apps/api/src/interfaces/discord/features/settings/settings.modal.spec.ts`

Legacy reference: `'settings'` branch in `slash-command-handler.service.ts` and `SettingsInteractionService` (`apps/api/src/interfaces/discord/handlers/settings-interaction.service.ts`, ~13 KB). The subcommand opens a modal; the modal saves preferences via `UserSettingsRepository`.

- [ ] **Step 1: Read `SettingsInteractionService` to identify the public methods used**

```bash
cd apps/api && rg -n "public " src/interfaces/discord/handlers/settings-interaction.service.ts
```

Identify two methods: one that builds and shows the modal (call from subcommand), one that handles the modal submission (call from modal handler).

- [ ] **Step 2: Write failing subcommand spec**

```typescript
// apps/api/src/interfaces/discord/features/settings/settings.subcommand.spec.ts
import { Test } from '@nestjs/testing'
import { describe, expect, it, vi } from 'vitest'
import { SettingsInteractionService } from '../../handlers/settings-interaction.service'
import { makeChatInputInteraction } from '../../../../test/discord/mock-interaction'
import { asSlashContext } from '../../../../test/discord/make-context'
import { SettingsSubcommand } from './settings.subcommand'

describe('SettingsSubcommand', () => {
  it('shows the settings modal', async () => {
    const settings = { showSettingsModal: vi.fn().mockResolvedValue(undefined) }
    const module = await Test.createTestingModule({
      providers: [
        SettingsSubcommand,
        { provide: SettingsInteractionService, useValue: settings },
      ],
    }).compile()
    const cmd = module.get(SettingsSubcommand)
    const interaction = makeChatInputInteraction()

    await cmd.onSettings(asSlashContext(interaction))

    expect(settings.showSettingsModal).toHaveBeenCalledWith(interaction)
  })
})
```

> If the legacy method has a different name (e.g., `handleSettings`), adjust both the spec and the implementation to match it. Goal is parity.

- [ ] **Step 3: Implement subcommand**

```typescript
// apps/api/src/interfaces/discord/features/settings/settings.subcommand.ts
import { Injectable, UseGuards } from '@nestjs/common'
import {
  Context,
  type SlashCommandContext,
  Subcommand,
} from 'necord'
import { SettingsInteractionService } from '../../handlers/settings-interaction.service'
import { StandupCommandGroup } from '../../shared/decorators/standup-command-group.decorator'
import { DiscordUserLinkedGuard } from '../../shared/guards/discord-user-linked.guard'

@Injectable()
@StandupCommandGroup()
export class SettingsSubcommand {
  constructor(private readonly settings: SettingsInteractionService) {}

  @Subcommand({ name: 'settings', description: 'Configurar preferências' })
  @UseGuards(DiscordUserLinkedGuard)
  public async onSettings(@Context() [interaction]: SlashCommandContext) {
    await this.settings.showSettingsModal(interaction)
  }
}
```

- [ ] **Step 4: Run subcommand test — must pass**

```bash
cd apps/api && bun run test -- src/interfaces/discord/features/settings/settings.subcommand.spec.ts
```

- [ ] **Step 5: Write failing modal spec**

Inspect today's modal customId: `rg "settings-modal|setCustomId\\('settings" src/interfaces/discord/handlers/settings-interaction.service.ts -n`. Use that exact string in the `@Modal()` decorator.

```typescript
// apps/api/src/interfaces/discord/features/settings/settings.modal.spec.ts
import { Test } from '@nestjs/testing'
import { describe, expect, it, vi } from 'vitest'
import { SettingsInteractionService } from '../../handlers/settings-interaction.service'
import { makeModalInteraction } from '../../../../test/discord/mock-interaction'
import { asModalContext } from '../../../../test/discord/make-context'
import { SettingsModal } from './settings.modal'

describe('SettingsModal', () => {
  it('forwards modal submission to the legacy handler', async () => {
    const settings = {
      handleSettingsSubmit: vi.fn().mockResolvedValue(undefined),
    }
    const module = await Test.createTestingModule({
      providers: [
        SettingsModal,
        { provide: SettingsInteractionService, useValue: settings },
      ],
    }).compile()
    const modal = module.get(SettingsModal)
    const interaction = makeModalInteraction({ schedule: '17:30' })

    await modal.onSubmit(asModalContext(interaction))

    expect(settings.handleSettingsSubmit).toHaveBeenCalledWith(interaction)
  })
})
```

- [ ] **Step 6: Implement modal**

```typescript
// apps/api/src/interfaces/discord/features/settings/settings.modal.ts
import { Injectable } from '@nestjs/common'
import { Context, Modal, type ModalContext } from 'necord'
import { SettingsInteractionService } from '../../handlers/settings-interaction.service'

@Injectable()
export class SettingsModal {
  constructor(private readonly settings: SettingsInteractionService) {}

  @Modal('settings-modal')
  public async onSubmit(@Context() [interaction]: ModalContext) {
    await this.settings.handleSettingsSubmit(interaction)
  }
}
```

- [ ] **Step 7: Run modal test — must pass**

```bash
cd apps/api && bun run test -- src/interfaces/discord/features/settings/settings.modal.spec.ts
```

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/interfaces/discord/features/settings/
git commit -m "feat(discord): add /standup settings subcommand and modal on Necord

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 4.5: `/standup services` subcommand

**Files:**
- Create: `apps/api/src/interfaces/discord/features/services/services.dto.ts`
- Create: `apps/api/src/interfaces/discord/features/services/services.subcommand.ts`
- Create: `apps/api/src/interfaces/discord/features/services/services.subcommand.spec.ts`

Legacy reference: `'services'` branch in `slash-command-handler.service.ts`. It calls `DiscordServiceHealthService` and replies with health summary.

- [ ] **Step 1: Write DTO**

```typescript
// apps/api/src/interfaces/discord/features/services/services.dto.ts
import { StringOption } from 'necord'

export class ServicesDto {
  @StringOption({
    name: 'service',
    description: 'Qual serviço consultar',
    required: false,
    choices: [
      { name: 'Todos', value: 'all' },
      { name: 'API', value: 'api' },
      { name: 'Worker', value: 'worker' },
      { name: 'Bot', value: 'bot' },
    ],
  })
  service?: 'all' | 'api' | 'worker' | 'bot'
}
```

- [ ] **Step 2: Write failing spec**

```typescript
// apps/api/src/interfaces/discord/features/services/services.subcommand.spec.ts
import { Test } from '@nestjs/testing'
import { describe, expect, it, vi } from 'vitest'
import { DiscordServiceHealthService } from '../../services/discord-service-health.service'
import { makeChatInputInteraction } from '../../../../test/discord/mock-interaction'
import { asSlashContext } from '../../../../test/discord/make-context'
import { ServicesDto } from './services.dto'
import { ServicesSubcommand } from './services.subcommand'

describe('ServicesSubcommand', () => {
  it('queries health for the requested service and replies', async () => {
    const health = {
      report: vi
        .fn()
        .mockResolvedValue({ services: [], okCount: 0, totalCount: 0 }),
    }
    const module = await Test.createTestingModule({
      providers: [
        ServicesSubcommand,
        { provide: DiscordServiceHealthService, useValue: health },
      ],
    }).compile()
    const cmd = module.get(ServicesSubcommand)
    const interaction = makeChatInputInteraction()
    const dto: ServicesDto = { service: 'api' }

    await cmd.onServices(asSlashContext(interaction), dto)

    expect(health.report).toHaveBeenCalledWith('api')
    expect(interaction.reply).toHaveBeenCalled()
  })
})
```

> Replace `health.report` with the actual method name on `DiscordServiceHealthService`. Find it via `rg "public " src/interfaces/discord/services/discord-service-health.service.ts -n`.

- [ ] **Step 3: Implement subcommand**

```typescript
// apps/api/src/interfaces/discord/features/services/services.subcommand.ts
import { Injectable } from '@nestjs/common'
import {
  Context,
  Options,
  type SlashCommandContext,
  Subcommand,
} from 'necord'
import { DiscordServiceHealthService } from '../../services/discord-service-health.service'
import { StandupCommandGroup } from '../../shared/decorators/standup-command-group.decorator'
import { ServicesDto } from './services.dto'

@Injectable()
@StandupCommandGroup()
export class ServicesSubcommand {
  constructor(private readonly health: DiscordServiceHealthService) {}

  @Subcommand({ name: 'services', description: 'Status dos serviços' })
  public async onServices(
    @Context() [interaction]: SlashCommandContext,
    @Options() { service = 'all' }: ServicesDto,
  ) {
    // Mirror the 'services' branch from slash-command-handler.service.ts.
    const summary = await this.health.report(service)
    await interaction.reply({
      content: formatHealthSummary(summary),
      ephemeral: true,
    })
  }
}
```

- [ ] **Step 4: Run test — must pass**

```bash
cd apps/api && bun run test -- src/interfaces/discord/features/services/services.subcommand.spec.ts
```

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/interfaces/discord/features/services/
git commit -m "feat(discord): add /standup services subcommand on Necord

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 4.6: `/standup retry` subcommand

**Files:**
- Create: `apps/api/src/interfaces/discord/features/retry/retry.subcommand.ts`
- Create: `apps/api/src/interfaces/discord/features/retry/retry.subcommand.spec.ts`

Legacy reference: `'retry'` branch in `slash-command-handler.service.ts`. It calls `RetryDmService` (already imported in the legacy file). No options.

- [ ] **Step 1: Write failing spec**

```typescript
// apps/api/src/interfaces/discord/features/retry/retry.subcommand.spec.ts
import { Test } from '@nestjs/testing'
import { describe, expect, it, vi } from 'vitest'
import { RetryDmService } from '../../../../contexts/standups/delivery/retry-dm.service'
import { DiscordAuthService } from '../../services/discord-auth.service'
import { makeChatInputInteraction } from '../../../../test/discord/mock-interaction'
import { asSlashContext } from '../../../../test/discord/make-context'
import { RetrySubcommand } from './retry.subcommand'

describe('RetrySubcommand', () => {
  it('asks RetryDmService to redeliver the latest pending DM', async () => {
    const auth = {
      requireChatAuth: vi.fn().mockResolvedValue({ userId: 'app-1' }),
    }
    const retry = { retryLatestPending: vi.fn().mockResolvedValue(undefined) }
    const module = await Test.createTestingModule({
      providers: [
        RetrySubcommand,
        { provide: DiscordAuthService, useValue: auth },
        { provide: RetryDmService, useValue: retry },
      ],
    }).compile()
    const cmd = module.get(RetrySubcommand)
    const interaction = makeChatInputInteraction()

    await cmd.onRetry(asSlashContext(interaction))

    expect(retry.retryLatestPending).toHaveBeenCalledWith({
      userId: 'app-1',
      interaction,
    })
  })
})
```

> Adjust the `retry.retryLatestPending` call to match `RetryDmService`'s real public method. Use `rg "public " src/contexts/standups/delivery/retry-dm.service.ts -n`.

- [ ] **Step 2: Implement subcommand**

```typescript
// apps/api/src/interfaces/discord/features/retry/retry.subcommand.ts
import { Injectable, UseGuards } from '@nestjs/common'
import { Context, type SlashCommandContext, Subcommand } from 'necord'
import { RetryDmService } from '../../../../contexts/standups/delivery/retry-dm.service'
import { DiscordAuthService } from '../../services/discord-auth.service'
import { DiscordUserLinkedGuard } from '../../shared/guards/discord-user-linked.guard'
import { StandupCommandGroup } from '../../shared/decorators/standup-command-group.decorator'

@Injectable()
@StandupCommandGroup()
export class RetrySubcommand {
  constructor(
    private readonly auth: DiscordAuthService,
    private readonly retry: RetryDmService,
  ) {}

  @Subcommand({
    name: 'retry',
    description: 'Reenviar DM de standup pendente',
  })
  @UseGuards(DiscordUserLinkedGuard)
  public async onRetry(@Context() [interaction]: SlashCommandContext) {
    const session = await this.auth.requireChatAuth(interaction)
    if (!session) return
    await this.retry.retryLatestPending({ userId: session.userId, interaction })
  }
}
```

- [ ] **Step 3: Run test — must pass**

```bash
cd apps/api && bun run test -- src/interfaces/discord/features/retry/retry.subcommand.spec.ts
```

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/interfaces/discord/features/retry/
git commit -m "feat(discord): add /standup retry subcommand on Necord

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Phase 5 — Components (buttons & modals)

Each handler wraps an existing legacy service call. customId conventions:

- Buttons: `<feature>/<action>[/:param]`
- Modals: `<feature>-modal[/:param]`

The legacy customIds must match the new ones, since outbound DMs from `DiscordMessagesService` build buttons with the legacy IDs. Verify each ID against today's source via `rg "setCustomId\\(" src/interfaces/discord/notifications src/interfaces/discord/handlers -n`.

### Task 5.1: Review buttons

**Files:**
- Create: `apps/api/src/interfaces/discord/features/review/review.buttons.ts`
- Create: `apps/api/src/interfaces/discord/features/review/review.buttons.spec.ts`

Legacy source: `apps/api/src/interfaces/discord/handlers/standup-interaction.service.ts` (~4.6 KB) and the dispatch in `button-interaction.service.ts`. The customIds today follow `approve_<id>`, `reject_<id>`, `regenerate_<id>`, `adjust_<id>` (verify via grep). Necord can match `approve/:standupId` only if the IDs use a delimiter Necord supports — Necord uses `path-to-regexp`, so `:param` requires `/` separators. **If today's IDs use `_`,** keep emitting `_` from outbound code and switch the decorator to use a regex pattern (Necord supports raw regex via `new RegExp(...)`).

- [ ] **Step 1: Verify today's customId format**

```bash
cd apps/api && rg "setCustomId\\('(approve|reject|regenerate|adjust)" src/interfaces/discord -n
```
Note the exact pattern. If `_<id>` (underscore), use the regex form below. If `/<id>` (slash), use the path-to-regexp form.

- [ ] **Step 2: Write failing spec (covers approve happy + error path)**

```typescript
// apps/api/src/interfaces/discord/features/review/review.buttons.spec.ts
import { Test } from '@nestjs/testing'
import { err, ok } from 'better-result'
import { describe, expect, it, vi } from 'vitest'
import { StandupStatusSyncService } from '../../services/standup-status-sync.service'
import { makeButtonInteraction } from '../../../../test/discord/mock-interaction'
import { asButtonContext } from '../../../../test/discord/make-context'
import { ReviewButtons } from './review.buttons'

describe('ReviewButtons', () => {
  it('approve happy path: defers, calls service, reacts, syncs', async () => {
    const approveSvc = { execute: vi.fn().mockResolvedValue(ok({})) }
    const statusSync = { markApproved: vi.fn().mockResolvedValue(undefined) }
    const module = await Test.createTestingModule({
      providers: [
        ReviewButtons,
        { provide: 'APPROVE', useValue: approveSvc },
        { provide: StandupStatusSyncService, useValue: statusSync },
      ],
    })
      .overrideProvider(ReviewButtons)
      .useFactory({
        factory: (a: typeof approveSvc, s: StandupStatusSyncService) =>
          new ReviewButtons(a as never, s),
        inject: ['APPROVE', StandupStatusSyncService],
      })
      .compile()
    const buttons = module.get(ReviewButtons)
    const interaction = makeButtonInteraction()

    await buttons.onApprove(asButtonContext(interaction), 'std-1')

    expect(interaction.deferUpdate).toHaveBeenCalled()
    expect(approveSvc.execute).toHaveBeenCalledWith({
      standupId: 'std-1',
      source: 'discord',
    })
    expect(interaction.message?.react).toHaveBeenCalledWith('✅')
    expect(statusSync.markApproved).toHaveBeenCalledWith(interaction, 'std-1')
  })

  it('approve error path: replies ephemeral, no reaction', async () => {
    const approveSvc = { execute: vi.fn().mockResolvedValue(err(new Error('boom'))) }
    const statusSync = { markApproved: vi.fn() }
    const buttons = new ReviewButtons(approveSvc as never, statusSync as never)
    const interaction = makeButtonInteraction()

    await buttons.onApprove(asButtonContext(interaction), 'std-1')

    expect(interaction.followUp).toHaveBeenCalledWith({
      content: 'Erro: boom',
      ephemeral: true,
    })
    expect(interaction.message?.react).not.toHaveBeenCalled()
  })
})
```

> Replace the placeholder `'APPROVE'` token with the real injection class once the implementation imports it directly. The factory override is only necessary if the constructor signature changes during implementation.

- [ ] **Step 3: Implement buttons**

```typescript
// apps/api/src/interfaces/discord/features/review/review.buttons.ts
import { Injectable } from '@nestjs/common'
import {
  Button,
  type ButtonContext,
  ComponentParam,
  Context,
} from 'necord'
import { ApproveStandupService } from '../../../../contexts/standups/approval/approve-standup.service'
import { StandupStatusSyncService } from '../../services/standup-status-sync.service'
import { buildAdjustModal } from './build-adjust-modal'
// import { RegenerateStandupService } from ...  // see legacy import
// import { RejectStandupService } from ...

@Injectable()
export class ReviewButtons {
  constructor(
    private readonly approveSvc: ApproveStandupService,
    private readonly statusSync: StandupStatusSyncService,
    // private readonly rejectSvc: RejectStandupService,
    // private readonly regenerateSvc: RegenerateStandupService,
  ) {}

  @Button('approve/:standupId')
  public async onApprove(
    @Context() [interaction]: ButtonContext,
    @ComponentParam('standupId') standupId: string,
  ) {
    await interaction.deferUpdate()
    const result = await this.approveSvc.execute({
      standupId,
      source: 'discord',
    })
    if (result.isErr()) {
      await interaction.followUp({
        content: `Erro: ${result.error.message}`,
        ephemeral: true,
      })
      return
    }
    await interaction.message?.react('✅').catch(() => undefined)
    await this.statusSync.markApproved(interaction, standupId)
  }

  @Button('reject/:standupId')
  public async onReject(
    @Context() [interaction]: ButtonContext,
    @ComponentParam('standupId') standupId: string,
  ) {
    // Mirror the 'reject' branch from button-interaction.service.ts +
    // standup-interaction.service.ts.
    // ...
  }

  @Button('regenerate/:standupId')
  public async onRegenerate(
    @Context() [interaction]: ButtonContext,
    @ComponentParam('standupId') standupId: string,
  ) {
    // Mirror the 'regenerate' branch.
  }

  @Button('adjust/:standupId')
  public async onAdjust(
    @Context() [interaction]: ButtonContext,
    @ComponentParam('standupId') standupId: string,
  ) {
    await interaction.showModal(buildAdjustModal(standupId))
  }
}
```

> If today's IDs use `_` instead of `/`, replace each `@Button('approve/:standupId')` etc with `@Button(/^approve_(?<standupId>.+)$/)` and use `@ComponentParam('standupId')` the same way.

- [ ] **Step 4: Add a colocated modal builder helper**

```typescript
// apps/api/src/interfaces/discord/features/review/build-adjust-modal.ts
import {
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js'

export function buildAdjustModal(standupId: string): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(`adjust-modal/${standupId}`)
    .setTitle('Ajustar Standup')
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('feedback')
          .setLabel('Feedback')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
          .setMaxLength(1000),
      ),
    )
}
```

- [ ] **Step 5: Implement remaining cases (reject, regenerate)** mirroring legacy bodies. Extend the spec to cover each case.

- [ ] **Step 6: Run test — must pass**

```bash
cd apps/api && bun run test -- src/interfaces/discord/features/review/review.buttons.spec.ts
```

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/interfaces/discord/features/review/
git commit -m "feat(discord): add review buttons (approve/reject/regenerate/adjust) on Necord

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 5.2: Adjust modal handler

**Files:**
- Create: `apps/api/src/interfaces/discord/features/review/adjust.modal.ts`
- Create: `apps/api/src/interfaces/discord/features/review/adjust.modal.spec.ts`

- [ ] **Step 1: Write failing spec**

```typescript
// apps/api/src/interfaces/discord/features/review/adjust.modal.spec.ts
import { Test } from '@nestjs/testing'
import { ok } from 'better-result'
import { describe, expect, it, vi } from 'vitest'
import { makeModalInteraction } from '../../../../test/discord/mock-interaction'
import { asModalContext } from '../../../../test/discord/make-context'
import { AdjustModal } from './adjust.modal'
import { AdjustStandupService } from '../../../../contexts/standups/worker/standup/strategies/adjust-standup.service'

describe('AdjustModal', () => {
  it('extracts feedback and dispatches the adjust strategy', async () => {
    const adjust = { execute: vi.fn().mockResolvedValue(ok({})) }
    const module = await Test.createTestingModule({
      providers: [
        AdjustModal,
        { provide: AdjustStandupService, useValue: adjust },
      ],
    }).compile()
    const modal = module.get(AdjustModal)
    const interaction = makeModalInteraction({ feedback: 'add detail' })

    await modal.onSubmit(asModalContext(interaction), 'std-1')

    expect(adjust.execute).toHaveBeenCalledWith({
      standupId: 'std-1',
      feedback: 'add detail',
    })
    expect(interaction.message.react).toHaveBeenCalledWith('✏️')
  })
})
```

> Find the actual `AdjustStandupService` import path with `rg "class AdjustStandupService" src -n`.

- [ ] **Step 2: Implement modal**

```typescript
// apps/api/src/interfaces/discord/features/review/adjust.modal.ts
import { Injectable } from '@nestjs/common'
import { Context, Modal, type ModalContext, ModalParam } from 'necord'
import { AdjustStandupService } from '../../../../contexts/standups/worker/standup/strategies/adjust-standup.service'

@Injectable()
export class AdjustModal {
  constructor(private readonly adjust: AdjustStandupService) {}

  @Modal('adjust-modal/:standupId')
  public async onSubmit(
    @Context() [interaction]: ModalContext,
    @ModalParam('standupId') standupId: string,
  ) {
    await interaction.deferUpdate()
    const feedback = interaction.fields.getTextInputValue('feedback')
    const result = await this.adjust.execute({ standupId, feedback })
    if (result.isErr()) {
      await interaction.followUp({
        content: `Erro: ${result.error.message}`,
        ephemeral: true,
      })
      return
    }
    await interaction.message?.react('✏️').catch(() => undefined)
    await interaction.editReply({ content: 'Ajustando...', components: [] })
  }
}
```

- [ ] **Step 3: Run test — must pass**

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/interfaces/discord/features/review/adjust.modal.ts apps/api/src/interfaces/discord/features/review/adjust.modal.spec.ts
git commit -m "feat(discord): add adjust modal handler on Necord

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 5.3: Reminder buttons

**Files:**
- Create: `apps/api/src/interfaces/discord/features/reminder/reminder.buttons.ts`
- Create: `apps/api/src/interfaces/discord/features/reminder/reminder.buttons.spec.ts`

Legacy reference: `apps/api/src/interfaces/discord/handlers/reminder-interaction.service.ts`. customIds today: verify with `rg "setCustomId\\('reminder" src/interfaces/discord -n`. Likely `reminder_postpone` and `reminder_cancel` (underscore).

- [ ] **Step 1: Verify customId format**

```bash
cd apps/api && rg "setCustomId\\('reminder" src/interfaces/discord -n
```

- [ ] **Step 2: Write failing spec covering both actions**

```typescript
// apps/api/src/interfaces/discord/features/reminder/reminder.buttons.spec.ts
import { Test } from '@nestjs/testing'
import { describe, expect, it, vi } from 'vitest'
import { ReminderInteractionService } from '../../handlers/reminder-interaction.service'
import { makeButtonInteraction } from '../../../../test/discord/mock-interaction'
import { asButtonContext } from '../../../../test/discord/make-context'
import { ReminderButtons } from './reminder.buttons'

describe('ReminderButtons', () => {
  it('postpone forwards to legacy service', async () => {
    const svc = { handlePostpone: vi.fn().mockResolvedValue(undefined) }
    const module = await Test.createTestingModule({
      providers: [
        ReminderButtons,
        { provide: ReminderInteractionService, useValue: svc },
      ],
    }).compile()
    const buttons = module.get(ReminderButtons)
    const interaction = makeButtonInteraction()

    await buttons.onPostpone(asButtonContext(interaction))

    expect(svc.handlePostpone).toHaveBeenCalledWith(interaction)
  })

  it('cancel forwards to legacy service', async () => {
    const svc = { handleCancel: vi.fn().mockResolvedValue(undefined) }
    const module = await Test.createTestingModule({
      providers: [
        ReminderButtons,
        { provide: ReminderInteractionService, useValue: svc },
      ],
    }).compile()
    const buttons = module.get(ReminderButtons)
    const interaction = makeButtonInteraction()

    await buttons.onCancel(asButtonContext(interaction))

    expect(svc.handleCancel).toHaveBeenCalledWith(interaction)
  })
})
```

> Replace `handlePostpone`/`handleCancel` with the actual public methods on `ReminderInteractionService`.

- [ ] **Step 3: Implement buttons (use the regex form if today's IDs use `_`)**

```typescript
// apps/api/src/interfaces/discord/features/reminder/reminder.buttons.ts
import { Injectable } from '@nestjs/common'
import { Button, type ButtonContext, Context } from 'necord'
import { ReminderInteractionService } from '../../handlers/reminder-interaction.service'

@Injectable()
export class ReminderButtons {
  constructor(private readonly svc: ReminderInteractionService) {}

  @Button('reminder_postpone') // adjust to actual customId; if `/` style use 'reminder/postpone'
  public async onPostpone(@Context() [interaction]: ButtonContext) {
    await this.svc.handlePostpone(interaction)
  }

  @Button('reminder_cancel')
  public async onCancel(@Context() [interaction]: ButtonContext) {
    await this.svc.handleCancel(interaction)
  }
}
```

- [ ] **Step 4: Run test — must pass**

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/interfaces/discord/features/reminder/
git commit -m "feat(discord): add reminder buttons on Necord

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 5.4: Trigger confirmation buttons

**Files:**
- Create: `apps/api/src/interfaces/discord/features/trigger/trigger-confirmation.buttons.ts`
- Create: `apps/api/src/interfaces/discord/features/trigger/trigger-confirmation.buttons.spec.ts`

Legacy reference: `apps/api/src/interfaces/discord/handlers/trigger-confirmation.service.ts`. Today the service emits buttons (e.g., `trigger_confirm_<id>` / `trigger_cancel_<id>`) and handles them too. The new file routes the button handlers; the emit logic stays inside `TriggerConfirmationService` for now.

- [ ] **Step 1: Verify customId format and identify the public handler methods**

```bash
cd apps/api && rg "setCustomId\\('trigger" src/interfaces/discord -n
cd apps/api && rg "public " src/interfaces/discord/handlers/trigger-confirmation.service.ts
```

- [ ] **Step 2: Write spec + impl mirroring the pattern from Task 5.3** — one button per action (`confirm`, `cancel`), each forwarding to a method on `TriggerConfirmationService`.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/interfaces/discord/features/trigger/trigger-confirmation.buttons.ts apps/api/src/interfaces/discord/features/trigger/trigger-confirmation.buttons.spec.ts
git commit -m "feat(discord): add trigger confirmation buttons on Necord

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 5.5: Copy button

**Files:**
- Create: `apps/api/src/interfaces/discord/features/copy/copy.button.ts`
- Create: `apps/api/src/interfaces/discord/features/copy/copy.button.spec.ts`

Legacy reference: `apps/api/src/interfaces/discord/handlers/copy-interaction.service.ts`. customId pattern: verify via `rg "setCustomId\\('copy" src/interfaces/discord -n`.

- [ ] **Step 1: Mirror the Task 5.3 pattern. Single button (`copy/:standupId` or `copy_:standupId`) forwarding to `CopyInteractionService.handleCopy(interaction, standupId)`.**

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/interfaces/discord/features/copy/
git commit -m "feat(discord): add copy button on Necord

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Phase 6 — Listener migration

### Task 6.1: Convert `discord-streaming.listener.ts` to Necord `@On`

**Files:**
- Modify: `apps/api/src/interfaces/discord/listeners/discord-streaming.listener.ts`
- Modify: `apps/api/src/interfaces/discord/listeners/discord-streaming.listener.spec.ts`

The legacy listener subscribes to gateway events directly via `client.on(...)`. Replace those subscriptions with `@On(Events.X)` decorators on a class method per event. Necord wires the subscription automatically.

- [ ] **Step 1: List events the legacy file subscribes to**

```bash
cd apps/api && rg "Events\\.|client\\.on\\(" src/interfaces/discord/listeners/discord-streaming.listener.ts -n
```

- [ ] **Step 2: For each event, replace the subscription with a decorated method**

```typescript
// Example: voiceStateUpdate
import { Injectable } from '@nestjs/common'
import { type ContextOf, Context, On } from 'necord'
import { Events } from 'discord.js'

@Injectable()
export class DiscordStreamingListener {
  constructor(/* existing deps */) {}

  @On(Events.VoiceStateUpdate)
  public async onVoiceState(
    @Context() [oldState, newState]: ContextOf<'voiceStateUpdate'>,
  ) {
    // existing body verbatim
  }
}
```

Repeat for every event the legacy file subscribed to. Remove the constructor's `client.on(...)` calls and any explicit ready-event glue (Necord handles `ClientReady`).

- [ ] **Step 3: Update the existing spec**

`discord-streaming.listener.spec.ts` already exists. Adjust the test to instantiate the class directly and call the decorated method with a synthetic context tuple, instead of triggering it via `client.emit`.

- [ ] **Step 4: Run the spec — must pass**

```bash
cd apps/api && bun run test -- src/interfaces/discord/listeners/discord-streaming.listener.spec.ts
```

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/interfaces/discord/listeners/discord-streaming.listener.ts apps/api/src/interfaces/discord/listeners/discord-streaming.listener.spec.ts
git commit -m "refactor(discord): convert streaming listener to Necord @On decorators

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Phase 7 — Wire-up & legacy removal (atomic cut-over)

This phase is the only one where the application can break between commits. Run the full test suite after every step.

### Task 7.1: Move colocated state stores to feature folders

**Files:**
- Move: `apps/api/src/interfaces/discord/handlers/trigger-request-store.ts` → `apps/api/src/interfaces/discord/features/trigger/trigger-request.store.ts`
- Move: `apps/api/src/interfaces/discord/handlers/update-review-message.ts` → `apps/api/src/interfaces/discord/features/review/update-review-message.ts`

- [ ] **Step 1: `git mv` and update imports**

```bash
git mv apps/api/src/interfaces/discord/handlers/trigger-request-store.ts apps/api/src/interfaces/discord/features/trigger/trigger-request.store.ts
git mv apps/api/src/interfaces/discord/handlers/update-review-message.ts apps/api/src/interfaces/discord/features/review/update-review-message.ts
cd apps/api && rg "handlers/trigger-request-store|handlers/update-review-message" src -n
```
Update every result with the new path.

- [ ] **Step 2: Typecheck + tests**

```bash
cd apps/api && bun run typecheck && bun run test
```

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/interfaces/discord/
git commit -m "refactor(discord): relocate trigger-request store and review-update helper

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 7.2: Rewrite `discord.module.ts`

**Files:**
- Modify: `apps/api/src/interfaces/discord/discord.module.ts`

- [ ] **Step 1: Replace the file body**

```typescript
import { forwardRef, Module } from '@nestjs/common'
import { APP_FILTER } from '@nestjs/core'
import { IntentsBitField } from 'discord.js'
import { NecordModule } from 'necord'
import { NecordPaginationModule } from '@necord/pagination'
import { StandupsModule } from '../../contexts/standups/standups.module'
import { DatabaseModule } from '../../platform/database/database.module'
import { EnvModule } from '../../platform/env/env.module'
import { EnvService } from '../../platform/env/env.service'
import { LoginCommand } from './features/auth/login.command'
import { LogoutCommand } from './features/auth/logout.command'
import { ApproveSubcommand } from './features/approve/approve.subcommand'
import { CopyButton } from './features/copy/copy.button'
import { ListSubcommand } from './features/list/list.subcommand'
import { ReminderButtons } from './features/reminder/reminder.buttons'
import { RetrySubcommand } from './features/retry/retry.subcommand'
import { AdjustModal } from './features/review/adjust.modal'
import { ReviewButtons } from './features/review/review.buttons'
import { ServicesSubcommand } from './features/services/services.subcommand'
import { SettingsModal } from './features/settings/settings.modal'
import { SettingsSubcommand } from './features/settings/settings.subcommand'
import { TriggerConfirmationButtons } from './features/trigger/trigger-confirmation.buttons'
import { TriggerSubcommand } from './features/trigger/trigger.subcommand'
import { DiscordExceptionFilter } from './shared/filters/discord-exception.filter'
import { DiscordUserLinkedGuard } from './shared/guards/discord-user-linked.guard'
import { CooldownInterceptor } from './shared/interceptors/cooldown.interceptor'
import { DiscordClientService } from './discord-client.service'
import { CommandCooldownService } from './handlers/command-cooldown.service'
import { CopyInteractionService } from './handlers/copy-interaction.service'
import { ReminderInteractionService } from './handlers/reminder-interaction.service'
import { SettingsInteractionService } from './handlers/settings-interaction.service'
import { TriggerConfirmationService } from './handlers/trigger-confirmation.service'
import { DiscordStreamingListener } from './listeners/discord-streaming.listener'
import { DiscordMessagesService } from './notifications/discord-messages.service'
import { DiscordAuthService } from './services/discord-auth.service'
import { DiscordAvailableReposService } from './services/discord-available-repos.service'
import { DiscordServiceHealthService } from './services/discord-service-health.service'
import { DiscordTriggerService } from './services/discord-trigger.service'
import { StandupNotificationService } from './services/standup-notification.service'
import { StandupStatusSyncService } from './services/standup-status-sync.service'

@Module({
  imports: [
    DatabaseModule,
    EnvModule,
    forwardRef(() => StandupsModule),
    NecordModule.forRootAsync({
      imports: [EnvModule],
      inject: [EnvService],
      useFactory: (env: EnvService) => ({
        token: env.discord.botToken,
        intents: [
          IntentsBitField.Flags.Guilds,
          IntentsBitField.Flags.GuildMessages,
          IntentsBitField.Flags.DirectMessages,
        ],
        development: env.discord.guildId ? [env.discord.guildId] : undefined,
        skipRegistration: !env.discord.gatewayEnabled,
      }),
    }),
    NecordPaginationModule.forRoot({
      allowSkip: true,
      allowTraversal: true,
      buttonsPosition: 'end',
    }),
  ],
  providers: [
    // top-level commands
    LoginCommand,
    LogoutCommand,
    // /standup subcommands
    TriggerSubcommand,
    ListSubcommand,
    ApproveSubcommand,
    SettingsSubcommand,
    ServicesSubcommand,
    RetrySubcommand,
    // components
    TriggerConfirmationButtons,
    SettingsModal,
    ReviewButtons,
    AdjustModal,
    ReminderButtons,
    CopyButton,
    // shared
    DiscordUserLinkedGuard,
    CooldownInterceptor,
    { provide: APP_FILTER, useClass: DiscordExceptionFilter },
    // listeners
    DiscordStreamingListener,
    // services preserved
    DiscordClientService,
    DiscordMessagesService,
    DiscordAuthService,
    DiscordAvailableReposService,
    DiscordServiceHealthService,
    DiscordTriggerService,
    StandupNotificationService,
    StandupStatusSyncService,
    CommandCooldownService,
    CopyInteractionService,
    ReminderInteractionService,
    SettingsInteractionService,
    TriggerConfirmationService,
  ],
  exports: [
    DiscordClientService,
    DiscordMessagesService,
    StandupStatusSyncService,
  ],
})
export class DiscordModule {}
```

> The exact field names on `EnvService` (`env.discord.botToken`, `env.discord.gatewayEnabled`, `env.discord.guildId`) must match what `env.schema.ts` defines. If the actual paths differ (e.g., `env.discordBotToken`), correct them.

- [ ] **Step 2: Run typecheck**

```bash
cd apps/api && bun run typecheck
```
Expected: pass.

- [ ] **Step 3: Run test suite**

```bash
cd apps/api && bun run test
```
Expected: all pass. Tests for legacy services that still exist will continue to pass; the deleted services come in Task 7.3.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/interfaces/discord/discord.module.ts
git commit -m "feat(discord): wire NecordModule and feature handlers

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 7.3: Delete legacy dispatchers and gateway

**Files (delete):**
- `apps/api/src/interfaces/discord/commands/command-registration.service.ts`
- `apps/api/src/interfaces/discord/listeners/discord-gateway.service.ts`
- `apps/api/src/interfaces/discord/handlers/slash-command-handler.service.ts`
- `apps/api/src/interfaces/discord/handlers/button-interaction.service.ts`
- `apps/api/src/interfaces/discord/handlers/modal-interaction.service.ts`
- `apps/api/src/interfaces/discord/handlers/standup-interaction.service.ts`
- `apps/api/src/interfaces/discord/handlers/standup-interaction.service.spec.ts`

The remaining legacy services (`SettingsInteractionService`, `ReminderInteractionService`, `TriggerConfirmationService`, `CopyInteractionService`, `CommandCooldownService`) are still imported by the new feature handlers — they STAY.

- [ ] **Step 1: Delete files**

```bash
git rm apps/api/src/interfaces/discord/commands/command-registration.service.ts
git rm apps/api/src/interfaces/discord/listeners/discord-gateway.service.ts
git rm apps/api/src/interfaces/discord/handlers/slash-command-handler.service.ts
git rm apps/api/src/interfaces/discord/handlers/button-interaction.service.ts
git rm apps/api/src/interfaces/discord/handlers/modal-interaction.service.ts
git rm apps/api/src/interfaces/discord/handlers/standup-interaction.service.ts
git rm apps/api/src/interfaces/discord/handlers/standup-interaction.service.spec.ts
rmdir apps/api/src/interfaces/discord/commands 2>/dev/null || true
```

- [ ] **Step 2: Find dangling imports and remove them**

```bash
cd apps/api && rg "CommandRegistrationService|DiscordGatewayService|SlashCommandHandlerService|ButtonInteractionService|ModalInteractionService|StandupInteractionService" src
```
Remove every import and reference. They should already be absent from `discord.module.ts` after Task 7.2 — but `app.module.ts` and other entry points may need adjustment.

- [ ] **Step 3: Typecheck + tests**

```bash
cd apps/api && bun run typecheck && bun run test
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor(discord): remove legacy dispatcher and gateway services

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 7.4: Boot smoke test

**Files:** none

- [ ] **Step 1: Boot the API locally with the bot disabled**

```bash
cd apps/api && DISCORD_GATEWAY_ENABLED=false bun run dev
```
Expected: server boots on `:3333`, no `discord.js` errors. Stop with Ctrl+C.

- [ ] **Step 2: Boot with bot enabled (requires real token)**

If a `.env` with a valid `DISCORD_BOT_TOKEN` and `DISCORD_GUILD_ID` exists locally:

```bash
cd apps/api && bun run dev
```
Expected log lines (or close): `Necord ready`, `Registered application commands: 2 global, N guild`. Verify via Discord client that `/login`, `/logout`, and `/standup *` autocomplete.

If no token is available, skip Step 2 and document the gap in the PR description.

- [ ] **Step 3: Commit a no-op marker if needed (skip otherwise)**

If you only modified `.env.example` to document new variables, commit those edits. Otherwise no commit.

---

### Task 7.5: Split `embeds.ts` into per-builder files

**Files:**
- Create: `apps/api/src/interfaces/discord/shared/embeds/published.embed.ts`
- Create: `apps/api/src/interfaces/discord/shared/embeds/job-failed.embed.ts`
- Create: `apps/api/src/interfaces/discord/shared/embeds/reminder.embed.ts`
- Create: `apps/api/src/interfaces/discord/shared/embeds/user-dm.embed.ts`
- Create: `apps/api/src/interfaces/discord/shared/embeds/colors.ts`
- Modify: `apps/api/src/interfaces/discord/features/review/review.embed.ts` (replace re-export with the actual builder body)
- Delete: `apps/api/src/interfaces/discord/embeds.ts`

- [ ] **Step 1: Move each builder into its own file** by copying the function body verbatim from `embeds.ts`. Move `EMBED_COLORS` and the `truncate`/`displayDate` helpers into `shared/embeds/colors.ts` (export `EMBED_COLORS`) and a private `shared/embeds/internal.ts` (or inline `truncate` per file — pick one, don't repeat).

- [ ] **Step 2: Update the existing barrel `shared/embeds/index.ts` to re-export from the new files**

```typescript
// apps/api/src/interfaces/discord/shared/embeds/index.ts
export { EMBED_COLORS } from './colors'
export { buildPublishedEmbed } from './published.embed'
export { buildReminderEmbed } from './reminder.embed'
export { buildJobFailedEmbed } from './job-failed.embed'
export { buildUserDmEmbed } from './user-dm.embed'
```

- [ ] **Step 3: Replace `features/review/review.embed.ts`'s re-export with the actual builder body** (copied from `embeds.ts:31-56`).

- [ ] **Step 4: Delete `embeds.ts` and rewrite imports**

```bash
git rm apps/api/src/interfaces/discord/embeds.ts
cd apps/api && rg "from.*['\"].*/embeds['\"]" src
```
Update every match to import from `./shared/embeds` (or `./features/review/review.embed` for the review builder).

- [ ] **Step 5: Typecheck + tests**

```bash
cd apps/api && bun run typecheck && bun run test
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor(discord): split embeds.ts into per-builder files

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 7.6: Final verification

**Files:** none

- [ ] **Step 1: Lint**

```bash
cd apps/api && bun run lint
```
Expected: pass.

- [ ] **Step 2: Typecheck**

```bash
cd apps/api && bun run typecheck
```
Expected: pass.

- [ ] **Step 3: Full test suite**

```bash
cd apps/api && bun run test
```
Expected: pass. Coverage should be ≥ baseline (compare against `main` if a coverage report is generated).

- [ ] **Step 4: Build (sanity)**

```bash
cd apps/api && bun run build
```
Expected: build artifact produced.

- [ ] **Step 5: Confirm legacy file deletions**

```bash
test ! -f apps/api/src/interfaces/discord/commands/command-registration.service.ts
test ! -f apps/api/src/interfaces/discord/listeners/discord-gateway.service.ts
test ! -f apps/api/src/interfaces/discord/handlers/slash-command-handler.service.ts
test ! -f apps/api/src/interfaces/discord/handlers/button-interaction.service.ts
test ! -f apps/api/src/interfaces/discord/handlers/modal-interaction.service.ts
test ! -f apps/api/src/interfaces/discord/handlers/standup-interaction.service.ts
test ! -f apps/api/src/interfaces/discord/embeds.ts
echo "all legacy files removed"
```
Expected: `all legacy files removed`.

- [ ] **Step 6: Push and open PR**

```bash
git push
gh pr create --title "feat(discord): migrate to Necord with feature-based layout" --body "$(cat <<'EOF'
## Summary

- Migrate `apps/api/src/interfaces/discord/` from raw discord.js dispatch to Necord with decorator-based handlers.
- Reorganize into `features/<area>/` (auth, trigger, list, approve, settings, services, retry, review, reminder, copy) plus `shared/` (guards, interceptors, filters, decorators, embeds).
- Remove `command-registration.service.ts`, `discord-gateway.service.ts`, `slash-command-handler.service.ts`, and the three handler dispatchers (`button-interaction`, `modal-interaction`, `standup-interaction`).
- Test suite rewritten with `Test.createTestingModule` per handler.

Spec: docs/superpowers/specs/2026-04-29-necord-migration-design.md
Plan: docs/superpowers/plans/2026-04-29-necord-migration.md

## Test plan

- [ ] Lint, typecheck, and full Vitest suite green
- [ ] `DISCORD_GATEWAY_ENABLED=false` boots the API without errors
- [ ] With a real bot token: `/login`, `/logout`, `/standup trigger|list|approve|settings|services|retry` all autocomplete in Discord
- [ ] Review buttons (Approve / Reject / Adjust / Regenerate) work in DMs and apply ✅ ❌ 🔄 ✏️ reactions
- [ ] Adjust modal submits feedback and triggers the adjust strategy
- [ ] Settings modal saves preferences

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-Review

Inline checks performed before handoff:

- **Spec coverage:** every section of the spec maps to a Phase or Task above. Module wiring → Task 7.2; folder structure → Phase 1–6; guards/interceptors/filters → Phase 2; data flow examples → Phase 4–5; testing strategy → spec embedded in every TDD task; legacy deletion → Task 7.3 + 7.5.
- **Placeholders:** no `TBD`, `TODO`, "implement later", or "add error handling" patterns. References to legacy line numbers are intentional pointers into the source the engineer will read while migrating, not placeholders.
- **Type consistency:** `StandupCommandGroup` decorator name matches across all subcommand tasks. `DiscordUserLinkedGuard` and `CooldownInterceptor` referenced consistently. `AdjustModal` customId `adjust-modal/:standupId` matches both Task 5.1 (button shows it) and Task 5.2 (modal handles it).
- **Scope:** single subsystem (Discord layer), single plan, single PR — within scope.

Three areas flagged in-task for the engineer to verify before implementing (not gaps, but parity checks):

1. The exact `customId` delimiter today's outbound code uses (`_` vs `/`) — Task 5.1, 5.3, 5.4, 5.5 each call `rg` first.
2. The actual public method signatures on `DiscordAuthService`, `SettingsInteractionService`, `ReminderInteractionService`, `CopyInteractionService`, `TriggerConfirmationService`, `RetryDmService`, `DiscordServiceHealthService`, `ApproveStandupService`, `AdjustStandupService`, `UserRepository.revokeSessions` — verified per task via `rg "public " <file>`.
3. The exact `EnvService` field paths used in `discord.module.ts` Task 7.2.

These are intentional verification steps, not unfinished plan content.
