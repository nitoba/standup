# TAS-109: PI Agent Phase 2 — Multi-turn Sessions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add stateful agent sessions so that "Ajustar texto" accumulates context across multiple adjustments via PI Agent multi-turn conversations.

**Architecture:** New `AgentSessionManager` (in-memory Map with TTL) owns agent lifecycle. `StandupAgentService` gains an `adjust()` method that reuses existing sessions or creates seed agents. `ExecuteGenerateStrategy` preserves agent instances after generation. `ExecuteAdjustStrategy` branches on `USE_PI_AGENT`. Sessions are destroyed on approve/reject/regenerate/TTL.

**Tech Stack:** `@mariozechner/pi-agent-core` (Agent, AgentMessage), NestJS DI, Vitest

**Spec:** `docs/superpowers/specs/2026-04-02-tas-109-pi-agent-phase2-design.md`

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `apps/api/src/contexts/standups/worker/standup-agent/agent-session-manager.ts` | In-memory session store with TTL + cleanup interval |
| Create | `apps/api/src/contexts/standups/worker/standup-agent/agent-session-manager.spec.ts` | Tests for session manager |
| Create | `apps/api/src/contexts/standups/worker/standup-agent/build-seed-messages.ts` | Build artificial message history for seeding an agent from existing standup content |
| Create | `apps/api/src/contexts/standups/worker/standup-agent/build-seed-messages.spec.ts` | Tests for seed message builder |
| Modify | `apps/api/src/contexts/standups/worker/standup-agent/standup-agent.service.ts` | Add `adjust()` method, change `generate()` to return agent instance |
| Modify | `apps/api/src/contexts/standups/worker/standup-agent/standup-agent.service.spec.ts` | Tests for new adjust method |
| Modify | `apps/api/src/contexts/standups/worker/standup-agent/standup-agent.module.ts` | Register `AgentSessionManager` |
| Modify | `apps/api/src/contexts/standups/worker/standup/types.ts:35-40` | Add optional `agent` field to `GeneratedContent` |
| Modify | `apps/api/src/contexts/standups/worker/standup/standup-pipeline.service.ts:103-115` | Create session after saving standup |
| Modify | `apps/api/src/contexts/standups/worker/standup/strategies/execute-generate-strategy.ts:180-249` | Destroy old session on regenerate, pass agent in result |
| Modify | `apps/api/src/contexts/standups/worker/standup/strategies/execute-adjust-strategy.ts` | Branch on `USE_PI_AGENT`, call `StandupAgentService.adjust()` |
| Modify | `apps/api/src/interfaces/discord/handlers/standup-interaction.service.ts:95-220` | Destroy session on approve/reject |

---

### Task 1: Create `AgentSessionManager`

**Files:**
- Create: `apps/api/src/contexts/standups/worker/standup-agent/agent-session-manager.ts`
- Create: `apps/api/src/contexts/standups/worker/standup-agent/agent-session-manager.spec.ts`

- [ ] **Step 1: Write the failing tests**

Create `apps/api/src/contexts/standups/worker/standup-agent/agent-session-manager.spec.ts`:

```typescript
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AgentSessionManager } from './agent-session-manager'

describe('AgentSessionManager', () => {
  let manager: AgentSessionManager

  beforeEach(() => {
    vi.useFakeTimers()
    manager = new AgentSessionManager()
  })

  afterEach(() => {
    manager.onModuleDestroy()
    vi.useRealTimers()
  })

  it('creates and retrieves a session', () => {
    const fakeAgent = { state: { messages: [] } } as never
    manager.create('standup-1', fakeAgent)

    const result = manager.get('standup-1')
    expect(result).toBe(fakeAgent)
  })

  it('returns null for nonexistent session', () => {
    expect(manager.get('nonexistent')).toBeNull()
  })

  it('returns null and removes session after TTL expires', () => {
    const fakeAgent = { state: { messages: [] } } as never
    manager.create('standup-1', fakeAgent)

    vi.advanceTimersByTime(31 * 60 * 1000) // 31 min > 30 min TTL

    expect(manager.get('standup-1')).toBeNull()
    expect(manager.has('standup-1')).toBe(false)
  })

  it('resets TTL on get()', () => {
    const fakeAgent = { state: { messages: [] } } as never
    manager.create('standup-1', fakeAgent)

    vi.advanceTimersByTime(20 * 60 * 1000) // 20 min
    manager.get('standup-1') // reset TTL

    vi.advanceTimersByTime(20 * 60 * 1000) // 20 more min (40 total, but only 20 since last access)

    expect(manager.get('standup-1')).toBe(fakeAgent) // still alive
  })

  it('destroys a session', () => {
    const fakeAgent = { state: { messages: [] } } as never
    manager.create('standup-1', fakeAgent)
    manager.destroy('standup-1')

    expect(manager.get('standup-1')).toBeNull()
  })

  it('destroy is idempotent for nonexistent session', () => {
    expect(() => manager.destroy('nonexistent')).not.toThrow()
  })

  it('has() returns true for active session', () => {
    const fakeAgent = { state: { messages: [] } } as never
    manager.create('standup-1', fakeAgent)
    expect(manager.has('standup-1')).toBe(true)
  })

  it('has() returns false for expired session', () => {
    const fakeAgent = { state: { messages: [] } } as never
    manager.create('standup-1', fakeAgent)
    vi.advanceTimersByTime(31 * 60 * 1000)
    expect(manager.has('standup-1')).toBe(false)
  })

  it('cleanup interval removes expired sessions', () => {
    const fakeAgent = { state: { messages: [] } } as never
    manager.create('standup-1', fakeAgent)
    manager.create('standup-2', fakeAgent)

    manager.onModuleInit() // starts cleanup interval

    vi.advanceTimersByTime(31 * 60 * 1000) // expire both
    vi.advanceTimersByTime(5 * 60 * 1000) // trigger cleanup interval

    expect(manager.has('standup-1')).toBe(false)
    expect(manager.has('standup-2')).toBe(false)
  })

  it('create overwrites existing session for same standupId', () => {
    const agent1 = { id: 1 } as never
    const agent2 = { id: 2 } as never
    manager.create('standup-1', agent1)
    manager.create('standup-1', agent2)

    expect(manager.get('standup-1')).toBe(agent2)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd apps/api && bunx vitest run src/contexts/standups/worker/standup-agent/agent-session-manager.spec.ts
```

