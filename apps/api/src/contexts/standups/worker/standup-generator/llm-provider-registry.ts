import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createGroq } from '@ai-sdk/groq'
import { Injectable, type OnModuleInit } from '@nestjs/common'
import { createOpenRouter } from '@openrouter/ai-sdk-provider'
import type { LanguageModel } from 'ai'
import * as z from 'zod'
import { AppLoggerFactory } from '../../../../platform/logger'
import { AllProvidersUnavailableError } from '../../../../shared/domain'
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
      const models = this.tiers.get(tier)
      const pointer = this.tierPointers.get(tier)
      if (!models || pointer === undefined) continue

      for (let i = 0; i < models.length; i++) {
        const index = (pointer + i) % models.length
        const entry = models[index]
        if (!entry) continue
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
      state = {
        failCount: 0,
        backoffUntil: 0,
        lastFailureAt: 0,
        lastSuccessAt: 0,
      }
      this.modelStates.set(modelKey, state)
    }
    return state
  }
}
