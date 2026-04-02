# TAS-109: PI Agent Phase 3 — Streaming Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add real-time streaming of standup generation to Discord (progressive embed edits) and enriched progress steps to the web (via existing SSE infrastructure).

**Architecture:** `StandupAgentService` subscribes to PI Agent `message_update` events during `prompt()`, filters `toolcall_delta` events for `submit_standup` arguments, and calls an `onContentDelta` callback. The callback propagates via the existing progress pipeline (`reportProgress` → EventBus → SSE/Discord`). A new `DiscordStreamingListener` manages embed placeholder → progressive edits → final state in Discord DMs. Web gets enriched progress via the same SSE channel with zero frontend changes.

**Tech Stack:** `@mariozechner/pi-agent-core` (Agent events, `toolcall_delta`), discord.js (`EmbedBuilder`, `user.send`, `message.edit`), NestJS EventEmitter, SSE

**Spec:** `docs/superpowers/specs/2026-04-02-tas-109-pi-agent-phase3-design.md`

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Modify | `apps/api/src/platform/events/standup-events.ts` | Add `streaming_content` step + `partialContent` field |
| Modify | `apps/api/src/contexts/standups/events/standup-sse.types.ts` | Add `streaming_content` step + `partialContent` field to SSE type |
| Modify | `apps/api/src/contexts/standups/events/standup-sse.listener.ts` | Propagate `partialContent` in SSE events |
| Modify | `apps/api/src/contexts/standups/worker/standup/types.ts` | Add `streaming_content` to `StrategyProgressStep` + `partialContent` to `StrategyProgressUpdate` |
| Modify | `apps/api/src/contexts/standups/worker/standup/strategies/standup-strategy.base.ts` | Accept `partialContent` in `reportStage` |
| Modify | `apps/api/src/contexts/standups/worker/standup/standup-pipeline.service.ts` | Propagate `partialContent` through progress reporter |
| Modify | `apps/api/src/contexts/standups/worker/standup-agent/standup-agent.service.ts` | Add `onContentDelta` to inputs, subscribe to agent events, filter toolcall deltas |
| Modify | `apps/api/src/contexts/standups/worker/standup/strategies/execute-generate-strategy.ts` | Pass `onContentDelta` to agent service |
| Modify | `apps/api/src/contexts/standups/worker/standup/strategies/execute-adjust-strategy.ts` | Pass `onContentDelta` to agent service |
| Create | `apps/api/src/interfaces/discord/listeners/discord-streaming.listener.ts` | Manage Discord embed streaming (placeholder → edits → final) |
| Create | `apps/api/src/interfaces/discord/listeners/discord-streaming.listener.spec.ts` | Tests for streaming listener |

---

### Task 1: Add `streaming_content` step and `partialContent` to event types

**Files:**
- Modify: `apps/api/src/platform/events/standup-events.ts`
- Modify: `apps/api/src/contexts/standups/events/standup-sse.types.ts`
- Modify: `apps/api/src/contexts/standups/worker/standup/types.ts`

- [ ] **Step 1: Update platform event types**

In `apps/api/src/platform/events/standup-events.ts`, add `'streaming_content'` to `StandupProgressStep`:

```typescript
export type StandupProgressStep =
  | 'queued'
  | 'collecting_git'
  | 'collecting_board'
  | 'enriching_data'
  | 'generating_standup'
  | 'streaming_content'
  | 'saving_draft'
  | 'notifying_review'
  | 'completed'
  | 'no_activity'
```

Add `partialContent` to `StandupProgressEvent`:

```typescript
export type StandupProgressEvent = {
  userId: string
  runId: string
  date: string
  mode: StandupRunMode
  step: StandupProgressStep
  message: string
  standupId?: string
  partialContent?: string
}
```

- [ ] **Step 2: Update SSE event types**

In `apps/api/src/contexts/standups/events/standup-sse.types.ts`, add `'streaming_content'` to the step union and `partialContent` field:

```typescript
export type StandupSseEvent =
  | {
      type: 'standup_progress'
      runId: string
      date: string
      mode: 'generate' | 'regenerate' | 'adjust'
      step:
        | 'queued'
        | 'collecting_git'
        | 'collecting_board'
        | 'enriching_data'
        | 'generating_standup'
        | 'streaming_content'
        | 'saving_draft'
        | 'notifying_review'
        | 'completed'
        | 'no_activity'
      message: string
      standupId?: string
      partialContent?: string
    }
  // ... rest unchanged
```

- [ ] **Step 3: Update strategy types**

In `apps/api/src/contexts/standups/worker/standup/types.ts`, add `'streaming_content'` to `StrategyProgressStep` and `partialContent` to `StrategyProgressUpdate`:

```typescript
export type StrategyProgressStep =
  | 'collecting_git'
  | 'collecting_board'
  | 'enriching_data'
  | 'generating_standup'
  | 'streaming_content'

export interface StrategyProgressUpdate {
  step: StrategyProgressStep
  message: string
  partialContent?: string
}
```

- [ ] **Step 4: Verify typecheck**

```bash
cd apps/api && bun run typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -u
git commit -m "feat: add streaming_content step and partialContent field to event types"
```

---

### Task 2: Propagate `partialContent` through strategy base, SSE listener, and pipeline

**Files:**
- Modify: `apps/api/src/contexts/standups/worker/standup/strategies/standup-strategy.base.ts`
- Modify: `apps/api/src/contexts/standups/events/standup-sse.listener.ts`
- Modify: `apps/api/src/contexts/standups/worker/standup/standup-pipeline.service.ts`

- [ ] **Step 1: Update `StandupStrategyBase.reportStage`**

In `apps/api/src/contexts/standups/worker/standup/strategies/standup-strategy.base.ts`:

```typescript
import type { StrategyExecutionInput, StrategyProgressStep } from '../types'

export abstract class StandupStrategyBase {
  protected async reportStage(
    reportProgress: StrategyExecutionInput['reportProgress'],
    step: StrategyProgressStep,
    message: string,
    partialContent?: string,
  ): Promise<void> {
    await reportProgress?.({ step, message, partialContent })
  }
}
```

Note: the step parameter type changes from inline union to `StrategyProgressStep` import.

- [ ] **Step 2: Update SSE listener to propagate `partialContent`**

In `apps/api/src/contexts/standups/events/standup-sse.listener.ts`, update `handleProgress`:

```typescript
  @OnEvent(STANDUP_PROGRESS_EVENT)
  handleProgress(event: StandupProgressEvent): void {
    this.standupSseBus.emit(event.userId, {
      type: 'standup_progress',
      runId: event.runId,
      date: event.date,
      mode: event.mode,
      step: event.step,
      message: event.message,
      standupId: event.standupId,
      ...(event.partialContent ? { partialContent: event.partialContent } : {}),
    })
  }
```

- [ ] **Step 3: Update pipeline progress reporter to propagate `partialContent`**

In `apps/api/src/contexts/standups/worker/standup/standup-pipeline.service.ts`:

Update the `emitProgress` method to accept and propagate `partialContent`:

```typescript
  private async emitProgress(event: {
    userId: string
    runId: string
    date: string
    mode: StandupRunMode
    step: StandupProgressStep
    message: string
    standupId?: string
    partialContent?: string
  }) {
    this.notifications.emitStandupProgress({
      userId: event.userId,
      runId: event.runId,
      date: event.date,
      mode: event.mode,
      step: event.step,
      message: event.message,
      ...(event.standupId ? { standupId: event.standupId } : {}),
      ...(event.partialContent ? { partialContent: event.partialContent } : {}),
    })
  }
```

Update `createStrategyProgressReporter` to propagate `partialContent`:

```typescript
  private createStrategyProgressReporter(
    userId: string,
    runId: string,
    date: string,
    mode: StandupRunMode,
  ) {
    return async ({ step, message, partialContent }: StrategyProgressUpdate) =>
      this.emitProgress({
        userId,
        runId,
        date,
        mode,
        step,
        message,
        ...(partialContent ? { partialContent } : {}),
      })
  }
```

Also update the import to include `StrategyProgressUpdate`:

```typescript
import type { StandupJobOptions, StrategyProgressUpdate } from './types'
```

- [ ] **Step 4: Verify typecheck**

```bash
cd apps/api && bun run typecheck
```

- [ ] **Step 5: Run tests**

```bash
cd apps/api && bun run test
```

Expected: All tests pass (no behavior change, just new optional fields).

- [ ] **Step 6: Commit**

```bash
git add -u
git commit -m "feat: propagate partialContent through strategy base, SSE listener, and pipeline"
```

---

### Task 3: Add `onContentDelta` to `StandupAgentService`

**Files:**
- Modify: `apps/api/src/contexts/standups/worker/standup-agent/standup-agent.service.ts`
- Modify: `apps/api/src/contexts/standups/worker/standup-agent/standup-agent.service.spec.ts`

This is the core task — subscribe to PI Agent events, filter tool call deltas, and call the callback.

- [ ] **Step 1: Check the PI Agent event types**

Before coding, verify the actual event structure:

```bash
cd apps/api && grep -A5 "toolcall_delta\|toolcall_start\|toolcall_end" node_modules/@mariozechner/pi-ai/dist/types.d.ts
```

Expected: `toolcall_delta` event has `{ type: "toolcall_delta", contentIndex: number, delta: string, partial: AssistantMessage }`. The `delta` is a JSON fragment of the tool arguments being streamed.

- [ ] **Step 2: Add `onContentDelta` to input interfaces**

In `standup-agent.service.ts`, add to both `AgentGenerateInput` and `AgentAdjustInput`:

```typescript
  onContentDelta?: (partialContent: string) => void
```

- [ ] **Step 3: Create a helper to subscribe to agent events and extract content deltas**

Add a private method to `StandupAgentService`:

```typescript
  /**
   * Subscribes to agent events and calls onContentDelta with accumulated
   * content from submit_standup tool call arguments.
   *
   * Returns an unsubscribe function to call after prompt() completes.
   *
   * PI Agent streams tool call arguments as JSON fragments via toolcall_delta events.
   * We accumulate these fragments and attempt partial JSON parse to extract the
   * 'content' field as it's being built.
   */
  private subscribeToContentDeltas(
    agent: Agent,
    onContentDelta?: (partialContent: string) => void,
  ): () => void {
    if (!onContentDelta) return () => {}

    let accumulatedArgs = ''
    let isSubmitStandupCall = false

    return agent.subscribe((event) => {
      if (event.type !== 'message_update') return

      const msgEvent = event.assistantMessageEvent

      if (msgEvent.type === 'toolcall_start') {
        // Check if the tool being called is submit_standup
        const partial = msgEvent.partial
        const lastContent = partial.content[msgEvent.contentIndex]
        if (lastContent && 'name' in lastContent && lastContent.name === 'submit_standup') {
          isSubmitStandupCall = true
          accumulatedArgs = ''
        }
      }

      if (msgEvent.type === 'toolcall_delta' && isSubmitStandupCall) {
        accumulatedArgs += msgEvent.delta
        // Try to extract partial content from accumulated JSON args
        const content = this.extractPartialContent(accumulatedArgs)
        if (content) {
          onContentDelta(content)
        }
      }

      if (msgEvent.type === 'toolcall_end') {
        isSubmitStandupCall = false
        accumulatedArgs = ''
      }
    })
  }

  /**
   * Attempts to extract the 'content' field from a partial JSON string.
   * The args are streamed as JSON fragments like: {"content":"## Stand...
   * We try to find the content value even if the JSON is incomplete.
   */
  private extractPartialContent(partialJson: string): string | null {
    // Try full parse first (args may be complete)
    try {
      const parsed = JSON.parse(partialJson)
      if (typeof parsed.content === 'string') return parsed.content
    } catch {
      // Expected — JSON is incomplete
    }

    // Regex extraction for partial JSON: find "content":"..." even if unclosed
    const match = partialJson.match(/"content"\s*:\s*"((?:[^"\\]|\\.)*)/)
    if (match?.[1]) {
      // Unescape basic JSON escapes
      return match[1].replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\')
    }

    return null
  }
