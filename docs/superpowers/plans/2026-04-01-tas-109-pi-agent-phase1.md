# TAS-109: PI Agent Integration — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add PI Agent-based standup generation alongside the existing Vercel AI SDK path, controlled by a `USE_PI_AGENT` env var.

**Architecture:** New `StandupAgentService` sits next to `StandupGeneratorService`. It creates a disposable PI Agent instance per generation, uses a `submit_standup` TypeBox tool for structured output, and delegates model selection to the existing `LlmProviderRegistry` via an adapter. `ExecuteGenerateStrategy` branches on `USE_PI_AGENT` to pick which service to call.

**Tech Stack:** `@mariozechner/pi-agent-core`, `@mariozechner/pi-ai`, `@sinclair/typebox`, NestJS DI, Vitest

**Spec:** `docs/superpowers/specs/2026-04-01-tas-109-pi-agent-phase1-design.md`

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `apps/api/src/contexts/standups/worker/standup-agent/submit-standup.tool.ts` | TypeBox schema + AgentTool for structured output |
| Create | `apps/api/src/contexts/standups/worker/standup-agent/submit-standup.tool.spec.ts` | Tests for the tool |
| Create | `apps/api/src/contexts/standups/worker/standup-agent/pi-ai-model-adapter.ts` | Maps `LlmProviderRegistry` models to `pi-ai` `getModel()` |
| Create | `apps/api/src/contexts/standups/worker/standup-agent/pi-ai-model-adapter.spec.ts` | Tests for the adapter |
| Create | `apps/api/src/contexts/standups/worker/standup-agent/standup-agent.service.ts` | Agent-based standup generation with retry loop |
| Create | `apps/api/src/contexts/standups/worker/standup-agent/standup-agent.service.spec.ts` | Tests for the agent service |
| Create | `apps/api/src/contexts/standups/worker/standup-agent/standup-agent.module.ts` | NestJS module registering the service |
| Modify | `apps/api/src/platform/env/env.schema.ts:57` | Add `USE_PI_AGENT` env var |
| Modify | `apps/api/src/platform/env/env.service.ts:45-61` | Expose `usePiAgent` in `worker` getter |
| Modify | `apps/api/src/contexts/standups/worker/worker-runtime-config.service.ts:4-17` | Add `USE_PI_AGENT` to `WorkerRuntimeConfig` |
| Modify | `apps/api/src/contexts/standups/worker/standup-generator/standup-generator.module.ts` | Import `StandupAgentModule` and re-export |
| Modify | `apps/api/src/contexts/standups/worker/standup/strategies/execute-generate-strategy.ts:14,29,176-208` | Branch on `USE_PI_AGENT`, inject `StandupAgentService` |

---

### Task 1: Install dependencies

**Files:**
- Modify: `apps/api/package.json`

- [ ] **Step 1: Install pi-agent-core, pi-ai, and typebox**

```bash
cd apps/api && bun add @mariozechner/pi-agent-core @mariozechner/pi-ai @sinclair/typebox
```

- [ ] **Step 2: Verify installation**

```bash
cd apps/api && bun run typecheck
```

Expected: No new type errors (existing pass).

- [ ] **Step 3: Commit**

```bash
git add apps/api/package.json ../../bun.lock
git commit -m "chore: add pi-agent-core, pi-ai, and typebox dependencies"
```

---

### Task 2: Add `USE_PI_AGENT` env var

**Files:**
- Modify: `apps/api/src/platform/env/env.schema.ts`
- Modify: `apps/api/src/platform/env/env.service.ts`
- Modify: `apps/api/src/contexts/standups/worker/worker-runtime-config.service.ts`

- [ ] **Step 1: Add to env schema**

In `apps/api/src/platform/env/env.schema.ts`, add after line 57 (`DISCORD_SEND_TIMEOUT_MS`):

```typescript
  USE_PI_AGENT: booleanFromEnv.default(false),
```

- [ ] **Step 2: Expose in EnvService**

In `apps/api/src/platform/env/env.service.ts`, add to the `worker` getter (after `azureDevopsProjects`):

```typescript
      usePiAgent: this.get('USE_PI_AGENT'),
```

- [ ] **Step 3: Add to WorkerRuntimeConfig**

In `apps/api/src/contexts/standups/worker/worker-runtime-config.service.ts`:

Add to `WorkerRuntimeConfig` interface:

```typescript
  USE_PI_AGENT: boolean
```

Add to the `config` getter return object:

```typescript
      USE_PI_AGENT: this.env.worker.usePiAgent,
```

- [ ] **Step 4: Verify typecheck passes**

```bash
cd apps/api && bun run typecheck
```

