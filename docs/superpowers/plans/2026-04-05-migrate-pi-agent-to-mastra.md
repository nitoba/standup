# Migrate pi-agent-core to Mastra Agents — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `@mariozechner/pi-agent-core` and `@mariozechner/pi-ai` with Mastra (`@mastra/core`, `@mastra/memory`, `@mastra/libsql`), consolidating all LLM generation into a single Mastra Agent with persistent memory.

**Architecture:** A Mastra Agent with structured output (Zod schema) replaces the pi-agent-core Agent + submit_standup tool. `@mastra/memory` with LibSQL storage replaces the in-memory `AgentSessionManager`. The `LlmProviderRegistry` continues selecting models — its output is adapted to Mastra's `"provider/model-name"` format. The `StandupGeneratorService` (AI SDK fallback path) is eliminated.

**Tech Stack:** `@mastra/core`, `@mastra/memory`, `@mastra/libsql`, Zod, NestJS, Vitest

**Spec:** `docs/superpowers/specs/2026-04-05-migrate-pi-agent-to-mastra-design.md`

---

## File Structure

### New files (under `apps/api/src/contexts/standups/worker/standup-agent/`)

| File | Responsibility |
|---|---|
| `mastra/mastra.provider.ts` | NestJS provider factory — creates Mastra instance with LibSQLStore, Memory, and the standup agent |
| `mastra/standup-agent.def.ts` | Mastra Agent definition (id, name, memory config) |
| `mastra/standup-output.schema.ts` | Zod schema for structured output (`content` + `summary`) |
| `mastra/mastra.provider.spec.ts` | Tests for the Mastra provider factory |

### Files to delete

| File | Reason |
|---|---|
| `standup-agent/agent-session-manager.ts` | Replaced by Mastra Memory |
| `standup-agent/agent-session-manager.spec.ts` | Test for above |
| `standup-agent/build-seed-messages.ts` | Unnecessary with persistent Memory |
| `standup-agent/build-seed-messages.spec.ts` | Test for above |
| `standup-agent/pi-ai-model-adapter.ts` | Mastra model router handles this |
| `standup-agent/pi-ai-model-adapter.spec.ts` | Test for above |
| `standup-agent/submit-standup.tool.ts` | Replaced by structured output |
| `standup-agent/submit-standup.tool.spec.ts` | Test for above |

### Files to modify