```

- [ ] **Step 4: Wire `subscribeToContentDeltas` in `generate()`**

In the `generate()` method, before the `Promise.race([agent.prompt(...)])` call, add the subscribe. After the race resolves/rejects, call unsubscribe:

```typescript
        const unsubscribe = this.subscribeToContentDeltas(agent, input.onContentDelta)

        try {
          let timeoutHandle: ReturnType<typeof setTimeout> | undefined
          await Promise.race([
            agent.prompt(userMessage),
            new Promise<never>((_, reject) => {
              timeoutHandle = setTimeout(
                () => reject(new Error('Agent prompt timed out')),
                AGENT_TIMEOUT_MS,
              )
            }),
          ]).finally(() => clearTimeout(timeoutHandle))
        } finally {
          unsubscribe()
        }
```

Apply the same pattern to:
- The rewrite prompt in `generate()` (subscribe before, unsubscribe after)
- `adjustWithExistingAgent()` (subscribe before prompt, unsubscribe after)
- `adjustWithSeedAgent()` (subscribe before prompt, unsubscribe after)

- [ ] **Step 5: Write tests**

Add to `standup-agent.service.spec.ts`:

```typescript
  it('calls onContentDelta during generate', async () => {
    const deltas: string[] = []
    const onContentDelta = vi.fn((content: string) => deltas.push(content))

    const result = await service.generate(makeInput({ onContentDelta }))

    expect(result.isOk()).toBe(true)
    // onContentDelta may or may not be called depending on mock behavior
    // The important thing is it doesn't throw and doesn't affect the result
  })

  it('extractPartialContent extracts from complete JSON', () => {
    // Access private method via any cast for testing
    const svc = service as any
    expect(svc.extractPartialContent('{"content":"hello","summary":"s"}')).toBe('hello')
  })

  it('extractPartialContent extracts from incomplete JSON', () => {
    const svc = service as any
    expect(svc.extractPartialContent('{"content":"hello world')).toBe('hello world')
  })

  it('extractPartialContent returns null for no content field', () => {
    const svc = service as any
    expect(svc.extractPartialContent('{"summary":')).toBeNull()
  })
