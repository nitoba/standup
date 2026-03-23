import { describe, expect, it, vi, beforeEach } from 'vitest'
import { Result } from '../../../../shared/domain'
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
    get totalModels() {
      return models.length
    },
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

  it('retries transient error within same model then falls back', async () => {
    // Model 1: attempt 1 fails, attempt 2 fails → exhausted maxRetries (2)
    // Model 2: attempt 1 succeeds
    llmBehavior = ['error', 'error', 'success']

    const result = await service.generateStandup({
      date: '2026-03-23',
      meetingType: 'daily',
    })

    expect(result.isOk()).toBe(true)
    // Non-rate-limit errors don't call reportFailure
    expect(registry.reportFailure).not.toHaveBeenCalled()
    expect(registry.reportSuccess).toHaveBeenCalledWith('groq:qwen')
  })

  it('returns error when all models fail', async () => {
    // 3 models * 2 retries each = 6 attempts
    llmBehavior = ['error', 'error', 'error', 'error', 'error', 'error']

    const result = await service.generateStandup({
      date: '2026-03-23',
      meetingType: 'daily',
    })

    expect(result.isErr()).toBe(true)
  })

  it('rate limit skips all retries for that model', async () => {
    // Model 1: rate-limited (breaks immediately, no retry)
    // Model 2: rate-limited (breaks immediately)
    // Model 3: succeeds
    llmBehavior = ['rate-limit', 'rate-limit', 'success']

    const result = await service.generateStandup({
      date: '2026-03-23',
      meetingType: 'daily',
    })

    expect(result.isOk()).toBe(true)
    expect(registry.reportFailure).toHaveBeenCalledTimes(2)
    expect(registry.reportSuccess).toHaveBeenCalledWith('openrouter:free')
    expect(llmCallCount).toBe(3)
  })

  it('generateWeeklyInsights uses fallback on rate limit', async () => {
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
    expect(registry.reportSuccess).toHaveBeenCalledWith('groq:qwen')
  })

  it('generateAdjustedStandup uses fallback on rate limit', async () => {
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
    expect(registry.reportSuccess).toHaveBeenCalledWith('groq:qwen')
  })

  it('generateAdjustedStandup returns error for empty content', async () => {
    const result = await service.generateAdjustedStandup({
      previousContent: '   ',
      instruction: 'make it shorter',
    })

    expect(result.isErr()).toBe(true)
  })

  it('generateAdjustedStandup returns error for empty instruction', async () => {
    const result = await service.generateAdjustedStandup({
      previousContent: 'some content',
      instruction: '   ',
    })

    expect(result.isErr()).toBe(true)
  })

  it('generateWeeklyInsights returns error for empty standups array', async () => {
    const result = await service.generateWeeklyInsights([])

    expect(result.isErr()).toBe(true)
  })
})