| File | Change |
|---|---|
| `standup-agent/standup-agent.service.ts` | Rewrite: use Mastra agent with Memory + structured output |
| `standup-agent/standup-agent.service.spec.ts` | Rewrite tests for Mastra agent |
| `standup-agent/standup-agent.module.ts` | Import Mastra provider, remove pi-agent-core deps |
| `standup/types.ts` | Remove `agent?: Agent` from `GeneratedContent`, remove pi-agent-core import |
| `standup/standup-pipeline.service.ts` | Remove session manager usage |
| `standup/strategies/execute-generate-strategy.ts` | Remove session manager and agent return |
| `standup/strategies/execute-generate-strategy.spec.ts` | Adapt tests |
| `standup/strategies/execute-adjust-strategy.ts` | Remove session lookup logic |
| `standup/strategies/execute-adjust-strategy.spec.ts` | Adapt tests |
| `standup-generator/standup-generator.service.ts` | Delete (consolidated into Mastra agent) |
| `standup-generator/standup-generator.service.spec.ts` | Delete |
| `standup-generator/standup-generator.module.ts` | Remove StandupGeneratorService, keep PromptService + Registry |
| `platform/env/env.schema.ts` | Rename `GOOGLE_API_KEY` → `GOOGLE_GENERATIVE_AI_API_KEY` |
| `platform/env/env.service.ts` | Update getter to use new env var name |
| `worker-runtime-config.service.ts` | Update config property name |
| `apps/api/package.json` | Add @mastra/*, remove @mariozechner/* |

---

## Task 1: Install Mastra packages and remove pi-agent-core

**Files:**
- Modify: `apps/api/package.json`

- [ ] **Step 1: Install Mastra packages**

```bash
cd apps/api && bun add @mastra/core@latest @mastra/memory@latest @mastra/libsql@latest
```

- [ ] **Step 2: Remove pi-agent-core packages**

```bash
cd apps/api && bun remove @mariozechner/pi-agent-core @mariozechner/pi-ai
```

- [ ] **Step 3: Verify installation**

```bash
ls node_modules/@mastra/
```

Expected: directories `core`, `memory`, `libsql` present.

- [ ] **Step 4: Commit**

```bash
git add apps/api/package.json bun.lock
git commit -m "chore: replace pi-agent-core with mastra packages"
```

---

## Task 2: Rename Google API key env var

**Files:**
- Modify: `apps/api/src/platform/env/env.schema.ts`
- Modify: `apps/api/src/platform/env/env.service.ts`
- Modify: `apps/api/src/contexts/standups/worker/worker-runtime-config.service.ts`

- [ ] **Step 1: Update env schema**

In `apps/api/src/platform/env/env.schema.ts`, rename the key inside the `z.object({})`:

Replace:
```ts
GOOGLE_API_KEY: z.string().optional(),
```

With:
```ts
GOOGLE_GENERATIVE_AI_API_KEY: z.string().optional(),
```

- [ ] **Step 2: Update EnvService getter**

In `apps/api/src/platform/env/env.service.ts`, inside the `get worker()` getter, update the property:

Replace:
```ts
googleApiKey: this.configService.get('GOOGLE_API_KEY'),
```

With:
```ts
googleApiKey: this.configService.get('GOOGLE_GENERATIVE_AI_API_KEY'),
```

- [ ] **Step 3: Update WorkerRuntimeConfig interface and service**

In `apps/api/src/contexts/standups/worker/worker-runtime-config.service.ts`:

Replace the interface property:
```ts
GOOGLE_API_KEY: string
```

With:
```ts
GOOGLE_GENERATIVE_AI_API_KEY: string
```

Replace the config getter property:
```ts
GOOGLE_API_KEY: worker.googleApiKey ?? '',
```

With:
```ts
GOOGLE_GENERATIVE_AI_API_KEY: worker.googleApiKey ?? '',
```

- [ ] **Step 4: Set env var in process for Mastra model router**

The Mastra model router reads `GOOGLE_GENERATIVE_AI_API_KEY` directly from `process.env`. The NestJS `ConfigService` doesn't automatically expose env vars to `process.env`. We need to ensure the key is set.

In `apps/api/src/platform/env/env.service.ts`, add a static helper or do this in the Mastra provider (Task 5). For now, this will be handled in the Mastra provider factory.

- [ ] **Step 5: Verify typecheck passes**

```bash
cd apps/api && bunx tsc --noEmit 2>&1 | head -30
```

Expected: Errors only from files importing pi-agent-core (expected — we haven't migrated those yet).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/platform/env/env.schema.ts apps/api/src/platform/env/env.service.ts apps/api/src/contexts/standups/worker/worker-runtime-config.service.ts
git commit -m "refactor: rename GOOGLE_API_KEY to GOOGLE_GENERATIVE_AI_API_KEY for Mastra"
```

---

## Task 3: Create Mastra structured output schema

**Files:**
- Create: `apps/api/src/contexts/standups/worker/standup-agent/mastra/standup-output.schema.ts`
- Test: `apps/api/src/contexts/standups/worker/standup-agent/mastra/standup-output.schema.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/contexts/standups/worker/standup-agent/mastra/standup-output.schema.spec.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { standupOutputSchema } from './standup-output.schema'

describe('standupOutputSchema', () => {
  it('should accept valid standup output', () => {
    const result = standupOutputSchema.safeParse({
      content: 'Standup content here',
      summary: 'Brief summary',
    })

    expect(result.success).toBe(true)
    expect(result.data).toEqual({
      content: 'Standup content here',
      summary: 'Brief summary',
    })
  })

  it('should reject missing content', () => {
    const result = standupOutputSchema.safeParse({
      summary: 'Brief summary',
    })

    expect(result.success).toBe(false)
  })

  it('should reject missing summary', () => {
    const result = standupOutputSchema.safeParse({
      content: 'Standup content here',
    })

    expect(result.success).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/api && bunx vitest run src/contexts/standups/worker/standup-agent/mastra/standup-output.schema.spec.ts
```

Expected: FAIL — cannot resolve module `./standup-output.schema`

- [ ] **Step 3: Write the schema**

Create `apps/api/src/contexts/standups/worker/standup-agent/mastra/standup-output.schema.ts`:

```ts
import { z } from 'zod'

export const standupOutputSchema = z.object({
  content: z
    .string()
    .describe('Standup formatado em portugues, max 2000 chars'),
  summary: z.string().describe('Resumo de 1 linha do standup'),
})

export type StandupOutput = z.infer<typeof standupOutputSchema>
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd apps/api && bunx vitest run src/contexts/standups/worker/standup-agent/mastra/standup-output.schema.spec.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/contexts/standups/worker/standup-agent/mastra/
git commit -m "feat: add Zod structured output schema for Mastra standup agent"
```

---

## Task 4: Create Mastra Agent definition

**Files:**
- Create: `apps/api/src/contexts/standups/worker/standup-agent/mastra/standup-agent.def.ts`

- [ ] **Step 1: Check Mastra Agent constructor API from embedded docs**

Now that packages are installed, verify the exact API:

```bash
ls node_modules/@mastra/core/dist/docs/references/ 2>/dev/null
```

```bash
grep -r "new Agent" node_modules/@mastra/core/dist/docs/references/ 2>/dev/null | head -10
```

If embedded docs exist, read them to confirm constructor signature. If not, rely on the remote docs we already fetched.

- [ ] **Step 2: Check Memory constructor API**

```bash
grep -r "new Memory" node_modules/@mastra/memory/dist/docs/references/ 2>/dev/null | head -10
```

- [ ] **Step 3: Create the agent definition**

Create `apps/api/src/contexts/standups/worker/standup-agent/mastra/standup-agent.def.ts`:

```ts
import { Agent } from '@mastra/core/agent'
import { Memory } from '@mastra/memory'

export const STANDUP_AGENT_ID = 'standup-agent'

export function createStandupAgent(memory: Memory): Agent {
  return new Agent({
    id: STANDUP_AGENT_ID,
    name: 'Standup Agent',
    instructions: '', // overridden per-call
    model: '', // overridden per-call via LlmProviderRegistry
    memory,
  })
}
```

Note: We use a factory function instead of a top-level const because `Memory` needs `LibSQLStore` which needs the `DATABASE_URL` at runtime.

- [ ] **Step 4: Verify file compiles**

```bash
cd apps/api && bunx tsc --noEmit src/contexts/standups/worker/standup-agent/mastra/standup-agent.def.ts 2>&1 | head -20
```

If there are type errors, adjust imports based on what the embedded docs reveal.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/contexts/standups/worker/standup-agent/mastra/standup-agent.def.ts
git commit -m "feat: add Mastra standup agent definition"
```

---

## Task 5: Create Mastra NestJS provider

**Files:**
- Create: `apps/api/src/contexts/standups/worker/standup-agent/mastra/mastra.provider.ts`
- Test: `apps/api/src/contexts/standups/worker/standup-agent/mastra/mastra.provider.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/contexts/standups/worker/standup-agent/mastra/mastra.provider.spec.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'

vi.mock('@mastra/core', () => ({
  Mastra: vi.fn().mockImplementation(() => ({
    getAgent: vi.fn().mockReturnValue({ id: 'standup-agent' }),
  })),
}))

vi.mock('@mastra/core/agent', () => ({
  Agent: vi.fn().mockImplementation((config: Record<string, unknown>) => ({
    id: config.id,
  })),
}))

vi.mock('@mastra/memory', () => ({
  Memory: vi.fn().mockImplementation(() => ({})),
}))

vi.mock('@mastra/libsql', () => ({
  LibSQLStore: vi.fn().mockImplementation(() => ({})),
}))

vi.mock('./standup-agent.def', () => ({
  STANDUP_AGENT_ID: 'standup-agent',
  createStandupAgent: vi.fn().mockReturnValue({ id: 'standup-agent' }),
}))

import {
  MASTRA_INSTANCE,
  MASTRA_STANDUP_AGENT,
  mastraProviders,
} from './mastra.provider'

describe('mastraProviders', () => {
  it('should export MASTRA_INSTANCE and MASTRA_STANDUP_AGENT tokens', () => {
    expect(MASTRA_INSTANCE).toBe('MASTRA_INSTANCE')
    expect(MASTRA_STANDUP_AGENT).toBe('MASTRA_STANDUP_AGENT')
  })

  it('should define two providers', () => {
    expect(mastraProviders).toHaveLength(2)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/api && bunx vitest run src/contexts/standups/worker/standup-agent/mastra/mastra.provider.spec.ts
```

Expected: FAIL — cannot resolve `./mastra.provider`

- [ ] **Step 3: Write the provider**

Create `apps/api/src/contexts/standups/worker/standup-agent/mastra/mastra.provider.ts`:

```ts
import type { Provider } from '@nestjs/common'
import { Mastra } from '@mastra/core'
import { LibSQLStore } from '@mastra/libsql'
import { Memory } from '@mastra/memory'
import type { Agent } from '@mastra/core/agent'
import { EnvService } from '../../../../../platform/env/env.service'
import { createStandupAgent, STANDUP_AGENT_ID } from './standup-agent.def'

export const MASTRA_INSTANCE = 'MASTRA_INSTANCE'
export const MASTRA_STANDUP_AGENT = 'MASTRA_STANDUP_AGENT'

export const mastraProviders: Provider[] = [
  {
    provide: MASTRA_INSTANCE,
    useFactory: (env: EnvService) => {
      const { url: databaseUrl, authToken } = env.database

      // Ensure API keys are available in process.env for Mastra model router
      const { googleApiKey, groqApiKey, openrouterApiKey } = env.worker
      if (googleApiKey) {
        process.env.GOOGLE_GENERATIVE_AI_API_KEY = googleApiKey
      }
      if (groqApiKey) {
        process.env.GROQ_API_KEY = groqApiKey
      }
      if (openrouterApiKey) {
        process.env.OPENROUTER_API_KEY = openrouterApiKey
      }

      const storage = new LibSQLStore({
        url: databaseUrl,
        ...(authToken ? { authToken } : {}),
      })

      const memory = new Memory({
        storage,
        options: {
          lastMessages: 20,
        },
      })

      const standupAgent = createStandupAgent(memory)

      return new Mastra({
        agents: { [STANDUP_AGENT_ID]: standupAgent },
        storage,
      })
    },
    inject: [EnvService],
  },
  {
    provide: MASTRA_STANDUP_AGENT,
    useFactory: (mastra: Mastra): Agent => {
      return mastra.getAgent(STANDUP_AGENT_ID)
    },
    inject: [MASTRA_INSTANCE],
  },
]
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd apps/api && bunx vitest run src/contexts/standups/worker/standup-agent/mastra/mastra.provider.spec.ts
```

Expected: PASS

- [ ] **Step 5: Verify types compile**

```bash
cd apps/api && bunx tsc --noEmit src/contexts/standups/worker/standup-agent/mastra/mastra.provider.ts 2>&1 | head -20
```

If there are import issues (e.g., `Mastra` is not exported from `@mastra/core`), check the embedded docs:

```bash
cat node_modules/@mastra/core/dist/docs/assets/SOURCE_MAP.json | head -50
```

Adjust imports accordingly.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/contexts/standups/worker/standup-agent/mastra/mastra.provider.ts apps/api/src/contexts/standups/worker/standup-agent/mastra/mastra.provider.spec.ts
git commit -m "feat: add NestJS provider factory for Mastra instance"
```

---

## Task 6: Remove GeneratedContent.agent and session manager from types and pipeline

**Files:**
- Modify: `apps/api/src/contexts/standups/worker/standup/types.ts`
- Modify: `apps/api/src/contexts/standups/worker/standup/standup-pipeline.service.ts`

- [ ] **Step 1: Remove agent from types.ts**

In `apps/api/src/contexts/standups/worker/standup/types.ts`:

Remove the import:
```ts
import type { Agent } from '@mariozechner/pi-agent-core'
```

Remove `agent?: Agent` from the `GeneratedContent` interface (keep all other properties):

Replace the `GeneratedContent` interface with:
```ts
export interface GeneratedContent {
  content: string
  meetingType: string
  sourceData: string
  replaceStandupId?: string
}
```

- [ ] **Step 2: Remove session manager from pipeline**

In `apps/api/src/contexts/standups/worker/standup/standup-pipeline.service.ts`:

Remove the import:
```ts
import { AgentSessionManager } from '../standup-agent/agent-session-manager'
```

Remove `sessionManager` from the constructor:
```ts
private readonly sessionManager: AgentSessionManager,
```

Remove the session creation block (lines ~118-122):
```ts
    // Create agent session if agent instance was returned by strategy
    if (generated.agent) {
      this.sessionManager.create(standupId, generated.agent)
      this.logger.info('Agent session created', { standupId })
    }
```

- [ ] **Step 3: Verify typecheck**

```bash
cd apps/api && bunx tsc --noEmit 2>&1 | grep -E "types\.ts|standup-pipeline" | head -20
```

Expected: No errors in these files (other files importing pi-agent-core will still error).

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/contexts/standups/worker/standup/types.ts apps/api/src/contexts/standups/worker/standup/standup-pipeline.service.ts
git commit -m "refactor: remove agent session from types and pipeline"
```

---

## Task 7: Update execute-generate-strategy to remove session manager

**Files:**
- Modify: `apps/api/src/contexts/standups/worker/standup/strategies/execute-generate-strategy.ts`
- Modify: `apps/api/src/contexts/standups/worker/standup/strategies/execute-generate-strategy.spec.ts`

- [ ] **Step 1: Remove session manager from strategy**

In `apps/api/src/contexts/standups/worker/standup/strategies/execute-generate-strategy.ts`:

Remove the import:
```ts
import { AgentSessionManager } from '../../standup-agent/agent-session-manager'
```

Remove from constructor:
```ts
private readonly sessionManager: AgentSessionManager,
```

Remove the `agent` from the `Agent` import at the top (the `type { Agent } from '@mariozechner/pi-agent-core'` import).

Remove the session destroy call before generation (lines ~184-187):
```ts
    // Destroy old agent session on regenerate
    if (options.replaceStandupId) {
      this.sessionManager.destroy(options.replaceStandupId)
    }
```

Remove `agent` from the return value (line ~230):

Replace:
```ts
    return Result.ok<GeneratedContent>({
      content: generated.value.content,
      meetingType,
      sourceData: JSON.stringify({ git: gitActivity, board: boardActivity }),
      agent: generated.value.agent as Agent,
    })
```

With:
```ts
    return Result.ok<GeneratedContent>({
      content: generated.value.content,
      meetingType,
      sourceData: JSON.stringify({ git: gitActivity, board: boardActivity }),
    })
```

- [ ] **Step 2: Update the spec file**

In `apps/api/src/contexts/standups/worker/standup/strategies/execute-generate-strategy.spec.ts`:

Remove any mocks or references to `AgentSessionManager`. Remove references to `generated.value.agent`. Search for `sessionManager`, `AgentSessionManager`, `agent-session-manager` and remove all occurrences.

The mock for `StandupAgentService.generate` should return `{ content: '...', summary: '...' }` without an `agent` property.

- [ ] **Step 3: Run the strategy tests**

```bash
cd apps/api && bunx vitest run src/contexts/standups/worker/standup/strategies/execute-generate-strategy.spec.ts
```

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/contexts/standups/worker/standup/strategies/execute-generate-strategy.ts apps/api/src/contexts/standups/worker/standup/strategies/execute-generate-strategy.spec.ts
git commit -m "refactor: remove session manager from generate strategy"
```

---

## Task 8: Simplify execute-adjust-strategy

**Files:**
- Modify: `apps/api/src/contexts/standups/worker/standup/strategies/execute-adjust-strategy.ts`
- Modify: `apps/api/src/contexts/standups/worker/standup/strategies/execute-adjust-strategy.spec.ts`

- [ ] **Step 1: Read the current adjust strategy**

```bash
cat apps/api/src/contexts/standups/worker/standup/strategies/execute-adjust-strategy.ts
```

The adjust strategy calls `standupAgent.adjust()` with the standup ID and instruction. The agent service internally handles session lookup. After migration, `adjust()` still receives the same params — the Memory handles session persistence. The strategy itself should not need major changes beyond removing any session-related logic.

- [ ] **Step 2: Update the strategy if needed**

Check if the strategy references `AgentSessionManager` or agent sessions directly. If it does, remove those references. The `StandupAgentService.adjust()` contract stays the same.

- [ ] **Step 3: Update the spec file**

Remove any mocks for `AgentSessionManager` in the adjust strategy spec.

- [ ] **Step 4: Run tests**

```bash
cd apps/api && bunx vitest run src/contexts/standups/worker/standup/strategies/execute-adjust-strategy.spec.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/contexts/standups/worker/standup/strategies/execute-adjust-strategy.ts apps/api/src/contexts/standups/worker/standup/strategies/execute-adjust-strategy.spec.ts
git commit -m "refactor: simplify adjust strategy, remove session manager refs"
```

---

## Task 9: Adapt LlmProviderRegistry model format for Mastra

**Files:**
- Modify: `apps/api/src/contexts/standups/worker/standup-generator/llm-provider-registry.ts`

The `LlmProviderRegistry.getNextModel()` returns a `ModelSelection` with `provider` (e.g., `"google"`) and `modelKey` (e.g., `"google:gemini-2.5-pro"`). The Mastra model router expects `"google/gemini-2.5-pro"` or `"openrouter/google/gemini-2.5-pro"`.

- [ ] **Step 1: Add a helper method to convert model format**

In `apps/api/src/contexts/standups/worker/standup-generator/llm-provider-registry.ts`, add a public method:

```ts
/**
 * Converts internal modelKey format ("provider:model") to Mastra model router format ("provider/model").
 * For openrouter, produces "openrouter/originalProvider/model".
 */