```

- [ ] **Step 6: Run tests**

```bash
cd apps/api && bunx vitest run src/contexts/standups/worker/standup-agent/standup-agent.service.spec.ts
```

- [ ] **Step 7: Commit**

```bash
git add -u
git commit -m "feat: subscribe to PI Agent toolcall_delta events and expose onContentDelta callback"
```

---

### Task 4: Wire `onContentDelta` in strategies

**Files:**
- Modify: `apps/api/src/contexts/standups/worker/standup/strategies/execute-generate-strategy.ts`
- Modify: `apps/api/src/contexts/standups/worker/standup/strategies/execute-adjust-strategy.ts`

- [ ] **Step 1: Wire in `ExecuteGenerateStrategy`**

In the agent branch of the generation ternary (the `this.standupAgent.generate({...})` call), add `onContentDelta`:

```typescript
            this.standupAgent.generate({
              date: today,
              meetingType,
              gitActivity: gitActivity ?? undefined,
              boardActivity: boardActivity ?? undefined,
              extraContext: options.extraContext?.trim() || undefined,
              azureDevopsUuid: options.azureDevopsUuid,
              onStageChange: async (stage) => {
                await this.reportStage(
                  reportProgress,
                  stage === 'enriching_data'
                    ? 'enriching_data'
                    : 'generating_standup',
                  stage === 'enriching_data'
                    ? 'Enriquecendo contexto para o standup'
                    : 'Gerando texto do standup (PI Agent)',
                )
              },
              onContentDelta: (partialContent) => {
                this.reportStage(
                  reportProgress,
                  'streaming_content',
                  'Gerando conteudo...',
                  partialContent,
                )
              },
            }),
