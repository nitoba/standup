# Multi-Provider LLM Round-Robin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hardcoded Google Gemini LLM provider with a multi-provider registry supporting tiered round-robin selection and automatic backoff on rate limits.

**Architecture:** A new `LlmProviderRegistry` NestJS service parses a JSON env var to configure multiple LLM providers (Google, Groq, OpenRouter) across priority tiers. The existing `StandupGeneratorService` delegates model selection to the registry and uses a `callWithFallback` method that tries each model with per-model retry, detecting rate limits via raw `APICallError` inspection.

**Tech Stack:** TypeScript, NestJS, Vitest, Vercel AI SDK (`ai`, `@ai-sdk/google`, `@ai-sdk/groq`, `@ai-sdk/openrouter`), Zod, better-result

**Spec:** `docs/superpowers/specs/2026-03-23-multi-provider-llm-round-robin-design.md`

---

## File Map

### New Files

| File | Responsibility |
|------|---------------|
| `apps/api/src/contexts/standups/worker/standup-generator/llm-provider-registry.ts` | `@Injectable()` service: parses config, instantiates AI SDK providers, manages round-robin + backoff state |
| `apps/api/src/contexts/standups/worker/standup-generator/llm-provider-registry.spec.ts` | Unit tests for registry: round-robin, backoff, tier fallback, Zod validation |

### Modified Files

| File | Changes |
|------|---------|
| `apps/api/src/shared/domain/errors.ts` | Add `AllProvidersUnavailableError` |
| `apps/api/src/platform/env/env.schema.ts` | Add `GOOGLE_API_KEY`, `GROQ_API_KEY`, `OPENROUTER_API_KEY`, `LLM_PROVIDERS_CONFIG`; keep `AI_PROVIDER_API_KEY` as deprecated until Task 6 |
| `apps/api/src/platform/env/env.service.ts` | Update `worker` getter with new key names |
| `apps/api/src/contexts/standups/worker/worker-runtime-config.service.ts` | Update `WorkerRuntimeConfig` interface and getter |
| `apps/api/src/contexts/standups/worker/standup-generator/standup-generator.module.ts` | Register `LlmProviderRegistry` as provider |
| `apps/api/src/contexts/standups/worker/standup-generator/standup-generator.service.ts` | Replace hardcoded Google provider with registry injection, add `callWithFallback`, refactor `runObjectGeneration`, add `runTextGeneration`, rename `withRetry` to `withSimpleRetry`, remove dead `apiKey` guards |
| `apps/api/package.json` | Add `@ai-sdk/groq` and `@ai-sdk/openrouter` dependencies |

---

## Task 1: Install new AI SDK provider dependencies

**Files:**
- Modify: `apps/api/package.json`

- [ ] **Step 1: Install `@ai-sdk/groq` and `@ai-sdk/openrouter`**

```bash
cd apps/api && bun add @ai-sdk/groq @ai-sdk/openrouter
```

- [ ] **Step 2: Verify installation**

```bash
cd apps/api && bun run typecheck
```

Expected: No errors (new packages not yet imported anywhere).

- [ ] **Step 3: Commit**

```bash
git add apps/api/package.json apps/api/bun.lock
git commit -m "chore: add @ai-sdk/groq and @ai-sdk/openrouter dependencies (TAS-30)"
```

---

## Task 2: Add `AllProvidersUnavailableError`

**Files:**
- Modify: `apps/api/src/shared/domain/errors.ts`
- Reference: `apps/api/src/shared/domain/index.ts` (already re-exports all from `errors.ts`)

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/shared/domain/errors.spec.ts`:

```typescript
import { describe, expect, it } from 'vitest'
import { AllProvidersUnavailableError } from './errors'