toMastraModelString(selection: ModelSelection): string {
  const { modelKey, provider } = selection
  // modelKey format: "provider:modelName" e.g. "google:gemini-2.5-pro"
  const colonIndex = modelKey.indexOf(':')
  const modelName = colonIndex >= 0 ? modelKey.slice(colonIndex + 1) : modelKey

  if (provider === 'openrouter') {
    // OpenRouter models may have nested provider prefix in modelName
    // e.g. modelKey = "openrouter:google/gemini-2.5-pro"
    return `openrouter/${modelName}`
  }

  return `${provider}/${modelName}`
}
```

- [ ] **Step 2: Verify existing model key formats**

Before implementing, read the registry config to understand the exact `modelKey` and `provider` formats used:

```bash
grep -n "modelKey\|provider" apps/api/src/contexts/standups/worker/standup-generator/llm-provider-registry.ts | head -30
```

Adjust the conversion logic based on the actual format found.

- [ ] **Step 3: Run existing registry tests**

```bash
cd apps/api && bunx vitest run src/contexts/standups/worker/standup-generator/llm-provider-registry.spec.ts 2>/dev/null || echo "No test file found"
```

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/contexts/standups/worker/standup-generator/llm-provider-registry.ts
git commit -m "feat: add toMastraModelString helper to LlmProviderRegistry"
```