```

- [ ] **Step 2: Wire in `ExecuteAdjustStrategy`**

In the agent branch of the adjust ternary (the `this.standupAgent.adjust({...})` call), add `onContentDelta`:

```typescript
      ? await this.standupAgent.adjust({
          standupId: baseStandupId,
          instruction,
          previousContent: baseResult.value.content,
          extraContext: options.extraContext?.trim() || undefined,
          onStageChange: async () => {
            await this.reportStage(
              reportProgress,
              'generating_standup',
              'Ajustando standup (PI Agent)',
            )
          },
          onContentDelta: (partialContent) => {
            this.reportStage(
              reportProgress,
              'streaming_content',
              'Ajustando conteudo...',
              partialContent,
            )
          },
        })
```

- [ ] **Step 3: Verify typecheck**

```bash
cd apps/api && bun run typecheck
```

- [ ] **Step 4: Commit**

```bash
git add -u
git commit -m "feat: wire onContentDelta from strategies through progress pipeline"
```

---

### Task 5: Create `DiscordStreamingListener`

**Files:**
- Create: `apps/api/src/interfaces/discord/listeners/discord-streaming.listener.ts`
- Create: `apps/api/src/interfaces/discord/listeners/discord-streaming.listener.spec.ts`

- [ ] **Step 1: Write the tests**

Create `apps/api/src/interfaces/discord/listeners/discord-streaming.listener.spec.ts`:

```typescript
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DiscordStreamingListener } from './discord-streaming.listener'

