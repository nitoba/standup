import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LlmProviderRegistry } from './llm-provider-registry'

vi.mock('@ai-sdk/google', () => ({
  createGoogleGenerativeAI: vi.fn(() => (model: string) => ({
    modelId: model,
    provider: 'google',
  })),
}))
vi.mock('@ai-sdk/groq', () => ({
  createGroq: vi.fn(() => (model: string) => ({
    modelId: model,
    provider: 'groq',
  })),
}))
vi.mock('@openrouter/ai-sdk-provider', () => ({
  createOpenRouter: vi.fn(() => (model: string) => ({
    modelId: model,
    provider: 'openrouter',
  })),
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

    it('skips model in backoff', () => {
      const registry = new LlmProviderRegistry(
        makeLoggerFactory() as never,
        makeRuntimeConfig(),
      )
      registry.onModuleInit()
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
  })

  describe('backoff behavior', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })
    afterEach(() => {
      vi.useRealTimers()
    })

    it('applies exponential backoff: 30s, 60s', () => {
      const registry = new LlmProviderRegistry(
        makeLoggerFactory() as never,
        makeRuntimeConfig(),
      )
      registry.onModuleInit()

      registry.reportFailure('google:gemini-flash', { statusCode: 429 })
      vi.advanceTimersByTime(29_000)
      expect(registry.getNextModel().modelKey).toBe('groq:qwen-32b')

      vi.advanceTimersByTime(2_000) // now 31s total
      expect(registry.getNextModel().modelKey).toBe('google:gemini-flash')

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

      for (let i = 0; i < 10; i++) {
        registry.reportFailure('google:gemini-flash', { statusCode: 429 })
        vi.advanceTimersByTime(300_001)
      }

      vi.advanceTimersByTime(300_001)
      expect(registry.getNextModel().modelKey).toBe('google:gemini-flash')
    })

    it('resets failCount after 5 minutes without failure', () => {
      const registry = new LlmProviderRegistry(
        makeLoggerFactory() as never,
        makeRuntimeConfig({
          LLM_PROVIDERS_CONFIG: JSON.stringify([
            { tier: 1, provider: 'google', model: 'gemini-flash' },
            { tier: 2, provider: 'groq', model: 'qwen-32b' },
          ]),
        }),
      )
      registry.onModuleInit()

      // First failure: failCount=1, backoff=30s
      registry.reportFailure('google:gemini-flash', { statusCode: 429 })
      vi.advanceTimersByTime(30_001)

      // Second failure: failCount=2, backoff=60s
      registry.reportFailure('google:gemini-flash', { statusCode: 429 })
      vi.advanceTimersByTime(60_001)

      // Wait 5+ minutes for staleness reset
      vi.advanceTimersByTime(300_001)

      // getNextModel triggers staleness reset (failCount -> 0)
      const afterReset = registry.getNextModel()
      expect(afterReset.modelKey).toBe('google:gemini-flash')

      // New failure after reset should use base backoff (30s), not escalated
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
})