describe('AllProvidersUnavailableError', () => {
  it('creates error with tag and message', () => {
    const error = new AllProvidersUnavailableError({
      message: 'All 6 models exhausted',
      modelsAttempted: 6,
    })

    expect(error._tag).toBe('AllProvidersUnavailableError')
    expect(error.message).toBe('All 6 models exhausted')
    expect(error.modelsAttempted).toBe(6)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/api && bun run test -- src/shared/domain/errors.spec.ts
```

Expected: FAIL — `AllProvidersUnavailableError` is not exported.

- [ ] **Step 3: Implement the error**

Add to end of `apps/api/src/shared/domain/errors.ts`:

```typescript
export class AllProvidersUnavailableError extends TaggedError(
  'AllProvidersUnavailableError',
)<{
  message: string
  modelsAttempted: number
}>() {}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd apps/api && bun run test -- src/shared/domain/errors.spec.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/shared/domain/errors.ts apps/api/src/shared/domain/errors.spec.ts
git commit -m "feat: add AllProvidersUnavailableError (TAS-30)"
```

---

## Task 3: Update env schema and config layer

**Files:**
- Modify: `apps/api/src/platform/env/env.schema.ts`
- Modify: `apps/api/src/platform/env/env.service.ts`
- Modify: `apps/api/src/contexts/standups/worker/worker-runtime-config.service.ts`

- [ ] **Step 1: Update `env.schema.ts`**

Add the new keys alongside the existing `AI_PROVIDER_API_KEY` (keep it as deprecated — it will be removed in Task 6 when the service is refactored):

```typescript
  AI_PROVIDER_API_KEY: z.string().optional(), // deprecated — will be removed in Task 6
  GOOGLE_API_KEY: z.string().optional(),
  GROQ_API_KEY: z.string().optional(),
  OPENROUTER_API_KEY: z.string().optional(),
  LLM_PROVIDERS_CONFIG: z.string().optional(),
```

- [ ] **Step 2: Update `env.service.ts` worker getter**

Add the new keys to the `worker` getter (keep `aiProviderApiKey` — will be removed in Task 6):

```typescript
get worker() {
  return {
    schedulerEnabled: this.get('SCHEDULER_ENABLED'),
    reposRootPath: this.get('REPOS_ROOT_PATH'),
    aiProviderApiKey: this.get('AI_PROVIDER_API_KEY'), // deprecated — removed in Task 6
    googleApiKey: this.get('GOOGLE_API_KEY'),
    groqApiKey: this.get('GROQ_API_KEY'),
    openrouterApiKey: this.get('OPENROUTER_API_KEY'),
    llmProvidersConfig: this.get('LLM_PROVIDERS_CONFIG'),
    azureDevopsOrg: this.get('AZURE_DEVOPS_ORG'),
    azureDevopsPat: this.get('AZURE_DEVOPS_PAT'),
    azureDevopsDefaultProject: this.get('AZURE_DEVOPS_DEFAULT_PROJECT'),
    azureDevopsProjects: this.get('AZURE_DEVOPS_PROJECTS')
      ?.split(',')
      .map((value) => value.trim())
      .filter(Boolean) ?? [this.get('AZURE_DEVOPS_DEFAULT_PROJECT')],
  }
}
```

- [ ] **Step 3: Update `WorkerRuntimeConfig` interface and getter**

In `worker-runtime-config.service.ts`, update the interface:

```typescript
export interface WorkerRuntimeConfig {
  DATABASE_URL: string
  DATABASE_AUTH_TOKEN?: string
  REPOS_ROOT_PATH: string
  SCHEDULER_ENABLED: boolean
  AI_PROVIDER_API_KEY: string // deprecated — removed in Task 6
  GOOGLE_API_KEY: string
  GROQ_API_KEY: string
  OPENROUTER_API_KEY: string
  LLM_PROVIDERS_CONFIG: string
  AZURE_DEVOPS_ORG: string
  AZURE_DEVOPS_PAT: string
  AZURE_DEVOPS_DEFAULT_PROJECT: string
  AZURE_DEVOPS_PROJECTS: string[]
}
```

Update the getter:

```typescript
get config(): WorkerRuntimeConfig {
  return {
    DATABASE_URL: this.env.database.url,
    DATABASE_AUTH_TOKEN: this.env.database.authToken,
    REPOS_ROOT_PATH: this.env.worker.reposRootPath,
    SCHEDULER_ENABLED: this.env.worker.schedulerEnabled,
    AI_PROVIDER_API_KEY: this.env.worker.aiProviderApiKey ?? '', // deprecated — removed in Task 6
    GOOGLE_API_KEY: this.env.worker.googleApiKey ?? '',
    GROQ_API_KEY: this.env.worker.groqApiKey ?? '',
    OPENROUTER_API_KEY: this.env.worker.openrouterApiKey ?? '',
    LLM_PROVIDERS_CONFIG: this.env.worker.llmProvidersConfig ?? '[]',
    AZURE_DEVOPS_ORG: this.env.worker.azureDevopsOrg ?? '',
    AZURE_DEVOPS_PAT: this.env.worker.azureDevopsPat ?? '',
    AZURE_DEVOPS_DEFAULT_PROJECT: this.env.worker.azureDevopsDefaultProject,
    AZURE_DEVOPS_PROJECTS: this.env.worker.azureDevopsProjects,
  }
}
```

- [ ] **Step 4: Verify typecheck passes**

```bash
cd apps/api && bun run typecheck
```

Expected: PASS — `AI_PROVIDER_API_KEY` is kept as deprecated, so no compile errors. The new keys are additive.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/platform/env/env.schema.ts apps/api/src/platform/env/env.service.ts apps/api/src/contexts/standups/worker/worker-runtime-config.service.ts
git commit -m "feat: add per-provider LLM keys and LLM_PROVIDERS_CONFIG (TAS-30)"
```

---

## Task 4: Implement `LlmProviderRegistry` with tests

**Files:**
- Create: `apps/api/src/contexts/standups/worker/standup-generator/llm-provider-registry.ts`
- Create: `apps/api/src/contexts/standups/worker/standup-generator/llm-provider-registry.spec.ts`

- [ ] **Step 1: Write failing tests for Zod validation**

Create `llm-provider-registry.spec.ts`:

```typescript
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { LlmProviderRegistry } from './llm-provider-registry'

// Mock AI SDK providers so we don't need real API keys
vi.mock('@ai-sdk/google', () => ({
  createGoogleGenerativeAI: vi.fn(() => (model: string) => ({ modelId: model, provider: 'google' })),
}))
vi.mock('@ai-sdk/groq', () => ({
  createGroq: vi.fn(() => (model: string) => ({ modelId: model, provider: 'groq' })),
}))
vi.mock('@ai-sdk/openrouter', () => ({
  createOpenRouter: vi.fn(() => (model: string) => ({ modelId: model, provider: 'openrouter' })),
}))

function makeConfig() {
  return {
    GOOGLE_API_KEY: 'gk',
    GROQ_API_KEY: 'grk',
    OPENROUTER_API_KEY: 'ork',
    LLM_PROVIDERS_CONFIG: JSON.stringify([
      { tier: 1, provider: 'google', model: 'gemini-flash' },
      { tier: 1, provider: 'groq', model: 'qwen-32b' },
      { tier: 2, provider: 'openrouter', model: 'nemotron:free' },
    ]),
  }
}

function makeRuntimeConfig(overrides: Record<string, unknown> = {}) {
  return { config: { ...makeConfig(), ...overrides } } as never
}

function makeLoggerFactory() {
  return {
    create: vi.fn(() => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    })),
  }
}

describe('LlmProviderRegistry', () => {
  describe('validation', () => {
    it('throws on empty config array', () => {
      expect(
        () =>
          new LlmProviderRegistry(
            makeLoggerFactory() as never,
            makeRuntimeConfig({ LLM_PROVIDERS_CONFIG: '[]' }),
          ),
      ).toThrow()
    })

    it('throws on invalid JSON', () => {
      expect(
        () =>
          new LlmProviderRegistry(
            makeLoggerFactory() as never,
            makeRuntimeConfig({ LLM_PROVIDERS_CONFIG: 'not-json' }),
          ),
      ).toThrow()
    })

    it('throws on unknown provider', () => {
      expect(
        () =>
          new LlmProviderRegistry(
            makeLoggerFactory() as never,
            makeRuntimeConfig({
              LLM_PROVIDERS_CONFIG: JSON.stringify([
                { tier: 1, provider: 'unknown', model: 'x' },
              ]),
            }),
          ),
      ).toThrow()
    })

    it('throws on negative tier', () => {
      expect(
        () =>
          new LlmProviderRegistry(
            makeLoggerFactory() as never,
            makeRuntimeConfig({
              LLM_PROVIDERS_CONFIG: JSON.stringify([
                { tier: -1, provider: 'google', model: 'x' },
              ]),
            }),
          ),
      ).toThrow()
    })

    it('initializes with valid config', () => {
      const registry = new LlmProviderRegistry(
        makeLoggerFactory() as never,
        makeRuntimeConfig(),
      )
      expect(registry).toBeDefined()
    })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd apps/api && bun run test -- src/contexts/standups/worker/standup-generator/llm-provider-registry.spec.ts
```

Expected: FAIL — `LlmProviderRegistry` does not exist.

- [ ] **Step 3: Implement `LlmProviderRegistry` — constructor + validation + `onModuleInit`**

Create `llm-provider-registry.ts`:

```typescript
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createGroq } from '@ai-sdk/groq'
import { createOpenRouter } from '@ai-sdk/openrouter'
import { Injectable, type OnModuleInit } from '@nestjs/common'
import type { LanguageModel } from 'ai'
import * as z from 'zod'
import { AllProvidersUnavailableError } from '../../../../shared/domain'
import { AppLoggerFactory } from '../../../../platform/logger'
import { WorkerRuntimeConfigService } from '../worker-runtime-config.service'

const llmModelEntrySchema = z.object({
  tier: z.number().int().positive(),
  provider: z.enum(['google', 'groq', 'openrouter']),
  model: z.string(),
})

const llmProvidersConfigSchema = z.array(llmModelEntrySchema).min(1)

type LlmModelEntry = z.infer<typeof llmModelEntrySchema>

export interface ModelSelection {
  model: LanguageModel
  modelKey: string
  provider: string
  tier: number
}

interface ModelState {
  failCount: number
  backoffUntil: number
  lastFailureAt: number
  lastSuccessAt: number
}

const MAX_BACKOFF_MS = 5 * 60 * 1_000 // 5 minutes
const BASE_BACKOFF_MS = 30 * 1_000 // 30 seconds
const STALENESS_RESET_MS = 5 * 60 * 1_000 // 5 minutes

@Injectable()
export class LlmProviderRegistry implements OnModuleInit {
  private readonly logger: ReturnType<AppLoggerFactory['create']>
  private readonly entries: LlmModelEntry[]
  private readonly tiers: Map<number, LlmModelEntry[]> = new Map()
  private readonly tierPointers: Map<number, number> = new Map()
  private readonly modelStates: Map<string, ModelState> = new Map()
  private readonly providerFactories: Map<
    string,
    (model: string) => LanguageModel
  > = new Map()

  constructor(
    private readonly loggerFactory: AppLoggerFactory,
    private readonly runtimeConfig: WorkerRuntimeConfigService,
  ) {
    this.logger = this.loggerFactory.create('llm-provider-registry')

    const raw = this.runtimeConfig.config.LLM_PROVIDERS_CONFIG
    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      throw new Error(
        `LLM_PROVIDERS_CONFIG is not valid JSON: ${raw.slice(0, 100)}`,
      )
    }

    const result = llmProvidersConfigSchema.safeParse(parsed)
    if (!result.success) {
      throw new Error(
        `LLM_PROVIDERS_CONFIG validation failed: ${result.error.message}`,
      )
    }

    this.entries = result.data
    for (const entry of this.entries) {
      const tier = this.tiers.get(entry.tier) ?? []
      tier.push(entry)
      this.tiers.set(entry.tier, tier)
      if (!this.tierPointers.has(entry.tier)) {
        this.tierPointers.set(entry.tier, 0)
      }
    }
  }

  onModuleInit() {
    const config = this.runtimeConfig.config
    const providerKeys = {
      google: config.GOOGLE_API_KEY,
      groq: config.GROQ_API_KEY,
      openrouter: config.OPENROUTER_API_KEY,
    }

    // Determine which providers are needed
    const neededProviders = new Set(this.entries.map((e) => e.provider))

    for (const providerName of neededProviders) {
      const apiKey = providerKeys[providerName]
      switch (providerName) {
        case 'google': {
          const factory = createGoogleGenerativeAI({ apiKey })
          this.providerFactories.set('google', (model) => factory(model))
          break
        }
        case 'groq': {
          const factory = createGroq({ apiKey })
          this.providerFactories.set('groq', (model) => factory(model))
          break
        }
        case 'openrouter': {
          const factory = createOpenRouter({ apiKey })
          this.providerFactories.set('openrouter', (model) => factory(model))
          break
        }
      }
    }

    this.logger.info('LLM provider registry initialized', {
      totalModels: this.entries.length,
      tiers: [...this.tiers.keys()].sort(),
      providers: [...neededProviders],
    })
  }

  get totalModels(): number {
    return this.entries.length
  }

  getNextModel(): ModelSelection {
    const now = Date.now()
    const sortedTiers = [...this.tiers.keys()].sort((a, b) => a - b)

    for (const tier of sortedTiers) {
      const models = this.tiers.get(tier)!
      const pointer = this.tierPointers.get(tier)!

      for (let i = 0; i < models.length; i++) {
        const index = (pointer + i) % models.length
        const entry = models[index]
        const key = `${entry.provider}:${entry.model}`
        const state = this.modelStates.get(key)

        // Check staleness reset
        if (state && state.failCount > 0 && state.lastFailureAt > 0) {
          if (now - state.lastFailureAt >= STALENESS_RESET_MS) {
            state.failCount = 0
            state.backoffUntil = 0
          }
        }

        // Skip if in backoff
        if (state && state.backoffUntil > now) {
          continue
        }

        // Found available model — advance pointer past this model
        this.tierPointers.set(tier, (index + 1) % models.length)

        const factory = this.providerFactories.get(entry.provider)
        if (!factory) {
          this.logger.warn('No provider factory for entry, skipping', {
            provider: entry.provider,
            model: entry.model,
          })
          continue
        }

        return {
          model: factory(entry.model),
          modelKey: key,
          provider: entry.provider,
          tier: entry.tier,
        }
      }
    }

    throw new AllProvidersUnavailableError({
      message: `All ${this.entries.length} models are in backoff`,
      modelsAttempted: this.entries.length,
    })
  }

  reportFailure(modelKey: string, error: unknown): void {
    if (!this.isRateLimitError(error)) return

    const state = this.getOrCreateState(modelKey)
    state.failCount += 1
    state.lastFailureAt = Date.now()
    const delay = Math.min(
      BASE_BACKOFF_MS * 2 ** (state.failCount - 1),
      MAX_BACKOFF_MS,
    )
    state.backoffUntil = Date.now() + delay

    this.logger.warn('Model rate limited, applying backoff', {
      modelKey,
      failCount: state.failCount,
      backoffMs: delay,
      backoffUntil: new Date(state.backoffUntil).toISOString(),
    })
  }

  reportSuccess(modelKey: string): void {
    const state = this.modelStates.get(modelKey)
    if (state) {
      state.failCount = 0
      state.backoffUntil = 0
      state.lastSuccessAt = Date.now()
    }
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

  private getOrCreateState(modelKey: string): ModelState {
    let state = this.modelStates.get(modelKey)
    if (!state) {
      state = { failCount: 0, backoffUntil: 0, lastFailureAt: 0, lastSuccessAt: 0 }
      this.modelStates.set(modelKey, state)
    }
    return state
  }
}
```

- [ ] **Step 4: Run validation tests to verify they pass**

```bash
cd apps/api && bun run test -- src/contexts/standups/worker/standup-generator/llm-provider-registry.spec.ts
```

Expected: PASS for all 5 validation tests.

- [ ] **Step 5: Add round-robin tests**

Append to `llm-provider-registry.spec.ts`:

```typescript
  describe('getNextModel', () => {
    it('returns tier 1 model by default', () => {
      const registry = new LlmProviderRegistry(
        makeLoggerFactory() as never,
        makeRuntimeConfig(),
      )
      registry.onModuleInit()

      const selection = registry.getNextModel()
      expect(selection.tier).toBe(1)
      expect(selection.modelKey).toBe('google:gemini-flash')
    })

    it('round-robins within same tier', () => {
      const registry = new LlmProviderRegistry(
        makeLoggerFactory() as never,
        makeRuntimeConfig(),
      )
      registry.onModuleInit()

      const first = registry.getNextModel()
      const second = registry.getNextModel()
      expect(first.modelKey).toBe('google:gemini-flash')
      expect(second.modelKey).toBe('groq:qwen-32b')
    })

    it('wraps around within tier', () => {
      const registry = new LlmProviderRegistry(
        makeLoggerFactory() as never,
        makeRuntimeConfig(),
      )
      registry.onModuleInit()

      registry.getNextModel() // google
      registry.getNextModel() // groq
      const third = registry.getNextModel() // wraps to google
      expect(third.modelKey).toBe('google:gemini-flash')
    })
  })
```

- [ ] **Step 6: Run to verify pass**

```bash
cd apps/api && bun run test -- src/contexts/standups/worker/standup-generator/llm-provider-registry.spec.ts
```

Expected: PASS.

- [ ] **Step 7: Add backoff and tier fallback tests**

Append to the `getNextModel` describe block:

```typescript
    it('skips model in backoff', () => {
      const registry = new LlmProviderRegistry(
        makeLoggerFactory() as never,
        makeRuntimeConfig(),
      )
      registry.onModuleInit()

      // Put google model in backoff
      registry.reportFailure('google:gemini-flash', { statusCode: 429 })

      const selection = registry.getNextModel()
      expect(selection.modelKey).toBe('groq:qwen-32b')
    })

    it('falls to tier 2 when all tier 1 models in backoff', () => {
      const registry = new LlmProviderRegistry(
        makeLoggerFactory() as never,
        makeRuntimeConfig(),
      )
      registry.onModuleInit()

      registry.reportFailure('google:gemini-flash', { statusCode: 429 })
      registry.reportFailure('groq:qwen-32b', { statusCode: 429 })

      const selection = registry.getNextModel()
      expect(selection.tier).toBe(2)
      expect(selection.modelKey).toBe('openrouter:nemotron:free')
    })

    it('throws AllProvidersUnavailableError when all models in backoff', () => {
      const registry = new LlmProviderRegistry(
        makeLoggerFactory() as never,
        makeRuntimeConfig(),
      )
      registry.onModuleInit()

      registry.reportFailure('google:gemini-flash', { statusCode: 429 })
      registry.reportFailure('groq:qwen-32b', { statusCode: 429 })
      registry.reportFailure('openrouter:nemotron:free', { statusCode: 429 })

      expect(() => registry.getNextModel()).toThrow(
        'All 3 models are in backoff',
      )
    })
```

- [ ] **Step 8: Run to verify pass**

```bash
cd apps/api && bun run test -- src/contexts/standups/worker/standup-generator/llm-provider-registry.spec.ts
```

Expected: PASS.

- [ ] **Step 9: Add exponential backoff and staleness reset tests**

Append to `describe('LlmProviderRegistry')`:

```typescript
  describe('backoff behavior', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('applies exponential backoff: 30s, 60s, 120s', () => {
      const registry = new LlmProviderRegistry(
        makeLoggerFactory() as never,
        makeRuntimeConfig(),
      )
      registry.onModuleInit()

      // First failure: 30s backoff
      registry.reportFailure('google:gemini-flash', { statusCode: 429 })
      vi.advanceTimersByTime(29_000)
      expect(registry.getNextModel().modelKey).toBe('groq:qwen-32b')

      vi.advanceTimersByTime(2_000) // now 31s total
      expect(registry.getNextModel().modelKey).toBe('google:gemini-flash')

      // Second failure: 60s backoff
      registry.reportFailure('google:gemini-flash', { statusCode: 429 })
      vi.advanceTimersByTime(59_000)
      const mid = registry.getNextModel()
      expect(mid.modelKey).toBe('groq:qwen-32b')

      vi.advanceTimersByTime(2_000) // now 61s
      expect(registry.getNextModel().modelKey).toBe('google:gemini-flash')
    })

    it('caps backoff at 5 minutes', () => {
      const registry = new LlmProviderRegistry(
        makeLoggerFactory() as never,
        makeRuntimeConfig(),
      )
      registry.onModuleInit()

      // Fail many times to exceed cap
      for (let i = 0; i < 10; i++) {
        registry.reportFailure('google:gemini-flash', { statusCode: 429 })
        vi.advanceTimersByTime(300_001) // advance past max backoff
      }

      // After 5 min cap, model should be available
      vi.advanceTimersByTime(300_001)
      expect(registry.getNextModel().modelKey).toBe('google:gemini-flash')
    })

    it('resets failCount after 5 minutes without failure', () => {
      const registry = new LlmProviderRegistry(
        makeLoggerFactory() as never,
        makeRuntimeConfig(),
      )
      registry.onModuleInit()

      // Fail twice (next failure would be 120s backoff)
      registry.reportFailure('google:gemini-flash', { statusCode: 429 })
      vi.advanceTimersByTime(30_001) // wait out 30s backoff
      registry.reportFailure('google:gemini-flash', { statusCode: 429 })
      vi.advanceTimersByTime(60_001) // wait out 60s backoff

      // Wait 5 minutes without failure — failCount resets
      vi.advanceTimersByTime(300_001)

      // Next failure should be back to 30s (failCount=1), not 120s (failCount=3)
      registry.reportFailure('google:gemini-flash', { statusCode: 429 })
      vi.advanceTimersByTime(30_001)
      expect(registry.getNextModel().modelKey).toBe('google:gemini-flash')
    })

    it('reportSuccess resets failCount and backoffUntil', () => {
      const registry = new LlmProviderRegistry(
        makeLoggerFactory() as never,
        makeRuntimeConfig(),
      )
      registry.onModuleInit()

      registry.reportFailure('google:gemini-flash', { statusCode: 429 })
      registry.reportSuccess('google:gemini-flash')

      // Should be immediately available
      expect(registry.getNextModel().modelKey).toBe('google:gemini-flash')
    })
  })

  describe('rate limit detection', () => {
    it('does not apply backoff for non-429 errors', () => {
      const registry = new LlmProviderRegistry(
        makeLoggerFactory() as never,
        makeRuntimeConfig(),
      )
      registry.onModuleInit()

      registry.reportFailure('google:gemini-flash', { statusCode: 500 })

      // Model should still be available
      expect(registry.getNextModel().modelKey).toBe('google:gemini-flash')
    })

    it('detects 429 via error.cause.status', () => {
      const registry = new LlmProviderRegistry(
        makeLoggerFactory() as never,
        makeRuntimeConfig(),
      )
      registry.onModuleInit()

      registry.reportFailure('google:gemini-flash', {
        cause: { status: 429 },
      })

      // Model should be in backoff
      expect(registry.getNextModel().modelKey).toBe('groq:qwen-32b')
    })

    it('detects rate limit via error message', () => {
      const registry = new LlmProviderRegistry(
        makeLoggerFactory() as never,
        makeRuntimeConfig(),
      )
      registry.onModuleInit()

      registry.reportFailure(
        'google:gemini-flash',
        new Error('Rate limit exceeded'),
      )

      expect(registry.getNextModel().modelKey).toBe('groq:qwen-32b')
    })
  })
```

- [ ] **Step 10: Run full test suite for registry**

```bash
cd apps/api && bun run test -- src/contexts/standups/worker/standup-generator/llm-provider-registry.spec.ts
```

Expected: All tests PASS.

- [ ] **Step 11: Commit**

```bash
git add apps/api/src/contexts/standups/worker/standup-generator/llm-provider-registry.ts apps/api/src/contexts/standups/worker/standup-generator/llm-provider-registry.spec.ts
git commit -m "feat: implement LlmProviderRegistry with round-robin, backoff, and tier fallback (TAS-30)"
```

---

## Task 5: Register `LlmProviderRegistry` in NestJS module

**Files:**
- Modify: `apps/api/src/contexts/standups/worker/standup-generator/standup-generator.module.ts`

- [ ] **Step 1: Add registry to module**

```typescript
import { Module } from '@nestjs/common'
import { AzureDevopsModule } from '../azure-devops/azure-devops.module'
import { WorkerRuntimeConfigModule } from '../worker-runtime-config.module'
import { LlmProviderRegistry } from './llm-provider-registry'
import { StandupGeneratorService } from './standup-generator.service'
import { StandupPromptService } from './standup-prompt.service'

@Module({
  imports: [AzureDevopsModule, WorkerRuntimeConfigModule],
  providers: [StandupPromptService, LlmProviderRegistry, StandupGeneratorService],
  exports: [StandupPromptService, LlmProviderRegistry, StandupGeneratorService],
})
export class StandupGeneratorModule {}
```

- [ ] **Step 2: Verify typecheck**

```bash
cd apps/api && bun run typecheck
```

Expected: May still have errors in `standup-generator.service.ts` from the old `AI_PROVIDER_API_KEY` references. Those will be fixed in Task 6.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/contexts/standups/worker/standup-generator/standup-generator.module.ts
git commit -m "feat: register LlmProviderRegistry in StandupGeneratorModule (TAS-30)"
```

---

## Task 6: Refactor `StandupGeneratorService` to use registry

**Files:**
- Modify: `apps/api/src/contexts/standups/worker/standup-generator/standup-generator.service.ts`

This is the largest task. It modifies the service in several incremental steps.

- [ ] **Step 1: Update imports and constructor injection**

Replace the top of the file:

```typescript
import { Injectable } from '@nestjs/common'
import { generateText, Output } from 'ai'
import type { LanguageModel } from 'ai'
import * as z from 'zod'
import { AppLoggerFactory } from '../../../../platform/logger'
import type {
  GatheredGitActivity,
  GeneratedStandup,
  GenerateStandupInput,
  StandupRecord,
} from '../../../../shared/domain'
import {
  AllProvidersUnavailableError,
  ExternalServiceError,
  Result,
} from '../../../../shared/domain'
import { AzureDevopsEnrichmentService } from '../azure-devops/azure-devops-enrichment.service'
import type { EnrichedGitActivity } from '../azure-devops/types'
import { WorkerRuntimeConfigService } from '../worker-runtime-config.service'
import type { ModelSelection } from './llm-provider-registry'
import { LlmProviderRegistry } from './llm-provider-registry'
import {
  MAX_STANDUP_CONTENT_CHARS,
  StandupPromptService,
} from './standup-prompt.service'
```

Update constructor to inject registry:

```typescript
constructor(
  private readonly loggerFactory: AppLoggerFactory,
  private readonly runtimeConfig: WorkerRuntimeConfigService,
  private readonly azureDevopsEnrichment: AzureDevopsEnrichmentService,
  private readonly standupPrompt: StandupPromptService,
  private readonly llmRegistry: LlmProviderRegistry,
) {
  this.logger = this.loggerFactory.create('standup-generator')
}
```

- [ ] **Step 2: Rename `withRetry` to `withSimpleRetry`**

Rename the existing `withRetry` method to `withSimpleRetry`. Update the single call in `enrichWithFallback`:

```typescript
private async enrichWithFallback(
  gitActivity: GatheredGitActivity,
  azureDevopsUuid?: string,
): Promise<EnrichedGitActivity> {
  const enrichmentResult = await this.withSimpleRetry(
    // ...same body...
  )
  // ...rest unchanged...
}

private async withSimpleRetry<T>(
  // ...same signature and body as old withRetry...
)
```

- [ ] **Step 3: Add `callWithFallback` method**

Add after `withSimpleRetry`:

```typescript
private async callWithFallback<T>(
  fn: (model: LanguageModel) => Promise<T>,
  errorContext: string,
): Promise<Result<T, ExternalServiceError | AllProvidersUnavailableError>> {
  const totalModels = this.llmRegistry.totalModels
  let lastError: unknown
  let previousModelKey: string | undefined

  for (let i = 0; i < totalModels; i++) {
    let selection: ModelSelection
    try {
      selection = this.llmRegistry.getNextModel()
    } catch (error) {
      if (error instanceof AllProvidersUnavailableError) {
        return Result.err(error)
      }
      throw error
    }

    const { model, modelKey, provider, tier } = selection
    const maxRetries = 2
    const baseDelay = 1_000

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        this.logger.info('Calling LLM', {
          model: modelKey,
          provider,
          tier,
          attempt,
          fallbackFrom: previousModelKey,
        })

        const result = await fn(model)
        this.llmRegistry.reportSuccess(modelKey)
        return Result.ok(result)
      } catch (error) {
        lastError = error

        // Rate limit — report and move to next model immediately
        if (this.isRateLimitError(error)) {
          this.llmRegistry.reportFailure(modelKey, error)
          this.logger.warn('Rate limited, falling back to next model', {
            model: modelKey,
            provider,
            tier,
            attempt,
          })
          break
        }

        // Other error — retry if attempts left
        this.logger.warn(`${errorContext} failed`, {
          model: modelKey,
          provider,
          tier,
          attempt,
          maxRetries,
          error: error instanceof Error ? error.message : String(error),
        })

        if (attempt < maxRetries) {
          await new Promise((resolve) =>
            setTimeout(resolve, baseDelay * 2 ** (attempt - 1)),
          )
        }
      }
    }

    previousModelKey = modelKey
  }

  return Result.err(
    new AllProvidersUnavailableError({
      message: `${errorContext}: all ${totalModels} models failed. Last error: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
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
```

- [ ] **Step 4: Refactor `runObjectGeneration` to accept `LanguageModel`**

```typescript
private async runObjectGeneration(
  model: LanguageModel,
  system: string,
  prompt: string,
): Promise<StandupOutput> {
  const { output } = await generateText({
    model,
    output: Output.object({ schema: standupOutputSchema }),
    system,
    prompt,
  })

  if (!output) {
    throw new Error('LLM returned no structured output')
  }

  return output
}
```

Note: This now **throws** instead of returning Result — `callWithFallback` handles the catch.

- [ ] **Step 5: Add `runTextGeneration` method**

```typescript
private async runTextGeneration(
  model: LanguageModel,
  system: string,
  prompt: string,
): Promise<string> {
  const { text } = await generateText({
    model,
    system,
    prompt,
  })

  return text
}
```

- [ ] **Step 6: Refactor `generateStandup` to use `callWithFallback`**

Replace the body of `generateStandup`:

```typescript
async generateStandup(
  input: GenerateStandupInput,
  onStageChange?: (stage: GeneratorStage) => Promise<void> | void,
): Promise<Result<GeneratedStandup, ExternalServiceError | AllProvidersUnavailableError>> {
  return Result.gen(
    async function* (this: StandupGeneratorService) {
      let enrichedActivity: EnrichedGitActivity | undefined
      if (input.gitActivity) {
        await onStageChange?.('enriching_data')
        enrichedActivity = await this.enrichWithFallback(
          input.gitActivity,
          input.azureDevopsUuid,
        )
      }

      await onStageChange?.('generating_standup')
      const systemPrompt = this.standupPrompt.buildSystemPrompt({
        hasGit: !!input.gitActivity,
        hasBoard: !!input.boardActivity,
      })

      let generated = yield* Result.await(
        this.callWithFallback(
          (model) =>
            this.runObjectGeneration(
              model,
              systemPrompt,
              this.standupPrompt.buildUserMessage(input, enrichedActivity),
            ),
          'LLM standup generation',
        ),
      )

      if (generated.content.length > MAX_STANDUP_CONTENT_CHARS) {
        generated = yield* Result.await(
          this.callWithFallback(
            (model) =>
              this.runObjectGeneration(
                model,
                systemPrompt,
                this.standupPrompt.buildRewriteUserMessage(
                  generated.content,
                  generated.summary,
                ),
              ),
            'LLM standup rewrite',
          ),
        )
      }

      if (generated.content.length > MAX_STANDUP_CONTENT_CHARS) {
        yield* Result.err(
          new ExternalServiceError({
            service: 'ai-provider',
            message: `Standup content exceeds ${MAX_STANDUP_CONTENT_CHARS} characters after rewrite (${generated.content.length})`,
          }),
        )
      }

      return Result.ok({
        content: generated.content,
        summary: generated.summary,
      })
    }.bind(this),
  )
}
```

- [ ] **Step 7: Refactor `generateAdjustedStandup`**

Remove the `apiKey` guard and `createGoogleGenerativeAI`. Use `callWithFallback`:

```typescript
async generateAdjustedStandup(
  input: AdjustStandupInput,
  onStageChange?: (stage: GeneratorStage) => Promise<void> | void,
): Promise<Result<GeneratedStandup, ExternalServiceError | AllProvidersUnavailableError>> {
  return Result.gen(
    async function* (this: StandupGeneratorService) {
      if (!input.previousContent.trim()) {
        yield* Result.err(
          new ExternalServiceError({
            service: 'ai-provider',
            message: 'Cannot adjust standup without previous content',
          }),
        )
      }

      if (!input.instruction.trim()) {
        yield* Result.err(
          new ExternalServiceError({
            service: 'ai-provider',
            message: 'Cannot adjust standup without user instruction',
          }),
        )
      }

      await onStageChange?.('generating_standup')
      const systemPrompt = this.standupPrompt.buildSystemPrompt({
        hasGit: true,
        hasBoard: false,
      })

      let adjusted = yield* Result.await(
        this.callWithFallback(
          (model) =>
            this.runObjectGeneration(
              model,
              systemPrompt,
              this.standupPrompt.buildAdjustUserMessage(
                input.previousContent,
                input.instruction,
                input.extraContext,
              ),
            ),
          'LLM adjust',
        ),
      )

      if (adjusted.content.length > MAX_STANDUP_CONTENT_CHARS) {
        adjusted = yield* Result.await(
          this.callWithFallback(
            (model) =>
              this.runObjectGeneration(
                model,
                systemPrompt,
                this.standupPrompt.buildRewriteUserMessage(
                  adjusted.content,
                  adjusted.summary,
                ),
              ),
            'LLM rewrite after adjust',
          ),
        )
      }

      if (adjusted.content.length > MAX_STANDUP_CONTENT_CHARS) {
        yield* Result.err(
          new ExternalServiceError({
            service: 'ai-provider',
            message: `Adjusted standup content exceeds ${MAX_STANDUP_CONTENT_CHARS} characters after rewrite (${adjusted.content.length})`,
          }),
        )
      }

      return Result.ok({
        content: adjusted.content,
        summary: adjusted.summary,
      })
    }.bind(this),
  )
}
```

- [ ] **Step 8: Refactor `generateWeeklyInsights`**

Remove apiKey guard, use `callWithFallback` + `runTextGeneration`:

```typescript
async generateWeeklyInsights(
  standups: StandupRecord[],
): Promise<Result<string, ExternalServiceError | AllProvidersUnavailableError>> {
  if (standups.length === 0) {
    return Result.err(
      new ExternalServiceError({
        service: 'ai-provider',
        message: 'No standups provided for weekly insights generation',
      }),
    )
  }

  return this.callWithFallback(
    (model) =>
      this.runTextGeneration(
        model,
        this.standupPrompt.buildWeeklyInsightsSystemPrompt(),
        this.standupPrompt.buildWeeklyInsightsUserMessage(standups),
      ),
    'Weekly insights generation',
  )
}
```

- [ ] **Step 9: Verify typecheck**

```bash
cd apps/api && bun run typecheck
```

Expected: PASS. If there are callers of `generateStandup` or `generateAdjustedStandup` that expect `Result<..., ExternalServiceError>` (without `AllProvidersUnavailableError`), update the union type at those callsites. The `AllProvidersUnavailableError` extends `TaggedError` so it can be handled alongside `ExternalServiceError`.

- [ ] **Step 10: Run existing tests**

```bash
cd apps/api && bun run test
```

Expected: All existing tests PASS. The service changes are backwards-compatible at the method signature level (return type is widened, not narrowed).

- [ ] **Step 11: Remove deprecated `AI_PROVIDER_API_KEY` from env schema and config**

Now that no code references `AI_PROVIDER_API_KEY`, remove it from:

In `apps/api/src/platform/env/env.schema.ts` — remove the `AI_PROVIDER_API_KEY` line.

In `apps/api/src/platform/env/env.service.ts` — remove `aiProviderApiKey` from the `worker` getter.

In `apps/api/src/contexts/standups/worker/worker-runtime-config.service.ts` — remove `AI_PROVIDER_API_KEY` from the interface and getter.

- [ ] **Step 12: Verify typecheck after removal**

```bash
cd apps/api && bun run typecheck
```

Expected: PASS — no remaining references to `AI_PROVIDER_API_KEY`.

- [ ] **Step 13: Commit**

```bash
git add apps/api/src/contexts/standups/worker/standup-generator/standup-generator.service.ts apps/api/src/platform/env/env.schema.ts apps/api/src/platform/env/env.service.ts apps/api/src/contexts/standups/worker/worker-runtime-config.service.ts
git commit -m "feat: refactor StandupGeneratorService to use LlmProviderRegistry with callWithFallback (TAS-30)"
```

---

## Task 7: Integration tests for StandupGeneratorService fallback

**Files:**
- Create: `apps/api/src/contexts/standups/worker/standup-generator/standup-generator.service.spec.ts`

- [ ] **Step 1: Write integration test file**

```typescript
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { ExternalServiceError, Result } from '../../../../shared/domain'
import { StandupGeneratorService } from './standup-generator.service'

function makeLoggerFactory() {
  return {
    create: vi.fn(() => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    })),
  }
}

function makeRuntimeConfig() {
  return { config: {} } as never
}

function makeAzureEnrichment() {
  return {
    enrichGitActivity: vi.fn().mockResolvedValue(
      Result.ok({ timestamp: '', userUuid: '', repos: [] }),
    ),
  }
}

function makePromptService() {
  return {
    buildSystemPrompt: vi.fn().mockReturnValue('system'),
    buildUserMessage: vi.fn().mockReturnValue('user'),
    buildRewriteUserMessage: vi.fn().mockReturnValue('rewrite'),
    buildAdjustUserMessage: vi.fn().mockReturnValue('adjust'),
    buildWeeklyInsightsSystemPrompt: vi.fn().mockReturnValue('weekly-system'),
    buildWeeklyInsightsUserMessage: vi.fn().mockReturnValue('weekly-user'),
    determineMeetingType: vi.fn().mockReturnValue('daily'),
  }
}

// Track calls to the LLM
let llmCallCount: number
let llmBehavior: Array<'success' | 'rate-limit' | 'error'>

function makeRegistry() {
  let modelIndex = 0
  const models = [
    { modelKey: 'google:gemini', provider: 'google', tier: 1 },
    { modelKey: 'groq:qwen', provider: 'groq', tier: 1 },
    { modelKey: 'openrouter:free', provider: 'openrouter', tier: 2 },
  ]

  return {
    totalModels: models.length,
    getNextModel: vi.fn(() => {
      const entry = models[modelIndex % models.length]
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

// Mock generateText to simulate LLM behavior
vi.mock('ai', () => ({
  generateText: vi.fn(async () => {
    const behavior = llmBehavior[llmCallCount] ?? 'success'
    llmCallCount++

    if (behavior === 'rate-limit') {
      const err = new Error('Rate limited')
      Object.assign(err, { statusCode: 429 })
      throw err
    }
    if (behavior === 'error') {
      throw new Error('Internal server error')
    }
    return {
      output: { content: 'standup content', summary: 'summary' },
      text: 'weekly insights text',
    }
  }),
  Output: {
    object: vi.fn(() => ({})),
  },
}))

describe('StandupGeneratorService fallback', () => {
  let service: StandupGeneratorService
  let registry: ReturnType<typeof makeRegistry>

  beforeEach(() => {
    llmCallCount = 0
    llmBehavior = []

    registry = makeRegistry()
    service = new StandupGeneratorService(
      makeLoggerFactory() as never,
      makeRuntimeConfig(),
      makeAzureEnrichment() as never,
      makePromptService() as never,
      registry as never,
    )
  })

  it('succeeds on first model without fallback', async () => {
    llmBehavior = ['success']

    const result = await service.generateStandup({
      date: '2026-03-23',
      meetingType: 'daily',
    })

    expect(result.isOk()).toBe(true)
    expect(registry.reportSuccess).toHaveBeenCalledWith('google:gemini')
    expect(registry.reportFailure).not.toHaveBeenCalled()
  })

  it('falls back on 429 rate limit', async () => {
    llmBehavior = ['rate-limit', 'success']

    const result = await service.generateStandup({
      date: '2026-03-23',
      meetingType: 'daily',
    })

    expect(result.isOk()).toBe(true)
    expect(registry.reportFailure).toHaveBeenCalledWith(
      'google:gemini',
      expect.objectContaining({ statusCode: 429 }),
    )
    expect(registry.reportSuccess).toHaveBeenCalledWith('groq:qwen')
  })

  it('retries transient error then falls back', async () => {
    // First model: error, error (2 retries exhausted), then second model succeeds
    llmBehavior = ['error', 'error', 'success']

    const result = await service.generateStandup({
      date: '2026-03-23',
      meetingType: 'daily',
    })

    expect(result.isOk()).toBe(true)
    expect(registry.reportSuccess).toHaveBeenCalledWith('groq:qwen')
  })

  it('returns error when all models fail', async () => {
    // 3 models x 2 retries = 6 errors
    llmBehavior = ['error', 'error', 'error', 'error', 'error', 'error']

    const result = await service.generateStandup({
      date: '2026-03-23',
      meetingType: 'daily',
    })

    expect(result.isErr()).toBe(true)
  })

  it('generateWeeklyInsights uses fallback', async () => {
    llmBehavior = ['rate-limit', 'success']

    const standups = [
      { id: '1', content: 'day 1', summary: 's1' },
    ] as never

    const result = await service.generateWeeklyInsights(standups)

    expect(result.isOk()).toBe(true)
    expect(registry.reportFailure).toHaveBeenCalledWith(
      'google:gemini',
      expect.objectContaining({ statusCode: 429 }),
    )
  })

  it('generateAdjustedStandup uses fallback', async () => {
    llmBehavior = ['rate-limit', 'success']

    const result = await service.generateAdjustedStandup({
      previousContent: 'old standup content',
      instruction: 'make it shorter',
    })

    expect(result.isOk()).toBe(true)
    expect(registry.reportFailure).toHaveBeenCalledWith(
      'google:gemini',
      expect.objectContaining({ statusCode: 429 }),
    )
  })
})
```

- [ ] **Step 2: Run tests**

```bash
cd apps/api && bun run test -- src/contexts/standups/worker/standup-generator/standup-generator.service.spec.ts
```

Expected: All PASS.

- [ ] **Step 3: Run full test suite**

```bash
cd apps/api && bun run test
```

Expected: All existing tests still pass.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/contexts/standups/worker/standup-generator/standup-generator.service.spec.ts
git commit -m "test: add integration tests for StandupGeneratorService multi-provider fallback (TAS-30)"
```

---

## Task 8: Verify full build and lint

**Files:** None (validation only)

- [ ] **Step 1: Run typecheck**

```bash
cd apps/api && bun run typecheck
```

Expected: PASS.

- [ ] **Step 2: Run lint**

```bash
cd apps/api && bun run lint
```

Expected: PASS. Fix any biome issues.

- [ ] **Step 3: Run all tests**

```bash
cd apps/api && bun run test
```

Expected: All tests PASS.

- [ ] **Step 4: Final commit if lint fixes were needed**

```bash
git add -A && git commit -m "chore: fix lint issues from multi-provider refactor (TAS-30)"
```

Only commit if there were lint fixes.

---

## Task Summary

| Task | Description | Dependencies |
|------|-------------|-------------|
| 1 | Install AI SDK provider packages | None |
| 2 | Add `AllProvidersUnavailableError` | None |
| 3 | Update env schema and config layer | None |
| 4 | Implement `LlmProviderRegistry` with tests | 2, 3 |
| 5 | Register registry in NestJS module | 4 |
| 6 | Refactor `StandupGeneratorService` | 4, 5 |
| 7 | Integration tests for fallback | 6 |
| 8 | Full build and lint verification | 7 |

Tasks 1, 2, and 3 are independent and can be done in parallel.