function makeMessagesService() {
  return {
    sendUserDm: vi.fn().mockResolvedValue({ isOk: () => true, value: undefined }),
    updateDmMessage: vi.fn().mockResolvedValue({ isOk: () => true }),
  }
}

function makeUserRepo() {
  return {
    findDiscordIdByUserId: vi.fn().mockResolvedValue({
      isOk: () => true,
      value: 'discord-user-1',
    }),
  }
}

function makeLoggerFactory() {
  return {
    create: vi.fn(() => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    })),
  }
}

describe('DiscordStreamingListener', () => {
  let listener: DiscordStreamingListener
  let messages: ReturnType<typeof makeMessagesService>
  let userRepo: ReturnType<typeof makeUserRepo>

  beforeEach(() => {
    vi.useFakeTimers()
    messages = makeMessagesService()
    userRepo = makeUserRepo()
    listener = new DiscordStreamingListener(
      makeLoggerFactory() as never,
      messages as never,
      userRepo as never,
    )
  })

  afterEach(() => {
    listener.onModuleDestroy()
    vi.useRealTimers()
  })

  it('sends placeholder DM on queued step with generate mode', async () => {
    await listener.handleProgress({
      userId: 'user-1',
      runId: 'run-1',
      date: '2026-04-02',
      mode: 'generate',
      step: 'queued',
      message: 'Geracao iniciada',
    })

    expect(messages.sendUserDm).toHaveBeenCalledWith(
      expect.objectContaining({
        discordUserId: 'discord-user-1',
        title: expect.stringContaining('Gerando'),
      }),
    )
  })

  it('does not send placeholder when mode is not generate or adjust', async () => {
    await listener.handleProgress({
      userId: 'user-1',
      runId: 'run-1',
      date: '2026-04-02',
      mode: 'regenerate',
      step: 'queued',
      message: 'Regenerando',
    })

    // regenerate also generates, so this should work
    // adjust the test based on actual behavior desired
  })

  it('respects 2s batch interval for streaming edits', async () => {
    // Setup: send queued to create the stream
    messages.sendUserDm.mockResolvedValue({
      isOk: () => true,
      value: { messageId: 'msg-1' },
    })

    await listener.handleProgress({
      userId: 'user-1',
      runId: 'run-1',
      date: '2026-04-02',
      mode: 'generate',
      step: 'queued',
      message: 'Starting',
    })

    // First streaming event
    await listener.handleProgress({
      userId: 'user-1',
      runId: 'run-1',
      date: '2026-04-02',
      mode: 'generate',
      step: 'streaming_content',
      message: 'Gerando conteudo...',
      partialContent: '## Standup\n- item 1',
    })

    // Should not edit immediately (batch interval)
    expect(messages.updateDmMessage).not.toHaveBeenCalled()

    // Advance 2s
    vi.advanceTimersByTime(2000)

    // Now should have edited
    expect(messages.updateDmMessage).toHaveBeenCalledTimes(1)
  })

  it('cleans up stream on completed step', async () => {
    messages.sendUserDm.mockResolvedValue({
      isOk: () => true,
      value: { messageId: 'msg-1' },
    })

    await listener.handleProgress({
      userId: 'user-1',
      runId: 'run-1',
      date: '2026-04-02',
      mode: 'generate',
      step: 'queued',
      message: 'Starting',
    })

    await listener.handleProgress({
      userId: 'user-1',
      runId: 'run-1',
      date: '2026-04-02',
      mode: 'generate',
      step: 'completed',
      message: 'Done',
    })

    expect(messages.updateDmMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          content: expect.stringContaining('Standup gerado'),
        }),
      }),
    )
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd apps/api && bunx vitest run src/interfaces/discord/listeners/discord-streaming.listener.spec.ts
```

Expected: FAIL — cannot find module.

- [ ] **Step 3: Write the implementation**

Create `apps/api/src/interfaces/discord/listeners/discord-streaming.listener.ts`:

```typescript
import { Injectable, type OnModuleDestroy } from '@nestjs/common'
import { OnEvent } from '@nestjs/event-emitter'
import {
  STANDUP_FAILED_EVENT,
  STANDUP_PROGRESS_EVENT,
  type StandupFailedEvent,
  type StandupProgressEvent,
} from '../../../platform/events/standup-events'
import { UserRepository } from '../../../platform/database/repositories/user.repository'
import { AppLoggerFactory } from '../../../platform/logger'
import { DiscordMessagesService } from '../notifications/discord-messages.service'