Expected: FAIL — cannot find module `./agent-session-manager`.

- [ ] **Step 3: Write the implementation**

Create `apps/api/src/contexts/standups/worker/standup-agent/agent-session-manager.ts`:

```typescript
import type { Agent } from '@mariozechner/pi-agent-core'
import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common'

interface AgentSession {
  agent: Agent
  lastAccessedAt: number
}

const SESSION_TTL_MS = 30 * 60 * 1000 // 30 minutes
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000 // 5 minutes

@Injectable()
export class AgentSessionManager implements OnModuleInit, OnModuleDestroy {
  private readonly sessions = new Map<string, AgentSession>()
  private cleanupInterval: ReturnType<typeof setInterval> | null = null

  onModuleInit(): void {
    this.cleanupInterval = setInterval(
      () => this.removeExpiredSessions(),
      CLEANUP_INTERVAL_MS,
    )
  }

  onModuleDestroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
      this.cleanupInterval = null
    }
    this.sessions.clear()
  }

  create(standupId: string, agent: Agent): void {
    this.sessions.set(standupId, {
      agent,
      lastAccessedAt: Date.now(),
    })
  }

  get(standupId: string): Agent | null {
    const session = this.sessions.get(standupId)
    if (!session) return null

    if (Date.now() - session.lastAccessedAt > SESSION_TTL_MS) {
      this.sessions.delete(standupId)
      return null
    }

    session.lastAccessedAt = Date.now()
    return session.agent
  }

  destroy(standupId: string): void {
    this.sessions.delete(standupId)
  }

  has(standupId: string): boolean {
    return this.get(standupId) !== null
  }

  private removeExpiredSessions(): void {
    const now = Date.now()
    for (const [id, session] of this.sessions) {
      if (now - session.lastAccessedAt > SESSION_TTL_MS) {
        this.sessions.delete(id)
      }
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd apps/api && bunx vitest run src/contexts/standups/worker/standup-agent/agent-session-manager.spec.ts
```

Expected: PASS — all 10 tests green.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/contexts/standups/worker/standup-agent/agent-session-manager.ts apps/api/src/contexts/standups/worker/standup-agent/agent-session-manager.spec.ts
git commit -m "feat: add AgentSessionManager with TTL and cleanup interval"
```

---

### Task 2: Create `buildSeedMessages`

**Files:**
- Create: `apps/api/src/contexts/standups/worker/standup-agent/build-seed-messages.ts`
- Create: `apps/api/src/contexts/standups/worker/standup-agent/build-seed-messages.spec.ts`

This builds artificial message history so an agent seeded from existing standup content has context for adjustments.

- [ ] **Step 1: Write the failing tests**

Create `apps/api/src/contexts/standups/worker/standup-agent/build-seed-messages.spec.ts`:

```typescript
import { describe, expect, it } from 'vitest'
import { buildSeedMessages } from './build-seed-messages'