---

## Task 10: Rewrite StandupAgentService with Mastra

This is the core task. The service is rewritten to use the Mastra Agent with Memory and structured output.

**Files:**
- Modify: `apps/api/src/contexts/standups/worker/standup-agent/standup-agent.service.ts`

- [ ] **Step 1: Write the failing test first**

Create a fresh `standup-agent.service.spec.ts` (see Task 11 for full test). For now, write the test for `generate()`:

In `apps/api/src/contexts/standups/worker/standup-agent/standup-agent.service.spec.ts`, replace the entire file with:

```ts
/** biome-ignore-all lint/style/noNonNullAssertion: test assertions */
/** biome-ignore-all lint/suspicious/noExplicitAny: mock typing */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AllProvidersUnavailableError } from '../../../../shared/domain'
import type { AgentGenerateInput } from './standup-agent.service'
import { StandupAgentService } from './standup-agent.service'

// --- Mock Mastra Agent ---
const mockGenerate = vi.fn()
const mockStream = vi.fn()

const mockAgent = {
  generate: mockGenerate,
  stream: mockStream,
}

// --- Factories ---
function makeLoggerFactory() {
  return {
    create: vi.fn(() => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    })),
  }
}

function makePromptService() {
  return {
    buildSystemPrompt: vi.fn().mockReturnValue('system-prompt'),
    buildUserMessage: vi.fn().mockReturnValue('user-message'),
    buildRewriteUserMessage: vi.fn().mockReturnValue('rewrite-message'),
    buildAdjustUserMessage: vi.fn().mockReturnValue('adjust-message'),
    buildWeeklyInsightsSystemPrompt: vi.fn().mockReturnValue('weekly-system'),
    buildWeeklyInsightsUserMessage: vi.fn().mockReturnValue('weekly-user'),
    determineMeetingType: vi.fn().mockReturnValue('daily'),
  }
}

function makeLlmRegistry() {
  return {
    getNextModel: vi.fn().mockReturnValue({
      model: {},
      modelKey: 'google:gemini-2.5-pro',
      provider: 'google',
      tier: 0,
    }),
    toMastraModelString: vi.fn().mockReturnValue('google/gemini-2.5-pro'),
    reportFailure: vi.fn(),
    reportSuccess: vi.fn(),
    totalModels: 1,
  }
}

function makeRuntimeConfig() {
  return {
    config: {
      GOOGLE_GENERATIVE_AI_API_KEY: 'test-key',
      GROQ_API_KEY: 'test-key',
      OPENROUTER_API_KEY: 'test-key',
    },
  }
}

function makeInput(overrides: Partial<AgentGenerateInput> = {}): AgentGenerateInput {
  return {
    date: '2026-04-05',
    meetingType: 'daily',
    gitActivity: { author: 'user', commits: [], repos: [] },
    ...overrides,
  }
}

describe('StandupAgentService', () => {
  let service: StandupAgentService

  beforeEach(() => {
    vi.clearAllMocks()

    mockGenerate.mockResolvedValue({
      object: { content: 'standup content', summary: 'summary' },
      text: 'standup content',
      usage: { promptTokens: 100, completionTokens: 50 },
    })

    service = new StandupAgentService(
      makeLoggerFactory() as any,
      makePromptService() as any,
      makeLlmRegistry() as any,
      makeRuntimeConfig() as any,
      mockAgent as any,
    )
  })

  describe('generate', () => {
    it('should generate standup with structured output', async () => {
      const result = await service.generate(makeInput())

      expect(result.isOk()).toBe(true)
      expect(result.value).toEqual(
        expect.objectContaining({
          content: 'standup content',
          summary: 'summary',
        }),
      )
    })

    it('should pass memory context with userId and standupId thread', async () => {
      await service.generate(makeInput())

      expect(mockGenerate).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          memory: expect.objectContaining({
            resource: expect.stringContaining('user-'),
          }),
        }),
      )
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/api && bunx vitest run src/contexts/standups/worker/standup-agent/standup-agent.service.spec.ts
```