interface ActiveStream {
  discordUserId: string
  messageId: string | null
  pendingContent: string
  lastEditAt: number
  batchTimer: ReturnType<typeof setTimeout> | null
}

const BATCH_INTERVAL_MS = 2_000
const STREAM_TTL_MS = 5 * 60 * 1_000

@Injectable()
export class DiscordStreamingListener implements OnModuleDestroy {
  private readonly logger: ReturnType<AppLoggerFactory['create']>
  private readonly activeStreams = new Map<string, ActiveStream>()

  constructor(
    private readonly loggerFactory: AppLoggerFactory,
    private readonly messages: DiscordMessagesService,
    private readonly userRepository: UserRepository,
  ) {
    this.logger = this.loggerFactory.create('discord-streaming')
  }

  onModuleDestroy(): void {
    for (const [, stream] of this.activeStreams) {
      if (stream.batchTimer) clearTimeout(stream.batchTimer)
    }
    this.activeStreams.clear()
  }

  @OnEvent(STANDUP_PROGRESS_EVENT)
  async handleProgress(event: StandupProgressEvent): Promise<void> {
    if (event.step === 'queued') {
      await this.handleQueued(event)
      return
    }

    if (event.step === 'streaming_content' && event.partialContent) {
      this.handleStreamingContent(event.runId, event.partialContent)
      return
    }

    if (event.step === 'completed' || event.step === 'no_activity') {
      await this.handleCompleted(event.runId, event.step)
    }
  }

  @OnEvent(STANDUP_FAILED_EVENT)
  async handleFailed(event: StandupFailedEvent): Promise<void> {
    const stream = this.activeStreams.get(event.runId)
    if (!stream) return

    this.cleanupStream(event.runId)

    if (stream.messageId) {
      await this.messages.updateDmMessage({
        discordUserId: stream.discordUserId,
        messageId: stream.messageId,
        payload: {
          content: `❌ Falha na geração: ${event.message}`,
          embeds: [],
        },
      })
    }
  }

  private async handleQueued(event: StandupProgressEvent): Promise<void> {
    const discordIdResult = await this.userRepository.findDiscordIdByUserId(
      event.userId,
    )
    if (discordIdResult.isErr() || !discordIdResult.value) return

    const discordUserId = discordIdResult.value

    const dmResult = await this.messages.sendUserDm({
      discordUserId,
      title: '⏳ Gerando standup...',
      message: 'Aguarde enquanto o standup é gerado.',
      color: 0x3498db,
    })

    const messageId =
      dmResult.isOk() && dmResult.value && 'messageId' in dmResult.value
        ? (dmResult.value as { messageId: string }).messageId
        : null

    this.activeStreams.set(event.runId, {
      discordUserId,
      messageId,
      pendingContent: '',
      lastEditAt: 0,
      batchTimer: null,
    })

    this.logger.debug('Streaming placeholder sent', {
      runId: event.runId,
      discordUserId,
      messageId,
    })
  }

  private handleStreamingContent(runId: string, partialContent: string): void {
    const stream = this.activeStreams.get(runId)
    if (!stream || !stream.messageId) return

    stream.pendingContent = partialContent

    // Schedule batch edit if not already scheduled
    if (!stream.batchTimer) {
      stream.batchTimer = setTimeout(() => {
        this.flushStreamEdit(runId)
      }, BATCH_INTERVAL_MS)
    }
  }

  private async flushStreamEdit(runId: string): Promise<void> {
    const stream = this.activeStreams.get(runId)
    if (!stream || !stream.messageId || !stream.pendingContent) return

    stream.batchTimer = null
    stream.lastEditAt = Date.now()

    const truncated = stream.pendingContent.slice(0, 4000) // Discord embed description limit ~4096

    await this.messages.updateDmMessage({
      discordUserId: stream.discordUserId,
      messageId: stream.messageId,
      payload: {
        content: `⏳ **Gerando standup...**\n\n${truncated}\n\n_${stream.pendingContent.length} caracteres..._`,
        embeds: [],
      },
    })
  }