describe('buildSeedMessages', () => {
  it('returns user, assistant (with tool call), and toolResult messages', () => {
    const messages = buildSeedMessages({
      content: '## Standup\n- item 1',
      summary: 'Did item 1',
    })

    expect(messages).toHaveLength(3)
    expect(messages[0].role).toBe('user')
    expect(messages[1].role).toBe('assistant')
    expect(messages[2].role).toBe('toolResult')
  })

  it('assistant message contains submit_standup tool call with correct args', () => {
    const messages = buildSeedMessages({
      content: 'my content',
      summary: 'my summary',
    })

    const assistant = messages[1]
    expect(assistant.role).toBe('assistant')
    if (assistant.role !== 'assistant') return

    const toolCall = assistant.content.find(
      (block: { type: string }) => block.type === 'toolCall',
    )
    expect(toolCall).toBeDefined()
    expect((toolCall as { name: string }).name).toBe('submit_standup')
    expect((toolCall as { arguments: Record<string, unknown> }).arguments).toEqual({
      content: 'my content',
      summary: 'my summary',
    })
  })

  it('toolResult references the tool call id', () => {
    const messages = buildSeedMessages({
      content: 'c',
      summary: 's',
    })

    const assistant = messages[1]
    const toolResult = messages[2]

    if (assistant.role !== 'assistant' || toolResult.role !== 'toolResult') return

    const toolCall = assistant.content.find(
      (block: { type: string }) => block.type === 'toolCall',
    ) as { id: string }
    expect(toolResult.toolCallId).toBe(toolCall.id)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd apps/api && bunx vitest run src/contexts/standups/worker/standup-agent/build-seed-messages.spec.ts
```

Expected: FAIL — cannot find module `./build-seed-messages`.

- [ ] **Step 3: Write the implementation**

Create `apps/api/src/contexts/standups/worker/standup-agent/build-seed-messages.ts`:

```typescript
import type { Message } from '@mariozechner/pi-ai'

/**
 * Builds artificial message history to seed an agent with existing standup content.
 * This simulates a conversation where the agent generated the standup,
 * giving it context for subsequent adjustments.
 */
export function buildSeedMessages(standup: {
  content: string
  summary?: string
}): Message[] {
  const toolCallId = 'seed-tool-call'
  const now = Date.now()

  const userMessage: Message = {
    role: 'user',
    content: 'Generate the standup report based on the activity data provided.',
    timestamp: now,
  }

  const assistantMessage: Message = {
    role: 'assistant',
    content: [
      {
        type: 'toolCall',
        id: toolCallId,
        name: 'submit_standup',
        arguments: {
          content: standup.content,
          summary: standup.summary ?? '',
        },
      },
    ],
    api: 'chat-completions' as never,
    provider: 'seed' as never,
    model: 'seed',
    usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0, cost: 0 },
    stopReason: 'toolCall',
    timestamp: now,
  }

  const toolResultMessage: Message = {
    role: 'toolResult',
    toolCallId,
    toolName: 'submit_standup',
    content: [{ type: 'text', text: 'Standup submitted successfully.' }],
    isError: false,
    timestamp: now,
  }

  return [userMessage, assistantMessage, toolResultMessage]
}
```

> **Note to implementer:** The exact field values for `api`, `provider`, `usage`, and `stopReason` on `AssistantMessage` must satisfy the type constraints from `@mariozechner/pi-ai`. Check the actual types after installing. The key fields the LLM sees are `role`, `content`, and the tool call structure — the metadata fields are for bookkeeping and can use placeholder values. Adapt casts as needed.

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd apps/api && bunx vitest run src/contexts/standups/worker/standup-agent/build-seed-messages.spec.ts
```

Expected: PASS — all 3 tests green.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/contexts/standups/worker/standup-agent/build-seed-messages.ts apps/api/src/contexts/standups/worker/standup-agent/build-seed-messages.spec.ts
git commit -m "feat: add buildSeedMessages for seeding agent from existing standup"
```

---

### Task 3: Add `adjust()` method to `StandupAgentService`

**Files:**
- Modify: `apps/api/src/contexts/standups/worker/standup-agent/standup-agent.service.ts`
- Modify: `apps/api/src/contexts/standups/worker/standup-agent/standup-agent.service.spec.ts`

- [ ] **Step 1: Add the `AgentAdjustInput` interface and update `generate()` return type**

In `standup-agent.service.ts`, add after the `AgentGenerateInput` interface:

```typescript
export interface AgentAdjustInput {
  standupId: string
  instruction: string
  previousContent: string
  previousSummary?: string
  extraContext?: string
  onStageChange?: (stage: GeneratorStage) => Promise<void> | void
}

export interface AgentGenerateResult extends GeneratedStandup {
  agent: Agent
}
```

Change the `generate()` return type from `Result<GeneratedStandup, ...>` to `Result<AgentGenerateResult, ...>`. Update the return statements to include `agent`:

Where `generate()` returns `Result.ok(...)`, include the `agent` instance:

```typescript
// After successful extraction (both normal and rewrite paths):
return Result.ok({ content: ..., summary: ..., agent })
```

- [ ] **Step 2: Add the `adjust()` method**

Add to `StandupAgentService`, after the `generate()` method:

```typescript
  async adjust(
    input: AgentAdjustInput,
  ): Promise<
    Result<
      GeneratedStandup,
      ExternalServiceError | AllProvidersUnavailableError
    >
  > {
    await input.onStageChange?.('generating_standup')

    const existingAgent = this.sessionManager.get(input.standupId)

    if (existingAgent) {
      return this.adjustWithExistingAgent(existingAgent, input)
    }

    return this.adjustWithSeedAgent(input)
  }

  private async adjustWithExistingAgent(
    agent: Agent,
    input: AgentAdjustInput,
  ): Promise<
    Result<
      GeneratedStandup,
      ExternalServiceError | AllProvidersUnavailableError
    >
  > {
    const adjustPrompt = input.extraContext
      ? `${input.instruction}\n\nContexto adicional: ${input.extraContext}`
      : input.instruction

    try {
      let timeoutHandle: ReturnType<typeof setTimeout> | undefined
      await Promise.race([
        agent.prompt(adjustPrompt),
        new Promise<never>((_, reject) => {
          timeoutHandle = setTimeout(
            () => reject(new Error('Agent adjust timed out')),
            AGENT_TIMEOUT_MS,
          )
        }),
      ]).finally(() => clearTimeout(timeoutHandle))

      const result = extractSubmitStandupResult(agent.state.messages)
      if (!result) {
        return Result.err(
          new ExternalServiceError({
            service: 'pi-agent',
            message: 'Agent did not call submit_standup tool during adjust',
          }),
        )
      }

      return Result.ok({
        content:
          result.content.length > MAX_STANDUP_CONTENT_CHARS
            ? result.content.slice(0, MAX_STANDUP_CONTENT_CHARS)
            : result.content,
        summary: result.summary,
      })
    } catch (error) {
      return Result.err(
        new ExternalServiceError({
          service: 'pi-agent',
          message: `Agent adjust failed: ${error instanceof Error ? error.message : String(error)}`,
        }),
      )
    }
  }

  private async adjustWithSeedAgent(
    input: AgentAdjustInput,
  ): Promise<
    Result<
      GeneratedStandup,
      ExternalServiceError | AllProvidersUnavailableError
    >
  > {
    const systemPrompt = this.standupPrompt.buildSystemPrompt({
      hasGit: true,
      hasBoard: false,
    })

    const seedMessages = buildSeedMessages({
      content: input.previousContent,
      summary: input.previousSummary,
    })

    const adjustPrompt = input.extraContext
      ? `${input.instruction}\n\nContexto adicional: ${input.extraContext}`
      : input.instruction

    const totalModels = this.llmRegistry.totalModels
    let lastError: unknown

    for (let i = 0; i < totalModels; i++) {
      let selection: ReturnType<LlmProviderRegistry['getNextModel']>
      try {
        selection = this.llmRegistry.getNextModel()
      } catch (error) {
        if (error instanceof AllProvidersUnavailableError) {
          return Result.err(error)
        }
        throw error
      }

      const { modelKey, provider, tier } = selection

      try {
        this.logger.info('Creating seed agent for adjust', {
          model: modelKey,
          provider,
          tier,
          standupId: input.standupId,
        })

        const piModel = toPiAiModel({ provider, modelKey })
        const agent = new Agent({
          initialState: {
            systemPrompt,
            model: piModel,
            tools: [submitStandupTool],
            messages: seedMessages as AgentMessage[],
          },
          getApiKey: (p) => this.resolveApiKey(p),
        })

        let timeoutHandle: ReturnType<typeof setTimeout> | undefined
        await Promise.race([
          agent.prompt(adjustPrompt),
          new Promise<never>((_, reject) => {
            timeoutHandle = setTimeout(
              () => reject(new Error('Agent seed adjust timed out')),
              AGENT_TIMEOUT_MS,
            )
          }),
        ]).finally(() => clearTimeout(timeoutHandle))

        const result = extractSubmitStandupResult(agent.state.messages)
        if (!result) {
          this.logger.warn('Seed agent did not call submit_standup', {
            model: modelKey,
            provider,
          })
          lastError = new Error('Agent did not call submit_standup tool')
          continue
        }

        this.llmRegistry.reportSuccess(modelKey)
        this.sessionManager.create(input.standupId, agent)

        return Result.ok({
          content:
            result.content.length > MAX_STANDUP_CONTENT_CHARS
              ? result.content.slice(0, MAX_STANDUP_CONTENT_CHARS)
              : result.content,
          summary: result.summary,
        })
      } catch (error) {
        lastError = error
        this.logger.warn('Seed agent adjust failed', {
          model: modelKey,
          provider,
          tier,
          error: error instanceof Error ? error.message : String(error),
        })

        if (this.isRateLimitError(error)) {
          this.llmRegistry.reportFailure(modelKey, error)
        }
      }
    }

    return Result.err(
      new AllProvidersUnavailableError({
        message: `PI Agent adjust: all ${totalModels} models failed. Last error: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
        modelsAttempted: totalModels,
      }),
    )
  }
```

Also add the import for `AgentSessionManager`, `buildSeedMessages`, and `AgentMessage`:

```typescript
import type { AgentMessage } from '@mariozechner/pi-agent-core'
import { AgentSessionManager } from './agent-session-manager'
import { buildSeedMessages } from './build-seed-messages'
```

And add `sessionManager` to the constructor:

```typescript
  constructor(
    private readonly loggerFactory: AppLoggerFactory,
    private readonly standupPrompt: StandupPromptService,
    private readonly llmRegistry: LlmProviderRegistry,
    private readonly runtimeConfig: WorkerRuntimeConfigService,
    private readonly sessionManager: AgentSessionManager,
  ) {
```

- [ ] **Step 3: Write tests for `adjust()`**

Add to `standup-agent.service.spec.ts` — new describe block for adjust. Add a `makeSessionManager` factory:

```typescript
function makeSessionManager() {
  return {
    get: vi.fn().mockReturnValue(null),
    create: vi.fn(),
    destroy: vi.fn(),
    has: vi.fn().mockReturnValue(false),
  }
}
```

Update the `beforeEach` to include `sessionManager` in constructor:

```typescript
    const sessionManager = makeSessionManager()
    service = new StandupAgentService(
      makeLoggerFactory() as never,
      promptService as never,
      registry as never,
      makeRuntimeConfig() as never,
      sessionManager as never,
    )
```

Add new test block:

```typescript
describe('adjust()', () => {
  it('uses existing agent session for multi-turn adjust', async () => {
    const sessionManager = makeSessionManager()
    const existingAgent = {
      prompt: vi.fn().mockResolvedValue(undefined),
      state: mockState,
    }
    sessionManager.get.mockReturnValue(existingAgent)

    const svc = new StandupAgentService(
      makeLoggerFactory() as never,
      makePromptService() as never,
      makeRegistry() as never,
      makeRuntimeConfig() as never,
      sessionManager as never,
    )

    mockExtract.mockReturnValue({ content: 'adjusted', summary: 'adj' })

    const result = await svc.adjust({
      standupId: 'standup-1',
      instruction: 'make it shorter',
      previousContent: 'old content',
    })

    expect(result.isOk()).toBe(true)
    if (result.isOk()) {
      expect(result.value.content).toBe('adjusted')
    }
    expect(sessionManager.get).toHaveBeenCalledWith('standup-1')
    expect(existingAgent.prompt).toHaveBeenCalledWith('make it shorter')
  })

  it('creates seed agent when session does not exist', async () => {
    const sessionManager = makeSessionManager()
    sessionManager.get.mockReturnValue(null)

    const svc = new StandupAgentService(
      makeLoggerFactory() as never,
      makePromptService() as never,
      makeRegistry() as never,
      makeRuntimeConfig() as never,
      sessionManager as never,
    )

    mockExtract.mockReturnValue({ content: 'seeded', summary: 'seed' })

    const result = await svc.adjust({
      standupId: 'standup-1',
      instruction: 'add detail',
      previousContent: 'old content',
    })

    expect(result.isOk()).toBe(true)
    if (result.isOk()) {
      expect(result.value.content).toBe('seeded')
    }
    expect(sessionManager.create).toHaveBeenCalledWith('standup-1', expect.anything())
  })

  it('appends extraContext to instruction', async () => {
    const sessionManager = makeSessionManager()
    const existingAgent = {
      prompt: vi.fn().mockResolvedValue(undefined),
      state: mockState,
    }
    sessionManager.get.mockReturnValue(existingAgent)

    const svc = new StandupAgentService(
      makeLoggerFactory() as never,
      makePromptService() as never,
      makeRegistry() as never,
      makeRuntimeConfig() as never,
      sessionManager as never,
    )

    mockExtract.mockReturnValue({ content: 'c', summary: 's' })

    await svc.adjust({
      standupId: 'standup-1',
      instruction: 'shorten item 2',
      previousContent: 'old',
      extraContext: 'focus on the PR',
    })

    expect(existingAgent.prompt).toHaveBeenCalledWith(
      'shorten item 2\n\nContexto adicional: focus on the PR',
    )
  })

  it('returns error when existing agent fails to call tool', async () => {
    const sessionManager = makeSessionManager()
    const existingAgent = {
      prompt: vi.fn().mockResolvedValue(undefined),
      state: mockState,
    }
    sessionManager.get.mockReturnValue(existingAgent)

    const svc = new StandupAgentService(
      makeLoggerFactory() as never,
      makePromptService() as never,
      makeRegistry() as never,
      makeRuntimeConfig() as never,
      sessionManager as never,
    )

    mockExtract.mockReturnValue(null)

    const result = await svc.adjust({
      standupId: 'standup-1',
      instruction: 'fix it',
      previousContent: 'old',
    })

    expect(result.isErr()).toBe(true)
  })
})
```

- [ ] **Step 4: Run tests**

```bash
cd apps/api && bunx vitest run src/contexts/standups/worker/standup-agent/standup-agent.service.spec.ts
```

Expected: PASS — all existing + 4 new tests green.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/contexts/standups/worker/standup-agent/standup-agent.service.ts apps/api/src/contexts/standups/worker/standup-agent/standup-agent.service.spec.ts
git commit -m "feat: add adjust() method to StandupAgentService with multi-turn and seed support"
```

---

### Task 4: Register `AgentSessionManager` in NestJS module

**Files:**
- Modify: `apps/api/src/contexts/standups/worker/standup-agent/standup-agent.module.ts`

- [ ] **Step 1: Update the module**

```typescript
import { Module } from '@nestjs/common'
import { StandupGeneratorModule } from '../standup-generator/standup-generator.module'
import { WorkerRuntimeConfigModule } from '../worker-runtime-config.module'
import { AgentSessionManager } from './agent-session-manager'
import { StandupAgentService } from './standup-agent.service'

@Module({
  imports: [StandupGeneratorModule, WorkerRuntimeConfigModule],
  providers: [AgentSessionManager, StandupAgentService],
  exports: [AgentSessionManager, StandupAgentService],
})
export class StandupAgentModule {}
```

`AgentSessionManager` is exported because it will be injected by `StandupPipelineService` and `StandupInteractionService`.

- [ ] **Step 2: Verify typecheck**

```bash
cd apps/api && bun run typecheck
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/contexts/standups/worker/standup-agent/standup-agent.module.ts
git commit -m "feat: register AgentSessionManager in StandupAgentModule"
```

---

### Task 5: Add `agent` field to `GeneratedContent` and wire pipeline session creation

**Files:**
- Modify: `apps/api/src/contexts/standups/worker/standup/types.ts`
- Modify: `apps/api/src/contexts/standups/worker/standup/standup-pipeline.service.ts`

- [ ] **Step 1: Add optional `agent` field to `GeneratedContent`**

In `apps/api/src/contexts/standups/worker/standup/types.ts`, change the interface:

```typescript
import type { Agent } from '@mariozechner/pi-agent-core'

export interface GeneratedContent {
  content: string
  meetingType: string
  sourceData: string
  replaceStandupId?: string
  /** Transient — used to create session after persistence, not serialized to DB */
  agent?: Agent
}
```

- [ ] **Step 2: Wire session creation in `StandupPipelineService`**

In `apps/api/src/contexts/standups/worker/standup/standup-pipeline.service.ts`:

Add import:

```typescript
import { AgentSessionManager } from '../standup-agent/agent-session-manager'
```

Add to constructor:

```typescript
    private readonly sessionManager: AgentSessionManager,
```

After `const standupId = saveResult.value.id` (line 115), add:

```typescript
    // Create agent session if agent instance was returned by strategy
    if (generated.agent) {
      this.sessionManager.create(standupId, generated.agent)
      this.logger.info('Agent session created', { standupId })
    }
```

- [ ] **Step 3: Verify typecheck**

```bash
cd apps/api && bun run typecheck
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/contexts/standups/worker/standup/types.ts apps/api/src/contexts/standups/worker/standup/standup-pipeline.service.ts
git commit -m "feat: wire agent session creation in pipeline after standup persistence"
```

---

### Task 6: Update `ExecuteGenerateStrategy` to pass agent and destroy old session

**Files:**
- Modify: `apps/api/src/contexts/standups/worker/standup/strategies/execute-generate-strategy.ts`
- Modify: `apps/api/src/contexts/standups/worker/standup/strategies/execute-generate-strategy.spec.ts`

- [ ] **Step 1: Inject `AgentSessionManager` and modify the agent path**

In `execute-generate-strategy.ts`:

Add import:

```typescript
import { AgentSessionManager } from '../../standup-agent/agent-session-manager'
```

Add to constructor (after `runtimeConfig`):

```typescript
    private readonly sessionManager: AgentSessionManager,
```

In the `execute()` method, before the generation block (`// --- Generate standup ---`), add:

```typescript
    // --- Destroy old session on regenerate ---
    if (usePiAgent && options.replaceStandupId) {
      this.sessionManager.destroy(options.replaceStandupId)
    }
```

Wait — `usePiAgent` is defined later. Move the session destruction to just after the `usePiAgent` assignment:

In the agent branch of the ternary (the `standupAgent.generate()` call), the return now includes `agent`. Update the final `Result.ok<GeneratedContent>` to pass agent when available:

```typescript
    // --- Generate standup ---
    const meetingType = this.standupGenerator.determineMeetingType(today)

    const usePiAgent = this.runtimeConfig.config.USE_PI_AGENT

    // Destroy old agent session on regenerate
    if (usePiAgent && options.replaceStandupId) {
      this.sessionManager.destroy(options.replaceStandupId)
    }

    const generated = usePiAgent
      ? await this.tracing.withSpan(
          'standup.agent.generate',
          { 'standup.meeting_type': meetingType, 'standup.mode': 'agent' },
          () =>
            this.standupAgent.generate({
              // ... same as current
            }),
        )
      : await this.tracing.withSpan(
          'standup.llm.generate',
          // ... same as current
        )

    if (generated.isErr()) {
      return generated
    }

    return Result.ok<GeneratedContent>({
      content: generated.value.content,
      meetingType,
      sourceData: JSON.stringify({ git: gitActivity, board: boardActivity }),
      // Pass agent for session creation in pipeline (only present when usePiAgent=true)
      ...('agent' in generated.value ? { agent: generated.value.agent } : {}),
    })
```

- [ ] **Step 2: Update spec to pass new constructor dependency**

In `execute-generate-strategy.spec.ts`, add `makeSessionManager` factory and pass to constructor:

```typescript
function makeSessionManager() {
  return { create: vi.fn(), get: vi.fn(), destroy: vi.fn(), has: vi.fn() }
}
```

Add to the `buildStrategy` function call — the new param goes after `runtimeConfig`.

Add test:

```typescript
  it('destroys old session on regenerate when USE_PI_AGENT is true', async () => {
    const sessionManager = makeSessionManager()
    const strategy = buildStrategy(true, sessionManager)

    await strategy.execute({
      options: { ...makeDefaultOptions(), replaceStandupId: 'old-standup' } as never,
      today: '2026-04-02',
    })

    expect(sessionManager.destroy).toHaveBeenCalledWith('old-standup')
  })
```

- [ ] **Step 3: Run tests**

```bash
cd apps/api && bunx vitest run src/contexts/standups/worker/standup/strategies/execute-generate-strategy.spec.ts
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/contexts/standups/worker/standup/strategies/execute-generate-strategy.ts apps/api/src/contexts/standups/worker/standup/strategies/execute-generate-strategy.spec.ts
git commit -m "feat: pass agent instance from strategy and destroy old session on regenerate"
```

---

### Task 7: Wire `ExecuteAdjustStrategy` to branch on `USE_PI_AGENT`

**Files:**
- Modify: `apps/api/src/contexts/standups/worker/standup/strategies/execute-adjust-strategy.ts`
- Create: `apps/api/src/contexts/standups/worker/standup/strategies/execute-adjust-strategy.spec.ts`

- [ ] **Step 1: Modify the strategy**

In `execute-adjust-strategy.ts`, add imports:

```typescript
import { StandupAgentService } from '../../standup-agent/standup-agent.service'
import { WorkerRuntimeConfigService } from '../../worker-runtime-config.service'
```

Add to constructor:

```typescript
    private readonly standupAgent: StandupAgentService,
    private readonly runtimeConfig: WorkerRuntimeConfigService,
```

Replace the generation call block (lines 52-65) with branching logic:

```typescript
    const usePiAgent = this.runtimeConfig.config.USE_PI_AGENT

    const adjusted = usePiAgent
      ? await this.standupAgent.adjust({
          standupId: baseStandupId,
          instruction,
          previousContent: baseResult.value.content,
          previousSummary: baseResult.value.summary,
          extraContext: options.extraContext?.trim() || undefined,
          onStageChange: async () => {
            await this.reportStage(
              reportProgress,
              'generating_standup',
              'Ajustando standup (PI Agent)',
            )
          },
        })
      : await this.standupGenerator.generateAdjustedStandup(
          {
            previousContent: baseResult.value.content,
            instruction,
            extraContext: options.extraContext?.trim() || undefined,
          },
          async () => {
            await this.reportStage(
              reportProgress,
              'generating_standup',
              'Gerando standup ajustado',
            )
          },
        )
```

The rest of the method (error handling + return) stays unchanged. Note that `baseResult.value.summary` may not exist on the current type — check the `StandupReadRepository.findByIdForUser` return type. If `summary` is not available, pass `undefined`.

- [ ] **Step 2: Write tests**

Create `apps/api/src/contexts/standups/worker/standup/strategies/execute-adjust-strategy.spec.ts`:

```typescript
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Result } from '../../../../../shared/domain'
import { ExecuteAdjustStrategy } from './execute-adjust-strategy'

const mocks = {
  findByIdForUser: vi.fn(),
  legacyAdjust: vi.fn(),
  agentAdjust: vi.fn(),
  runtimeConfig: { USE_PI_AGENT: false },
}

vi.mock('../../../../../platform/database/repositories/standup-read.repository', () => ({
  StandupReadRepository: vi.fn().mockImplementation(() => ({
    findByIdForUser: mocks.findByIdForUser,
  })),
}))

vi.mock('../../standup-generator/standup-generator.service', () => ({
  StandupGeneratorService: vi.fn().mockImplementation(() => ({
    generateAdjustedStandup: mocks.legacyAdjust,
  })),
}))

vi.mock('../../standup-agent/standup-agent.service', () => ({
  StandupAgentService: vi.fn().mockImplementation(() => ({
    adjust: mocks.agentAdjust,
  })),
}))

vi.mock('../../worker-runtime-config.service', () => ({
  WorkerRuntimeConfigService: vi.fn().mockImplementation(() => ({
    get config() {
      return mocks.runtimeConfig
    },
  })),
}))

import { StandupReadRepository } from '../../../../../platform/database/repositories/standup-read.repository'
import { StandupAgentService } from '../../standup-agent/standup-agent.service'
import { StandupGeneratorService } from '../../standup-generator/standup-generator.service'
import { WorkerRuntimeConfigService } from '../../worker-runtime-config.service'

function buildStrategy() {
  return new ExecuteAdjustStrategy(
    new StandupReadRepository() as never,
    new StandupGeneratorService() as never,
    new StandupAgentService() as never,
    new WorkerRuntimeConfigService() as never,
  )
}

describe('ExecuteAdjustStrategy — PI Agent branching', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.runtimeConfig.USE_PI_AGENT = false
    mocks.findByIdForUser.mockResolvedValue(
      Result.ok({
        content: 'old standup',
        meetingType: 'daily',
        sourceData: '{}',
        summary: 'old summary',
      }),
    )
    mocks.legacyAdjust.mockResolvedValue(
      Result.ok({ content: 'legacy adjusted', summary: 'legacy' }),
    )
    mocks.agentAdjust.mockResolvedValue(
      Result.ok({ content: 'agent adjusted', summary: 'agent' }),
    )
  })

  const defaultOptions = {
    userId: 'user-1',
    discordUserId: 'discord-1',
    selectedRepos: [],
    gitAuthor: '',
    timezone: 'UTC',
    rewriteInstruction: 'make it shorter',
    rewriteFromStandupId: 'standup-1',
    replaceStandupId: 'standup-1',
  }

  it('uses legacy generator when USE_PI_AGENT is false', async () => {
    mocks.runtimeConfig.USE_PI_AGENT = false
    const strategy = buildStrategy()

    const result = await strategy.execute({
      options: defaultOptions as never,
      today: '2026-04-02',
    })

    expect(result.isOk()).toBe(true)
    expect(mocks.legacyAdjust).toHaveBeenCalled()
    expect(mocks.agentAdjust).not.toHaveBeenCalled()
  })

  it('uses PI Agent when USE_PI_AGENT is true', async () => {
    mocks.runtimeConfig.USE_PI_AGENT = true
    const strategy = buildStrategy()

    const result = await strategy.execute({
      options: defaultOptions as never,
      today: '2026-04-02',
    })

    expect(result.isOk()).toBe(true)
    expect(mocks.agentAdjust).toHaveBeenCalledWith(
      expect.objectContaining({
        standupId: 'standup-1',
        instruction: 'make it shorter',
        previousContent: 'old standup',
      }),
    )
    expect(mocks.legacyAdjust).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 3: Run tests**

```bash
cd apps/api && bunx vitest run src/contexts/standups/worker/standup/strategies/execute-adjust-strategy.spec.ts
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/contexts/standups/worker/standup/strategies/execute-adjust-strategy.ts apps/api/src/contexts/standups/worker/standup/strategies/execute-adjust-strategy.spec.ts
git commit -m "feat: wire ExecuteAdjustStrategy to branch on USE_PI_AGENT for multi-turn adjust"
```

---

### Task 8: Destroy session on approve/reject

**Files:**
- Modify: `apps/api/src/interfaces/discord/handlers/standup-interaction.service.ts`

- [ ] **Step 1: Inject `AgentSessionManager` and add destroy calls**

Add import:

```typescript
import { AgentSessionManager } from '../../../contexts/standups/worker/standup-agent/agent-session-manager'
```

Add to constructor:

```typescript
    private readonly sessionManager: AgentSessionManager,
```

In `handleApprove()`, after the `approveResult` success check (before the channel publish logic), add:

```typescript
    this.sessionManager.destroy(standupId)
```

In `handleReject()`, after the successful state transition (before `return Result.ok(...)`), add:

```typescript
    this.sessionManager.destroy(standupId)
```

Note: `handleRegenerate()` does NOT need destroy here — it's handled in `ExecuteGenerateStrategy`.

- [ ] **Step 2: Ensure the Discord module imports `StandupAgentModule`**

Check which module provides `StandupInteractionService`. If it's in a Discord module that doesn't import `StandupAgentModule`, add the import so `AgentSessionManager` is available via DI.

Look at the module file that registers `StandupInteractionService` and add `StandupAgentModule` to its imports if needed.

- [ ] **Step 3: Verify typecheck**

```bash
cd apps/api && bun run typecheck
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add -u
git commit -m "feat: destroy agent session on approve/reject in StandupInteractionService"
```

---

### Task 9: Run full test suite and fix issues

**Files:** None (verification only)

- [ ] **Step 1: Run full test suite**

```bash
cd apps/api && bun run test
```

If tests fail due to new constructor params on `ExecuteAdjustStrategy`, `ExecuteGenerateStrategy`, `StandupPipelineService`, or `StandupInteractionService`, add mock dependencies in the affected test files.

- [ ] **Step 2: Run lint**

```bash
cd apps/api && bun run lint
```

Fix any Biome issues (unused imports, import ordering).

- [ ] **Step 3: Run typecheck**

```bash
cd apps/api && bun run typecheck
```

- [ ] **Step 4: Commit fixes**

```bash
git add -u
git commit -m "fix: resolve test/lint issues from Phase 2 integration"
```

---

### Task 10: Integration smoke test

**Files:** None (manual verification)

- [ ] **Step 1: Test multi-turn adjust flow**

```bash
cd apps/api && USE_PI_AGENT=true bun run dev
```

1. Trigger standup generation
2. Click "Ajustar texto" in Discord DM → enter instruction
3. Verify adjusted standup appears
4. Click "Ajustar texto" again → enter second instruction
5. Verify second adjustment has context from first (multi-turn)

- [ ] **Step 2: Test session cleanup**

1. Generate standup
2. Approve → verify session is cleaned up (check logs for "Agent session created" / no memory leak)
3. Generate another → Reject → verify cleanup

- [ ] **Step 3: Test regenerate**

1. Generate standup
2. Click "Regenerar" → verify old session destroyed, new session created

---

## Summary

| Task | Description | Files |
|------|-------------|-------|
| 1 | `AgentSessionManager` (TTL + cleanup) | New: 2 files |
| 2 | `buildSeedMessages` helper | New: 2 files |
| 3 | `adjust()` method on `StandupAgentService` | Modify: 2 files |
| 4 | Register `AgentSessionManager` in module | Modify: 1 file |
| 5 | `agent` field in `GeneratedContent` + pipeline session creation | Modify: 2 files |
| 6 | Strategy passes agent + destroys old session | Modify: 2 files |
| 7 | `ExecuteAdjustStrategy` branching | Modify + Create: 2 files |
| 8 | Destroy session on approve/reject | Modify: 1-2 files |
| 9 | Full test suite verification | N/A |
| 10 | Integration smoke test | N/A |