Expected: FAIL — the current service still imports pi-agent-core.

- [ ] **Step 3: Rewrite the service**

Replace the entire content of `apps/api/src/contexts/standups/worker/standup-agent/standup-agent.service.ts`:

```ts
import type { Agent } from '@mastra/core/agent'
import { Inject, Injectable } from '@nestjs/common'
import { AppLoggerFactory } from '../../../../platform/logger'
import {
  type GeneratedStandup,
  type GenerateStandupInput,
  type StandupRecord,
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
import { WorkerRuntimeConfigService } from '../worker-runtime-config.service'
import { MASTRA_STANDUP_AGENT } from './mastra/mastra.provider'
import { standupOutputSchema } from './mastra/standup-output.schema'

export type GeneratorStage = 'enriching_data' | 'generating_standup'

export interface AgentGenerateInput {
  date: string
  meetingType: string
  gitActivity?: GenerateStandupInput['gitActivity']
  boardActivity?: GenerateStandupInput['boardActivity']
  enrichedActivity?: EnrichedGitActivity
  extraContext?: string
  azureDevopsUuid?: string
  onStageChange?: (stage: GeneratorStage) => Promise<void> | void
  onContentDelta?: (partialContent: string) => void
}

export interface AgentAdjustInput {
  standupId: string
  instruction: string
  previousContent: string
  previousSummary?: string
  extraContext?: string
  onStageChange?: (stage: GeneratorStage) => Promise<void> | void
  onContentDelta?: (partialContent: string) => void
}

const AGENT_TIMEOUT_MS = 60_000

@Injectable()
export class StandupAgentService {
  private readonly logger

  constructor(
    private readonly loggerFactory: AppLoggerFactory,
    private readonly standupPrompt: StandupPromptService,
    private readonly llmRegistry: LlmProviderRegistry,
    private readonly runtimeConfig: WorkerRuntimeConfigService,
    @Inject(MASTRA_STANDUP_AGENT) private readonly agent: Agent,
  ) {
    this.logger = this.loggerFactory.create(StandupAgentService.name)
  }

  async generate(
    input: AgentGenerateInput,
  ): Promise<
    Result<GeneratedStandup, ExternalServiceError | AllProvidersUnavailableError>
  > {
    const { date, meetingType, gitActivity, boardActivity, enrichedActivity } =
      input

    const systemPrompt = this.standupPrompt.buildSystemPrompt({
      hasGit: !!gitActivity,
      hasBoard: !!boardActivity,
    })

    const userMessage = this.standupPrompt.buildUserMessage(
      { date, meetingType, gitActivity, boardActivity },
      enrichedActivity,
    )

    await input.onStageChange?.('generating_standup')

    return this.callWithModelFallback(async (modelString) => {
      const generateOptions = {
        instructions: systemPrompt,
        model: modelString,
        output: standupOutputSchema,
        providerOptions: {
          google: { structuredOutputs: true },
        },
        memory: {
          resource: `user-${input.azureDevopsUuid ?? 'default'}`,
          thread: `standup-generate-${date}`,
        },
      }

      // Try streaming first for content deltas
      if (input.onContentDelta) {
        try {
          const stream = await this.agent.stream(userMessage, generateOptions)
          let hasChunks = false

          for await (const chunk of stream.textStream) {
            hasChunks = true
            input.onContentDelta(chunk)
          }

          if (hasChunks) {
            const result = await stream.object
            return this.validateAndRewrite(result, modelString, systemPrompt)
          }
        } catch (streamError) {
          this.logger.warn('Streaming failed, falling back to generate', {
            error: String(streamError),
          })
        }
      }

      // Fallback: non-streaming generate
      const response = await this.agent.generate(userMessage, generateOptions)
      return this.validateAndRewrite(
        response.object,
        modelString,
        systemPrompt,
      )
    })
  }

  async adjust(
    input: AgentAdjustInput,
  ): Promise<
    Result<GeneratedStandup, ExternalServiceError | AllProvidersUnavailableError>
  > {
    const adjustMessage = this.standupPrompt.buildAdjustUserMessage(
      input.previousContent,
      input.instruction,
      input.extraContext,
    )

    const systemPrompt = this.standupPrompt.buildSystemPrompt({
      hasGit: true,
      hasBoard: false,
    })

    await input.onStageChange?.('generating_standup')

    return this.callWithModelFallback(async (modelString) => {
      const response = await this.agent.generate(adjustMessage, {
        instructions: systemPrompt,
        model: modelString,
        output: standupOutputSchema,
        providerOptions: {
          google: { structuredOutputs: true },
        },
        memory: {
          resource: `user-default`,
          thread: `standup-${input.standupId}`,
        },
      })

      return {
        content: response.object.content,
        summary: response.object.summary ?? '',
      }
    })
  }

  async generateWeeklyInsights(
    standups: StandupRecord[],
  ): Promise<
    Result<string, ExternalServiceError | AllProvidersUnavailableError>
  > {
    const systemPrompt = this.standupPrompt.buildWeeklyInsightsSystemPrompt()
    const userMessage =
      this.standupPrompt.buildWeeklyInsightsUserMessage(standups)

    return this.callWithModelFallback(async (modelString) => {
      const response = await this.agent.generate(userMessage, {
        instructions: systemPrompt,
        model: modelString,
      })

      return response.text
    })
  }

  // --- Private helpers ---

  private async validateAndRewrite(
    output: { content: string; summary: string },
    modelString: string,
    systemPrompt: string,
  ): Promise<GeneratedStandup> {
    let { content, summary } = output

    if (content.length > MAX_STANDUP_CONTENT_CHARS) {
      this.logger.info('Content exceeds limit, requesting rewrite', {
        length: content.length,
        limit: MAX_STANDUP_CONTENT_CHARS,
      })

      const rewriteMessage = this.standupPrompt.buildRewriteUserMessage(
        content,
        summary,
      )

      const rewriteResponse = await this.agent.generate(rewriteMessage, {
        instructions: systemPrompt,
        model: modelString,
        output: standupOutputSchema,
        providerOptions: {
          google: { structuredOutputs: true },
        },
      })

      content = rewriteResponse.object.content
      summary = rewriteResponse.object.summary ?? summary
    }

    return { content, summary }
  }

  private async callWithModelFallback<T>(
    fn: (modelString: string) => Promise<T>,
  ): Promise<
    Result<T, ExternalServiceError | AllProvidersUnavailableError>
  > {
    const maxAttempts = this.llmRegistry.totalModels
    let lastError: Error | undefined

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      let selection: ReturnType<typeof this.llmRegistry.getNextModel>

      try {
        selection = this.llmRegistry.getNextModel()
      } catch (error) {
        if (error instanceof AllProvidersUnavailableError) {
          return Result.err(error)
        }
        throw error
      }

      const modelString = this.llmRegistry.toMastraModelString(selection)
      this.logger.info('Attempting generation', {
        model: modelString,
        attempt: attempt + 1,
      })

      try {
        const result = await Promise.race([
          fn(modelString),
          new Promise<never>((_, reject) =>
            setTimeout(
              () => reject(new Error('Agent timeout')),
              AGENT_TIMEOUT_MS,
            ),
          ),
        ])

        this.llmRegistry.reportSuccess(selection.modelKey)
        return Result.ok(result)
      } catch (error) {
        this.logger.warn('Model attempt failed', {
          model: modelString,
          attempt: attempt + 1,
          error: String(error),
        })
        this.llmRegistry.reportFailure(selection.modelKey, error)
        lastError = error instanceof Error ? error : new Error(String(error))
      }
    }

    return Result.err(
      new ExternalServiceError({
        service: 'llm',
        message: `All models failed: ${lastError?.message}`,
      }),
    )
  }
}
```