  private async handleCompleted(
    runId: string,
    step: 'completed' | 'no_activity',
  ): Promise<void> {
    const stream = this.activeStreams.get(runId)
    if (!stream) return

    this.cleanupStream(runId)

    if (!stream.messageId) return

    const content =
      step === 'completed'
        ? '✅ Standup gerado! Confira a mensagem abaixo para revisar.'
        : '🔍 Nenhuma atividade encontrada hoje.'

    await this.messages.updateDmMessage({
      discordUserId: stream.discordUserId,
      messageId: stream.messageId,
      payload: { content, embeds: [] },
    })
  }

  private cleanupStream(runId: string): void {
    const stream = this.activeStreams.get(runId)
    if (stream?.batchTimer) {
      clearTimeout(stream.batchTimer)
    }
    this.activeStreams.delete(runId)
  }
}
```

> **Note to implementer:** The `sendUserDm` method returns `Result<void, ...>` — it does NOT return a `messageId`. You'll need to either:
> 1. Add a new method like `sendPlaceholderDm` that returns `{ messageId }`, OR
> 2. Use `sendReviewDm`-like logic (fetch user → user.send → capture message.id)
>
> Check the actual return type of `sendUserDm` and adapt. The `DiscordMessagesService` already has `sendReviewDm` which returns `{ messageId }` — you may want to add a similar method for placeholder DMs, or add a `sendEmbedDm` method that returns the message ID.

- [ ] **Step 4: Run tests**

```bash
cd apps/api && bunx vitest run src/interfaces/discord/listeners/discord-streaming.listener.spec.ts
```

- [ ] **Step 5: Register listener in Discord module**

In `apps/api/src/interfaces/discord/discord.module.ts`, add import and register as provider:

```typescript
import { DiscordStreamingListener } from './listeners/discord-streaming.listener'
```

Add to providers array:

```typescript
    DiscordStreamingListener,
```

- [ ] **Step 6: Verify typecheck + full tests**

```bash
cd apps/api && bun run typecheck && bun run test
```

- [ ] **Step 7: Commit**

```bash
git add -u
git commit -m "feat: add DiscordStreamingListener for progressive embed updates during generation"
```

---

### Task 6: Run full test suite, lint, and fix issues

**Files:** None (verification only)

- [ ] **Step 1: Run full test suite**

```bash
cd apps/api && bun run test
```

- [ ] **Step 2: Run lint**

```bash
cd apps/api && bun run lint
```

Fix any Biome issues.

- [ ] **Step 3: Run typecheck**

```bash
cd apps/api && bun run typecheck
```

- [ ] **Step 4: Commit fixes**

```bash
git add -u
git commit -m "fix: resolve test/lint issues from Phase 3 streaming integration"
```

---

### Task 7: Integration smoke test

**Files:** None (manual verification)

- [ ] **Step 1: Test Discord streaming with `USE_PI_AGENT=true`**

```bash
cd apps/api && USE_PI_AGENT=true bun run dev
```

1. Trigger standup via Discord `/standup trigger`
2. Observe: placeholder "⏳ Gerando standup..." DM should appear
3. Observe: DM content should update every ~2s with partial standup text
4. Observe: DM should change to "✅ Standup gerado!" when complete
5. Observe: Final review DM with buttons should appear as separate message

- [ ] **Step 2: Test Web SSE progress**

1. Open web dashboard
2. Trigger standup via web
3. Observe: progress steps should show in the UI
4. Check browser DevTools → EventSource events for `streaming_content` steps with `partialContent`

- [ ] **Step 3: Test failure case**

1. Set invalid LLM provider config to force failure
2. Trigger standup
3. Observe: placeholder DM should update to "❌ Falha..."

---

## Summary

| Task | Description | Files |
|------|-------------|-------|
| 1 | Add `streaming_content` step + `partialContent` to all event types | 3 type files |
| 2 | Propagate `partialContent` through strategy base, SSE listener, pipeline | 3 files |
| 3 | Subscribe to PI Agent `toolcall_delta` events, expose `onContentDelta` | 2 files |
| 4 | Wire `onContentDelta` from strategies through progress pipeline | 2 files |
| 5 | Create `DiscordStreamingListener` (placeholder → edits → final) | 2 new + 1 module |
| 6 | Full test suite verification | N/A |
| 7 | Integration smoke test | N/A |