Expected: PASS — no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/platform/env/env.schema.ts apps/api/src/platform/env/env.service.ts apps/api/src/contexts/standups/worker/worker-runtime-config.service.ts
git commit -m "feat: add USE_PI_AGENT env var for agent-based generation toggle"
```

---

### Task 3: Create `submit_standup` tool

**Files:**
- Create: `apps/api/src/contexts/standups/worker/standup-agent/submit-standup.tool.ts`
- Create: `apps/api/src/contexts/standups/worker/standup-agent/submit-standup.tool.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/contexts/standups/worker/standup-agent/submit-standup.tool.spec.ts`:

```typescript
import { describe, expect, it } from 'vitest'
import {
  extractSubmitStandupResult,
  submitStandupTool,
} from './submit-standup.tool'

describe('submitStandupTool', () => {
  it('has correct name and description', () => {
    expect(submitStandupTool.name).toBe('submit_standup')
    expect(submitStandupTool.description).toBeDefined()
  })

  it('execute returns the params as confirmation text', async () => {
    const params = {
      content: '## Standup\n- item 1\n- item 2',
      summary: 'Worked on items 1 and 2',
    }

    const result = await submitStandupTool.execute('call-1', params)

    expect(result).toEqual({
      content: [{ type: 'text', text: 'Standup submitted successfully.' }],
    })
  })
})