- [ ] **Step 4: Run the test**

```bash
cd apps/api && bunx vitest run src/contexts/standups/worker/standup-agent/standup-agent.service.spec.ts
```

Expected: PASS (or adjust test mocks if API differs from docs).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/contexts/standups/worker/standup-agent/standup-agent.service.ts apps/api/src/contexts/standups/worker/standup-agent/standup-agent.service.spec.ts
git commit -m "feat: rewrite StandupAgentService to use Mastra agent with Memory"
```

---

## Task 11: Write comprehensive tests for StandupAgentService

**Files:**
- Modify: `apps/api/src/contexts/standups/worker/standup-agent/standup-agent.service.spec.ts`

- [ ] **Step 1: Add tests for adjust**

Add to the existing describe block:

```ts
  describe('adjust', () => {
    it('should adjust standup using existing thread', async () => {
      const result = await service.adjust({
        standupId: 'standup-123',
        instruction: 'Make it shorter',
        previousContent: 'original content',
        previousSummary: 'original summary',
      })

      expect(result.isOk()).toBe(true)
      expect(result.value).toEqual(
        expect.objectContaining({ content: 'standup content' }),
      )
    })

    it('should pass standupId as thread for memory continuity', async () => {
      await service.adjust({
        standupId: 'standup-123',
        instruction: 'Make it shorter',
        previousContent: 'content',
      })

      expect(mockGenerate).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          memory: expect.objectContaining({
            thread: 'standup-standup-123',
          }),
        }),
      )
    })
  })
```

- [ ] **Step 2: Add tests for generateWeeklyInsights**

```ts
  describe('generateWeeklyInsights', () => {
    it('should generate weekly insights text', async () => {
      mockGenerate.mockResolvedValueOnce({
        text: 'Weekly insights here',
        usage: { promptTokens: 100, completionTokens: 50 },
      })

      const result = await service.generateWeeklyInsights([
        { id: '1', content: 'Monday standup', date: '2026-04-01' } as any,
      ])

      expect(result.isOk()).toBe(true)
      expect(result.value).toBe('Weekly insights here')
    })
  })
```

- [ ] **Step 3: Add test for model fallback**

```ts
  describe('model fallback', () => {
    it('should try next model when first fails', async () => {
      const registry = makeLlmRegistry()
      registry.totalModels = 2

      mockGenerate
        .mockRejectedValueOnce(new Error('Rate limit'))
        .mockResolvedValueOnce({
          object: { content: 'content', summary: 'summary' },
        })

      service = new StandupAgentService(
        makeLoggerFactory() as any,
        makePromptService() as any,
        registry as any,
        makeRuntimeConfig() as any,
        mockAgent as any,
      )

      const result = await service.generate(makeInput())

      expect(result.isOk()).toBe(true)
      expect(registry.reportFailure).toHaveBeenCalledTimes(1)
      expect(registry.reportSuccess).toHaveBeenCalledTimes(1)
    })
  })
```

- [ ] **Step 4: Run all tests**

```bash
cd apps/api && bunx vitest run src/contexts/standups/worker/standup-agent/standup-agent.service.spec.ts
```

Expected: All PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/contexts/standups/worker/standup-agent/standup-agent.service.spec.ts
git commit -m "test: add comprehensive tests for Mastra-based StandupAgentService"
```

---

## Task 12: Update StandupAgentModule

**Files:**
- Modify: `apps/api/src/contexts/standups/worker/standup-agent/standup-agent.module.ts`

- [ ] **Step 1: Rewrite the module**

Replace the entire content of `apps/api/src/contexts/standups/worker/standup-agent/standup-agent.module.ts`:

```ts
import { Module } from '@nestjs/common'
import { EnvModule } from '../../../../platform/env/env.module'
import { StandupGeneratorModule } from '../standup-generator/standup-generator.module'
import { WorkerRuntimeConfigModule } from '../worker-runtime-config.module'
import { mastraProviders } from './mastra/mastra.provider'
import { StandupAgentService } from './standup-agent.service'

@Module({
  imports: [StandupGeneratorModule, WorkerRuntimeConfigModule, EnvModule],
  providers: [...mastraProviders, StandupAgentService],
  exports: [StandupAgentService],
})
export class StandupAgentModule {}
```

Note: `AgentSessionManager` is removed from providers and exports. `EnvModule` is added for the Mastra provider factory. `mastraProviders` adds `MASTRA_INSTANCE` and `MASTRA_STANDUP_AGENT`.

- [ ] **Step 2: Verify the module compiles**

```bash
cd apps/api && bunx tsc --noEmit 2>&1 | grep "standup-agent.module" | head -10
```

Expected: No errors for this file.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/contexts/standups/worker/standup-agent/standup-agent.module.ts
git commit -m "refactor: update StandupAgentModule for Mastra providers"
```

---

## Task 13: Delete obsolete files

**Files to delete:**
- `apps/api/src/contexts/standups/worker/standup-agent/agent-session-manager.ts`
- `apps/api/src/contexts/standups/worker/standup-agent/agent-session-manager.spec.ts`
- `apps/api/src/contexts/standups/worker/standup-agent/build-seed-messages.ts`
- `apps/api/src/contexts/standups/worker/standup-agent/build-seed-messages.spec.ts`
- `apps/api/src/contexts/standups/worker/standup-agent/pi-ai-model-adapter.ts`
- `apps/api/src/contexts/standups/worker/standup-agent/pi-ai-model-adapter.spec.ts`
- `apps/api/src/contexts/standups/worker/standup-agent/submit-standup.tool.ts`
- `apps/api/src/contexts/standups/worker/standup-agent/submit-standup.tool.spec.ts`

- [ ] **Step 1: Delete all obsolete standup-agent files**

```bash
cd apps/api/src/contexts/standups/worker/standup-agent && rm -f \
  agent-session-manager.ts \
  agent-session-manager.spec.ts \
  build-seed-messages.ts \
  build-seed-messages.spec.ts \
  pi-ai-model-adapter.ts \
  pi-ai-model-adapter.spec.ts \
  submit-standup.tool.ts \
  submit-standup.tool.spec.ts
```

- [ ] **Step 2: Remove StandupGeneratorService**

```bash
rm -f apps/api/src/contexts/standups/worker/standup-generator/standup-generator.service.ts \
      apps/api/src/contexts/standups/worker/standup-generator/standup-generator.service.spec.ts
```

- [ ] **Step 3: Update StandupGeneratorModule to remove the service**

In `apps/api/src/contexts/standups/worker/standup-generator/standup-generator.module.ts`:

Remove `StandupGeneratorService` from providers (keep `StandupPromptService` and `LlmProviderRegistry`).

The module should look like:

```ts
import { Module } from '@nestjs/common'
import { AzureDevopsModule } from '../azure-devops/azure-devops.module'
import { WorkerRuntimeConfigModule } from '../worker-runtime-config.module'
import { LlmProviderRegistry } from './llm-provider-registry'
import { StandupPromptService } from './standup-prompt.service'

@Module({
  imports: [AzureDevopsModule, WorkerRuntimeConfigModule],
  providers: [StandupPromptService, LlmProviderRegistry],
  exports: [StandupPromptService, LlmProviderRegistry],
})
export class StandupGeneratorModule {}
```

- [ ] **Step 4: Check for remaining imports of deleted files**

```bash
cd apps/api && grep -r "agent-session-manager\|build-seed-messages\|pi-ai-model-adapter\|submit-standup\.tool\|StandupGeneratorService\|standup-generator\.service" src/ --include="*.ts" | grep -v "\.spec\.ts" | grep -v "node_modules"
```

Expected: No matches (or only in files we already modified). Fix any remaining imports.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor: delete obsolete pi-agent-core files and StandupGeneratorService"
```

---

## Task 14: Remove AgentSessionManager from pipeline spec and other consumers

**Files:**
- Modify: any remaining files that reference `AgentSessionManager`

- [ ] **Step 1: Find all remaining references**

```bash
cd apps/api && grep -r "AgentSessionManager\|agent-session-manager" src/ --include="*.ts" | grep -v node_modules
```

- [ ] **Step 2: Remove from each file found**

For each file, remove the import and any usage. Common locations:
- `standup-pipeline.service.spec.ts` — remove mock/inject of AgentSessionManager
- `worker.module.ts` — remove import if AgentSessionManager was exported at module level
- Any Discord handler that referenced sessions

- [ ] **Step 3: Run full test suite**

```bash
cd apps/api && bunx vitest run
```

Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor: remove all AgentSessionManager references"
```

---

## Task 15: Run full verification

- [ ] **Step 1: Typecheck**

```bash
cd apps/api && bunx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 2: Lint**

```bash
cd apps/api && bunx biome check src/
```

Expected: No errors (warnings acceptable).

- [ ] **Step 3: Run all tests**

```bash
cd apps/api && bunx vitest run
```

Expected: All pass.

- [ ] **Step 4: Verify no pi-agent-core references remain**

```bash
grep -r "pi-agent-core\|@mariozechner" apps/api/src/ --include="*.ts"
```

Expected: No matches.

```bash
grep -r "pi-agent-core\|@mariozechner" apps/api/package.json
```

Expected: No matches.

- [ ] **Step 5: Final commit if any fixes were needed**

```bash
git add -A
git commit -m "chore: final cleanup after pi-agent-core to Mastra migration"
```