describe('extractSubmitStandupResult', () => {
  it('extracts result from messages containing submit_standup tool call', () => {
    const messages = [
      { role: 'user', content: 'Generate standup' },
      {
        role: 'assistant',
        content: [
          {
            type: 'tool_call',
            name: 'submit_standup',
            args: {
              content: '## My Standup\n- did stuff',
              summary: 'Did stuff',
            },
            id: 'call-1',
          },
        ],
      },
      {
        role: 'tool',
        content: [{ type: 'text', text: 'Standup submitted successfully.' }],
        toolCallId: 'call-1',
      },
    ]

    const result = extractSubmitStandupResult(messages as never)

    expect(result).toEqual({
      content: '## My Standup\n- did stuff',
      summary: 'Did stuff',
    })
  })

  it('returns null when no submit_standup tool call exists', () => {
    const messages = [
      { role: 'user', content: 'Generate standup' },
      { role: 'assistant', content: [{ type: 'text', text: 'Here is your standup...' }] },
    ]

    const result = extractSubmitStandupResult(messages as never)

    expect(result).toBeNull()
  })

  it('returns the last submit_standup call if multiple exist', () => {
    const messages = [
      {
        role: 'assistant',
        content: [
          {
            type: 'tool_call',
            name: 'submit_standup',
            args: { content: 'first', summary: 'first' },
            id: 'call-1',
          },
        ],
      },
      {
        role: 'assistant',
        content: [
          {
            type: 'tool_call',
            name: 'submit_standup',
            args: { content: 'second', summary: 'second' },
            id: 'call-2',
          },
        ],
      },
    ]

    const result = extractSubmitStandupResult(messages as never)

    expect(result).toEqual({ content: 'second', summary: 'second' })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/api && bunx vitest run src/contexts/standups/worker/standup-agent/submit-standup.tool.spec.ts
```

Expected: FAIL — cannot find module `./submit-standup.tool`.

- [ ] **Step 3: Write the implementation**

Create `apps/api/src/contexts/standups/worker/standup-agent/submit-standup.tool.ts`:

```typescript
import { Type } from '@sinclair/typebox'
import type { AgentMessage, AgentTool } from '@mariozechner/pi-agent-core'

export const SubmitStandupParams = Type.Object({
  content: Type.String({
    description:
      'The standup content in markdown format. Must be under 2000 characters.',
  }),
  summary: Type.String({
    description: 'A single-line summary of the standup.',
  }),
})

export const submitStandupTool: AgentTool = {
  name: 'submit_standup',
  label: 'Submit Standup',
  description:
    'Submit the final standup report. You MUST call this tool exactly once with the generated standup content and summary. Do not respond with text — always use this tool.',
  parameters: SubmitStandupParams,
  execute: async (_toolCallId: string, _params: unknown) => {
    return {
      content: [{ type: 'text' as const, text: 'Standup submitted successfully.' }],
    }
  },
}

export interface SubmitStandupResult {
  content: string
  summary: string
}

export function extractSubmitStandupResult(
  messages: AgentMessage[],
): SubmitStandupResult | null {
  let lastResult: SubmitStandupResult | null = null

  for (const msg of messages) {
    if (msg.role !== 'assistant' || !Array.isArray(msg.content)) continue

    for (const part of msg.content) {
      if (
        part.type === 'tool_call' &&
        part.name === 'submit_standup' &&
        part.args &&
        typeof part.args === 'object' &&
        'content' in part.args &&
        'summary' in part.args
      ) {
        lastResult = {
          content: String(part.args.content),
          summary: String(part.args.summary),
        }
      }
    }
  }

  return lastResult
}
```

> **Note to implementer:** The exact shape of `AgentMessage` and tool call content parts depends on the PI Agent Core API. After installing the package, verify the message structure by checking the types exported from `@mariozechner/pi-agent-core`. The key fields to look for: `msg.role`, `msg.content[].type === 'tool_call'`, `msg.content[].name`, `msg.content[].args`. Adjust the extraction logic if the field names differ.

- [ ] **Step 4: Run test to verify it passes**

```bash
cd apps/api && bunx vitest run src/contexts/standups/worker/standup-agent/submit-standup.tool.spec.ts
```

Expected: PASS — all 4 tests green.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/contexts/standups/worker/standup-agent/submit-standup.tool.ts apps/api/src/contexts/standups/worker/standup-agent/submit-standup.tool.spec.ts
git commit -m "feat: add submit_standup tool with TypeBox schema for PI Agent output"
```

---

### Task 4: Create `pi-ai-model-adapter`

**Files:**
- Create: `apps/api/src/contexts/standups/worker/standup-agent/pi-ai-model-adapter.ts`
- Create: `apps/api/src/contexts/standups/worker/standup-agent/pi-ai-model-adapter.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/contexts/standups/worker/standup-agent/pi-ai-model-adapter.spec.ts`:

```typescript
import { describe, expect, it, vi } from 'vitest'
import { toPiAiModel } from './pi-ai-model-adapter'

vi.mock('@mariozechner/pi-ai', () => ({
  getModel: vi.fn(
    (provider: string, model: string) => `mock-${provider}:${model}`,
  ),
}))

describe('toPiAiModel', () => {
  it('maps google provider', () => {
    const result = toPiAiModel({ provider: 'google', modelKey: 'google:gemini-2.0-flash' })
    expect(result).toBe('mock-google:gemini-2.0-flash')
  })

  it('maps groq provider', () => {
    const result = toPiAiModel({ provider: 'groq', modelKey: 'groq:qwen-2.5' })
    expect(result).toBe('mock-groq:qwen-2.5')
  })

  it('maps openrouter provider', () => {
    const result = toPiAiModel({ provider: 'openrouter', modelKey: 'openrouter:free-model' })
    expect(result).toBe('mock-openrouter:free-model')
  })

  it('extracts model name from modelKey format provider:model', () => {
    const result = toPiAiModel({ provider: 'google', modelKey: 'google:gemini-2.5-pro' })
    expect(result).toBe('mock-google:gemini-2.5-pro')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/api && bunx vitest run src/contexts/standups/worker/standup-agent/pi-ai-model-adapter.spec.ts
```

Expected: FAIL — cannot find module `./pi-ai-model-adapter`.

- [ ] **Step 3: Write the implementation**

Create `apps/api/src/contexts/standups/worker/standup-agent/pi-ai-model-adapter.ts`:

```typescript
import { getModel } from '@mariozechner/pi-ai'

export interface RegistryModelInfo {
  provider: string
  modelKey: string
}

export function toPiAiModel(registryModel: RegistryModelInfo) {
  const modelName = registryModel.modelKey.includes(':')
    ? registryModel.modelKey.split(':').slice(1).join(':')
    : registryModel.modelKey

  return getModel(registryModel.provider, modelName)
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd apps/api && bunx vitest run src/contexts/standups/worker/standup-agent/pi-ai-model-adapter.spec.ts
```

Expected: PASS — all 4 tests green.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/contexts/standups/worker/standup-agent/pi-ai-model-adapter.ts apps/api/src/contexts/standups/worker/standup-agent/pi-ai-model-adapter.spec.ts
git commit -m "feat: add pi-ai model adapter for LlmProviderRegistry integration"
```

---

### Task 5: Create `StandupAgentService`

**Files:**
- Create: `apps/api/src/contexts/standups/worker/standup-agent/standup-agent.service.ts`
- Create: `apps/api/src/contexts/standups/worker/standup-agent/standup-agent.service.spec.ts`

- [ ] **Step 1: Write the failing tests**

Create `apps/api/src/contexts/standups/worker/standup-agent/standup-agent.service.spec.ts`:

```typescript
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  AllProvidersUnavailableError,
  Result,
} from '../../../../shared/domain'
import { StandupAgentService } from './standup-agent.service'

// --- Mock pi-agent-core ---
let agentPromptBehavior: 'success' | 'error' | 'no-tool'
let agentPromptCallCount: number

const mockAgentState = {
  systemPrompt: '',
  model: null as unknown,
  tools: [] as unknown[],
  messages: [] as unknown[],
}

vi.mock('@mariozechner/pi-agent-core', () => {
  return {
    Agent: vi.fn().mockImplementation(() => ({
      state: mockAgentState,
      prompt: vi.fn(async () => {
        agentPromptCallCount++
        if (agentPromptBehavior === 'error') {
          throw new Error('LLM call failed')
        }
        if (agentPromptBehavior === 'no-tool') {
          mockAgentState.messages = [
            { role: 'user', content: 'Generate standup' },
            {
              role: 'assistant',
              content: [{ type: 'text', text: 'Here is your standup...' }],
            },
          ]
          return
        }
        // success — populate messages with tool call
        mockAgentState.messages = [
          { role: 'user', content: 'Generate standup' },
          {
            role: 'assistant',
            content: [
              {
                type: 'tool_call',
                name: 'submit_standup',
                args: {
                  content: '## Standup\n- did things',
                  summary: 'Did things',
                },
                id: 'call-1',
              },
            ],
          },
          {
            role: 'tool',
            content: [
              { type: 'text', text: 'Standup submitted successfully.' },
            ],
            toolCallId: 'call-1',
          },
        ]
      }),
    })),
  }
})

vi.mock('./pi-ai-model-adapter', () => ({
  toPiAiModel: vi.fn(() => 'mock-model'),
}))

// --- Factories ---
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

function makePromptService() {
  return {
    buildSystemPrompt: vi.fn().mockReturnValue('system prompt'),
    buildUserMessage: vi.fn().mockReturnValue('user message'),
    buildRewriteUserMessage: vi.fn().mockReturnValue('rewrite message'),
    determineMeetingType: vi.fn().mockReturnValue('daily'),
  }
}

function makeRegistry(modelCount = 3) {
  let modelIndex = 0
  const models = [
    { modelKey: 'google:gemini', provider: 'google', tier: 1 },
    { modelKey: 'groq:qwen', provider: 'groq', tier: 1 },
    { modelKey: 'openrouter:free', provider: 'openrouter', tier: 2 },
  ].slice(0, modelCount)

  return {
    get totalModels() {
      return models.length
    },
    getNextModel: vi.fn(() => {
      const entry = models[modelIndex % models.length]!
      modelIndex++
      return {
        model: { modelId: entry.modelKey } as never,
        ...entry,
      }
    }),
    reportFailure: vi.fn(),
    reportSuccess: vi.fn(),
  }
}

describe('StandupAgentService', () => {
  let service: StandupAgentService
  let registry: ReturnType<typeof makeRegistry>

  beforeEach(() => {
    agentPromptBehavior = 'success'
    agentPromptCallCount = 0
    mockAgentState.messages = []

    registry = makeRegistry()
    service = new StandupAgentService(
      makeLoggerFactory() as never,
      makePromptService() as never,
      registry as never,
    )
  })

  it('generates standup successfully on first model', async () => {
    const result = await service.generate({
      date: '2026-04-01',
      meetingType: 'daily',
    })

    expect(result.isOk()).toBe(true)
    if (result.isOk()) {
      expect(result.value.content).toBe('## Standup\n- did things')
      expect(result.value.summary).toBe('Did things')
    }
    expect(registry.reportSuccess).toHaveBeenCalledWith('google:gemini')
  })

  it('falls back to next model when agent throws', async () => {
    let callCount = 0
    agentPromptBehavior = 'error'

    // Override to fail first, succeed second
    const { Agent } = await import('@mariozechner/pi-agent-core')
    vi.mocked(Agent).mockImplementation(() => ({
      state: mockAgentState,
      prompt: vi.fn(async () => {
        callCount++
        if (callCount <= 1) {
          throw new Error('LLM call failed')
        }
        mockAgentState.messages = [
          {
            role: 'assistant',
            content: [
              {
                type: 'tool_call',
                name: 'submit_standup',
                args: { content: 'fallback content', summary: 'fallback' },
                id: 'call-2',
              },
            ],
          },
        ]
      }),
    }) as never)

    const result = await service.generate({
      date: '2026-04-01',
      meetingType: 'daily',
    })

    expect(result.isOk()).toBe(true)
    expect(registry.getNextModel).toHaveBeenCalledTimes(2)
  })

  it('treats missing tool call as error and tries next model', async () => {
    let callCount = 0
    const { Agent } = await import('@mariozechner/pi-agent-core')
    vi.mocked(Agent).mockImplementation(() => ({
      state: mockAgentState,
      prompt: vi.fn(async () => {
        callCount++
        if (callCount <= 1) {
          // No tool call — just text
          mockAgentState.messages = [
            {
              role: 'assistant',
              content: [{ type: 'text', text: 'Here is your standup' }],
            },
          ]
          return
        }
        // Second call succeeds with tool
        mockAgentState.messages = [
          {
            role: 'assistant',
            content: [
              {
                type: 'tool_call',
                name: 'submit_standup',
                args: { content: 'ok content', summary: 'ok' },
                id: 'call-3',
              },
            ],
          },
        ]
      }),
    }) as never)

    const result = await service.generate({
      date: '2026-04-01',
      meetingType: 'daily',
    })

    expect(result.isOk()).toBe(true)
    expect(registry.getNextModel).toHaveBeenCalledTimes(2)
  })

  it('returns AllProvidersUnavailableError when all models fail', async () => {
    agentPromptBehavior = 'error'

    const result = await service.generate({
      date: '2026-04-01',
      meetingType: 'daily',
    })

    expect(result.isErr()).toBe(true)
    if (result.isErr()) {
      expect(result.error).toBeInstanceOf(AllProvidersUnavailableError)
    }
  })

  it('calls onStageChange with generating_standup', async () => {
    const onStageChange = vi.fn()

    await service.generate({
      date: '2026-04-01',
      meetingType: 'daily',
      onStageChange,
    })

    expect(onStageChange).toHaveBeenCalledWith('generating_standup')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd apps/api && bunx vitest run src/contexts/standups/worker/standup-agent/standup-agent.service.spec.ts
```

Expected: FAIL — cannot find module `./standup-agent.service`.

- [ ] **Step 3: Write the implementation**

Create `apps/api/src/contexts/standups/worker/standup-agent/standup-agent.service.ts`:

```typescript
import { Injectable } from '@nestjs/common'
import { Agent } from '@mariozechner/pi-agent-core'
import { AppLoggerFactory } from '../../../../platform/logger'
import type {
  GenerateStandupInput,
  GeneratedStandup,
} from '../../../../shared/domain'
import {
  AllProvidersUnavailableError,
  ExternalServiceError,
  Result,
} from '../../../../shared/domain'
import type { EnrichedGitActivity } from '../azure-devops/types'
import { LlmProviderRegistry } from '../standup-generator/llm-provider-registry'
import {
  MAX_STANDUP_CONTENT_CHARS,
  StandupPromptService,
} from '../standup-generator/standup-prompt.service'
import { toPiAiModel } from './pi-ai-model-adapter'
import {
  extractSubmitStandupResult,
  submitStandupTool,
} from './submit-standup.tool'

type GeneratorStage = 'enriching_data' | 'generating_standup'

export interface AgentGenerateInput {
  date: string
  meetingType: string
  gitActivity?: GenerateStandupInput['gitActivity']
  boardActivity?: GenerateStandupInput['boardActivity']
  enrichedActivity?: EnrichedGitActivity
  extraContext?: string
  azureDevopsUuid?: string
  onStageChange?: (stage: GeneratorStage) => Promise<void> | void
}

const AGENT_TIMEOUT_MS = 60_000

@Injectable()
export class StandupAgentService {
  private readonly logger: ReturnType<AppLoggerFactory['create']>

  constructor(
    private readonly loggerFactory: AppLoggerFactory,
    private readonly standupPrompt: StandupPromptService,
    private readonly llmRegistry: LlmProviderRegistry,
  ) {
    this.logger = this.loggerFactory.create('standup-agent')
  }

  async generate(
    input: AgentGenerateInput,
  ): Promise<
    Result<GeneratedStandup, ExternalServiceError | AllProvidersUnavailableError>
  > {
    await input.onStageChange?.('generating_standup')

    const systemPrompt = this.standupPrompt.buildSystemPrompt({
      hasGit: !!input.gitActivity,
      hasBoard: !!input.boardActivity,
    })

    const userMessage = this.standupPrompt.buildUserMessage(
      {
        date: input.date,
        meetingType: input.meetingType,
        gitActivity: input.gitActivity,
        boardActivity: input.boardActivity,
        extraContext: input.extraContext,
        azureDevopsUuid: input.azureDevopsUuid,
      },
      input.enrichedActivity,
    )

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
        this.logger.info('Calling PI Agent', {
          model: modelKey,
          provider,
          tier,
        })

        const piModel = toPiAiModel({ provider, modelKey })
        const agent = new Agent({
          initialState: {
            systemPrompt,
            model: piModel,
            tools: [submitStandupTool],
            messages: [],
          },
        })

        await Promise.race([
          agent.prompt(userMessage),
          new Promise((_, reject) =>
            setTimeout(
              () => reject(new Error('Agent prompt timed out')),
              AGENT_TIMEOUT_MS,
            ),
          ),
        ])

        const result = extractSubmitStandupResult(agent.state.messages)
        if (!result) {
          this.logger.warn(
            'Agent did not call submit_standup tool, trying next model',
            { model: modelKey, provider },
          )
          lastError = new Error(
            'Agent did not call submit_standup tool',
          )
          continue
        }

        // Check content length — ask agent to rewrite if too long
        if (result.content.length > MAX_STANDUP_CONTENT_CHARS) {
          this.logger.info('Content exceeds limit, requesting rewrite', {
            model: modelKey,
            length: result.content.length,
            limit: MAX_STANDUP_CONTENT_CHARS,
          })

          await Promise.race([
            agent.prompt(
              this.standupPrompt.buildRewriteUserMessage(
                result.content,
                result.summary,
              ),
            ),
            new Promise((_, reject) =>
              setTimeout(
                () => reject(new Error('Agent rewrite timed out')),
                AGENT_TIMEOUT_MS,
              ),
            ),
          ])

          const rewriteResult = extractSubmitStandupResult(
            agent.state.messages,
          )
          if (rewriteResult) {
            this.llmRegistry.reportSuccess(modelKey)
            return Result.ok({
              content: rewriteResult.content.slice(
                0,
                MAX_STANDUP_CONTENT_CHARS,
              ),
              summary: rewriteResult.summary,
            })
          }
        }

        this.llmRegistry.reportSuccess(modelKey)
        return Result.ok({
          content: result.content,
          summary: result.summary,
        })
      } catch (error) {
        lastError = error
        this.logger.warn('PI Agent generation failed', {
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
        message: `PI Agent standup generation: all ${totalModels} models failed. Last error: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
        modelsAttempted: totalModels,
      }),
    )
  }

  private isRateLimitError(error: unknown): boolean {
    if (
      error != null &&
      typeof error === 'object' &&
      'statusCode' in error &&
      (error as { statusCode: number }).statusCode === 429
    ) {
      return true
    }
    if (
      error != null &&
      typeof error === 'object' &&
      'cause' in error &&
      (error as { cause: { status?: number } }).cause?.status === 429
    ) {
      return true
    }
    if (error instanceof Error && /rate.?limit/i.test(error.message)) {
      return true
    }
    return false
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd apps/api && bunx vitest run src/contexts/standups/worker/standup-agent/standup-agent.service.spec.ts
```

Expected: PASS — all 5 tests green.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/contexts/standups/worker/standup-agent/standup-agent.service.ts apps/api/src/contexts/standups/worker/standup-agent/standup-agent.service.spec.ts
git commit -m "feat: add StandupAgentService with PI Agent integration and retry loop"
```

---

### Task 6: Create NestJS module and wire into DI

**Files:**
- Create: `apps/api/src/contexts/standups/worker/standup-agent/standup-agent.module.ts`
- Modify: `apps/api/src/contexts/standups/worker/standup-generator/standup-generator.module.ts`

- [ ] **Step 1: Create the module**

Create `apps/api/src/contexts/standups/worker/standup-agent/standup-agent.module.ts`:

```typescript
import { Module } from '@nestjs/common'
import { StandupGeneratorModule } from '../standup-generator/standup-generator.module'
import { StandupAgentService } from './standup-agent.service'

@Module({
  imports: [StandupGeneratorModule],
  providers: [StandupAgentService],
  exports: [StandupAgentService],
})
export class StandupAgentModule {}
```

- [ ] **Step 2: Import StandupAgentModule in WorkerModule**

In `apps/api/src/contexts/standups/worker/worker.module.ts`, add to imports:

Add the import statement at the top:

```typescript
import { StandupAgentModule } from './standup-agent/standup-agent.module'
```

Add `StandupAgentModule` to the `imports` array (after `StandupGeneratorModule`):

```typescript
  imports: [
    EventsModule,
    DatabaseModule,
    EmailModule,
    WorkerRuntimeConfigModule,
    AzureDevopsModule,
    GitCollectorModule,
    StandupGeneratorModule,
    StandupAgentModule,
  ],
```

- [ ] **Step 3: Verify typecheck passes**

```bash
cd apps/api && bun run typecheck
```

Expected: PASS — no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/contexts/standups/worker/standup-agent/standup-agent.module.ts apps/api/src/contexts/standups/worker/worker.module.ts
git commit -m "feat: register StandupAgentModule in WorkerModule DI"
```

---

### Task 7: Wire `ExecuteGenerateStrategy` to branch on `USE_PI_AGENT`

**Files:**
- Modify: `apps/api/src/contexts/standups/worker/standup/strategies/execute-generate-strategy.ts`

- [ ] **Step 1: Write a test for the branching behavior**

There is no existing spec for `ExecuteGenerateStrategy`. Create one focused only on the branching logic:

Create `apps/api/src/contexts/standups/worker/standup/strategies/execute-generate-strategy.spec.ts`:

```typescript
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Result } from '../../../../../shared/domain'

// --- Mocks ---
const mocks = {
  gitCollect: vi.fn(),
  boardCollect: vi.fn(),
  legacyGenerate: vi.fn(),
  agentGenerate: vi.fn(),
  determineMeetingType: vi.fn().mockReturnValue('daily'),
  findLastApprovedByUser: vi.fn().mockResolvedValue(Result.ok(null)),
  today: vi.fn().mockReturnValue({ iso: '2026-04-01' }),
  getDayOfWeek: vi.fn().mockReturnValue(2),
  withSpan: vi.fn((_name: string, _attrs: unknown, fn: () => unknown) => fn()),
  reportStage: vi.fn(),
  runtimeConfig: { USE_PI_AGENT: false },
}

vi.mock('../../git-collector/git-collector.service', () => ({
  GitCollectorService: vi.fn().mockImplementation(() => ({
    collect: mocks.gitCollect,
  })),
}))

vi.mock('../../azure-devops/azure-devops-activity-collector.service', () => ({
  AzureDevopsActivityCollectorService: vi.fn().mockImplementation(() => ({
    collect: mocks.boardCollect,
  })),
}))

vi.mock('../../standup-generator/standup-generator.service', () => ({
  StandupGeneratorService: vi.fn().mockImplementation(() => ({
    generateStandup: mocks.legacyGenerate,
    determineMeetingType: mocks.determineMeetingType,
  })),
}))

vi.mock('../../standup-agent/standup-agent.service', () => ({
  StandupAgentService: vi.fn().mockImplementation(() => ({
    generate: mocks.agentGenerate,
  })),
}))

vi.mock('../../../../../platform/database/repositories/standup-read.repository', () => ({
  StandupReadRepository: vi.fn().mockImplementation(() => ({
    findLastApprovedByUser: mocks.findLastApprovedByUser,
  })),
}))

vi.mock('../../../../../platform/logger', () => ({
  AppLoggerFactory: vi.fn().mockImplementation(() => ({
    create: vi.fn(() => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    })),
  })),
}))

vi.mock('../../../../../platform/observability/app-tracing.service', () => ({
  AppTracingService: vi.fn().mockImplementation(() => ({
    withSpan: mocks.withSpan,
  })),
}))

vi.mock('../../../../../platform/time/local-date.service', () => ({
  LocalDateService: vi.fn().mockImplementation(() => ({
    today: mocks.today,
    getDayOfWeek: mocks.getDayOfWeek,
  })),
}))

vi.mock('../../worker-runtime-config.service', () => ({
  WorkerRuntimeConfigService: vi.fn().mockImplementation(() => ({
    get config() {
      return mocks.runtimeConfig
    },
  })),
}))

import { ExecuteGenerateStrategy } from './execute-generate-strategy'
import { AppLoggerFactory } from '../../../../../platform/logger'
import { GitCollectorService } from '../../git-collector/git-collector.service'
import { AzureDevopsActivityCollectorService } from '../../azure-devops/azure-devops-activity-collector.service'
import { StandupGeneratorService } from '../../standup-generator/standup-generator.service'
import { StandupAgentService } from '../../standup-agent/standup-agent.service'
import { AppTracingService } from '../../../../../platform/observability/app-tracing.service'
import { StandupReadRepository } from '../../../../../platform/database/repositories/standup-read.repository'
import { LocalDateService } from '../../../../../platform/time/local-date.service'
import { WorkerRuntimeConfigService } from '../../worker-runtime-config.service'

function makeGitActivity() {
  return {
    timestamp: '2026-04-01T00:00:00Z',
    repos: [{ name: 'repo1', commits: [{ message: 'fix: something' }] }],
  }
}

describe('ExecuteGenerateStrategy — PI Agent branching', () => {
  let strategy: ExecuteGenerateStrategy
  const defaultOptions = {
    userId: 'user-1',
    discordUserId: 'discord-1',
    selectedRepos: ['repo1'],
    gitAuthor: 'Bruno',
    timezone: 'America/Sao_Paulo',
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mocks.runtimeConfig.USE_PI_AGENT = false
    mocks.gitCollect.mockResolvedValue(Result.ok(makeGitActivity()))
    mocks.boardCollect.mockResolvedValue(null)
    mocks.legacyGenerate.mockResolvedValue(
      Result.ok({ content: 'legacy content', summary: 'legacy' }),
    )
    mocks.agentGenerate.mockResolvedValue(
      Result.ok({ content: 'agent content', summary: 'agent' }),
    )

    strategy = new ExecuteGenerateStrategy(
      new AppLoggerFactory() as never,
      new GitCollectorService() as never,
      new AzureDevopsActivityCollectorService() as never,
      new StandupGeneratorService() as never,
      new AppTracingService() as never,
      new StandupReadRepository() as never,
      new LocalDateService() as never,
      new StandupAgentService() as never,
      new WorkerRuntimeConfigService() as never,
    )
  })

  it('uses legacy generator when USE_PI_AGENT is false', async () => {
    mocks.runtimeConfig.USE_PI_AGENT = false

    const result = await strategy.execute({
      options: defaultOptions as never,
      today: '2026-04-01',
    })

    expect(result.isOk()).toBe(true)
    expect(mocks.legacyGenerate).toHaveBeenCalled()
    expect(mocks.agentGenerate).not.toHaveBeenCalled()
  })

  it('uses PI Agent when USE_PI_AGENT is true', async () => {
    mocks.runtimeConfig.USE_PI_AGENT = true

    const result = await strategy.execute({
      options: defaultOptions as never,
      today: '2026-04-01',
    })

    expect(result.isOk()).toBe(true)
    expect(mocks.agentGenerate).toHaveBeenCalled()
    expect(mocks.legacyGenerate).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/api && bunx vitest run src/contexts/standups/worker/standup/strategies/execute-generate-strategy.spec.ts
```

Expected: FAIL — constructor doesn't accept `StandupAgentService` yet.

- [ ] **Step 3: Modify `ExecuteGenerateStrategy`**

In `apps/api/src/contexts/standups/worker/standup/strategies/execute-generate-strategy.ts`:

Add imports at the top (after existing imports):

```typescript
import { StandupAgentService } from '../../standup-agent/standup-agent.service'
import { WorkerRuntimeConfigService } from '../../worker-runtime-config.service'
```

Add to constructor parameters (after `localDateService`):

```typescript
    private readonly standupAgent: StandupAgentService,
    private readonly runtimeConfig: WorkerRuntimeConfigService,
```

Replace the generation block (lines 176-208, from `// --- Generate standup ---` through the `this.standupGenerator.generateStandup(...)` call and its closing):

```typescript
    // --- Generate standup ---
    const meetingType = this.standupGenerator.determineMeetingType(today)

    const usePiAgent = this.runtimeConfig.config.USE_PI_AGENT
    const generated = usePiAgent
      ? await this.tracing.withSpan(
          'standup.agent.generate',
          { 'standup.meeting_type': meetingType, 'standup.mode': 'agent' },
          () =>
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
            }),
        )
      : await this.tracing.withSpan(
          'standup.llm.generate',
          { 'standup.meeting_type': meetingType, 'standup.mode': 'generate' },
          () =>
            this.standupGenerator.generateStandup(
              {
                date: today,
                meetingType,
                gitActivity: gitActivity ?? undefined,
                boardActivity: boardActivity ?? undefined,
                extraContext: options.extraContext?.trim() || undefined,
                azureDevopsUuid: options.azureDevopsUuid,
              },
              async (stage) => {
                if (stage === 'enriching_data') {
                  await this.reportStage(
                    reportProgress,
                    'enriching_data',
                    'Enriquecendo contexto para o standup',
                  )
                  return
                }

                await this.reportStage(
                  reportProgress,
                  'generating_standup',
                  'Gerando texto do standup',
                )
              },
            ),
        )
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd apps/api && bunx vitest run src/contexts/standups/worker/standup/strategies/execute-generate-strategy.spec.ts
```

Expected: PASS — both branching tests green.

- [ ] **Step 5: Run full typecheck**

```bash
cd apps/api && bun run typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/contexts/standups/worker/standup/strategies/execute-generate-strategy.ts apps/api/src/contexts/standups/worker/standup/strategies/execute-generate-strategy.spec.ts
git commit -m "feat: wire ExecuteGenerateStrategy to branch on USE_PI_AGENT"
```

---

### Task 8: Run full test suite and fix issues

**Files:** None (verification only)

- [ ] **Step 1: Run full test suite**

```bash
cd apps/api && bun run test
```

Expected: All existing tests PASS. If any test breaks due to the new constructor parameter on `ExecuteGenerateStrategy`, those tests need the new dependencies mocked.

- [ ] **Step 2: Run lint**

```bash
cd apps/api && bun run lint
```

Fix any Biome issues.

- [ ] **Step 3: Run typecheck**

```bash
cd apps/api && bun run typecheck
```

Expected: PASS.

- [ ] **Step 4: Commit any fixes**

```bash
git add -u
git commit -m "fix: resolve test/lint issues from PI Agent integration"
```

---

### Task 9: Integration smoke test

**Files:** None (manual verification)

- [ ] **Step 1: Verify with `USE_PI_AGENT=false` (default)**

Start the app and trigger a standup. Confirm it uses the legacy path (check logs for `standup-generator` logger, not `standup-agent`).

```bash
cd apps/api && USE_PI_AGENT=false bun run dev
```

- [ ] **Step 2: Verify with `USE_PI_AGENT=true`**

Start the app with the flag enabled. Trigger a standup. Confirm logs show `standup-agent` / `Calling PI Agent` messages.

```bash
cd apps/api && USE_PI_AGENT=true bun run dev
```

- [ ] **Step 3: Document findings**

If the PI Agent integration works, great. If there are runtime issues with `pi-ai` providers under Bun, document them for follow-up.

---

## Summary

| Task | Description | Files |
|------|-------------|-------|
| 1 | Install dependencies | `package.json` |
| 2 | Add `USE_PI_AGENT` env var | `env.schema.ts`, `env.service.ts`, `worker-runtime-config.service.ts` |
| 3 | Create `submit_standup` tool | `submit-standup.tool.ts` + spec |
| 4 | Create `pi-ai-model-adapter` | `pi-ai-model-adapter.ts` + spec |
| 5 | Create `StandupAgentService` | `standup-agent.service.ts` + spec |
| 6 | Create NestJS module + DI wiring | `standup-agent.module.ts`, `worker.module.ts` |
| 7 | Wire `ExecuteGenerateStrategy` branching | `execute-generate-strategy.ts` + spec |
| 8 | Full test suite verification | N/A |
| 9 | Integration smoke test | N/A |
