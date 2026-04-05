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

function makeLlmRegistry(overrides: Record<string, unknown> = {}) {
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
    ...overrides,
  }
}

function makeInput(
  overrides: Partial<AgentGenerateInput> = {},
): AgentGenerateInput {
  return {
    date: '2026-04-05',
    meetingType: 'daily',
    gitActivity: { timestamp: '2026-04-05', repos: [] },
    ...overrides,
  }
}

function createService(registryOverrides: Record<string, unknown> = {}) {
  return new StandupAgentService(
    makeLoggerFactory() as any,
    makePromptService() as any,
    makeLlmRegistry(registryOverrides) as any,
    mockAgent as any,
  )
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

    service = createService()
  })

  describe('generate', () => {
    it('should generate standup with structured output', async () => {
      const result = await service.generate(makeInput())

      expect(result.isOk()).toBe(true)
      expect((result as any).value).toEqual(
        expect.objectContaining({
          content: 'standup content',
          summary: 'summary',
        }),
      )
    })

    it('should call agent.generate with correct options', async () => {
      await service.generate(makeInput())

      expect(mockGenerate).toHaveBeenCalledWith(
        'user-message',
        expect.objectContaining({
          instructions: 'system-prompt',
          model: 'google/gemini-2.5-pro',
          structuredOutput: expect.objectContaining({ schema: expect.any(Object) }),
          memory: expect.objectContaining({
            resource: expect.stringContaining('user-'),
            thread: expect.stringContaining('standup-generate-'),
          }),
        }),
      )
    })

    it('should report success to registry on success', async () => {
      const registry = makeLlmRegistry()
      service = new StandupAgentService(
        makeLoggerFactory() as any,
        makePromptService() as any,
        registry as any,
        mockAgent as any,
      )

      await service.generate(makeInput())

      expect(registry.reportSuccess).toHaveBeenCalledWith(
        'google:gemini-2.5-pro',
      )
    })

    it('should try streaming when onContentDelta is provided', async () => {
      const onContentDelta = vi.fn()
      const mockTextStream = {
        async *[Symbol.asyncIterator]() {
          yield 'chunk1'
          yield 'chunk2'
        },
      }

      mockStream.mockResolvedValue({
        textStream: mockTextStream,
        object: Promise.resolve({
          content: 'streamed content',
          summary: 'streamed summary',
        }),
      })

      const result = await service.generate(
        makeInput({ onContentDelta }),
      )

      expect(result.isOk()).toBe(true)
      expect(onContentDelta).toHaveBeenCalledWith('chunk1')
      expect(onContentDelta).toHaveBeenCalledWith('chunk2')
    })

    it('should fallback to generate when streaming fails', async () => {
      mockStream.mockRejectedValue(new Error('stream error'))

      const result = await service.generate(
        makeInput({ onContentDelta: vi.fn() }),
      )

      expect(result.isOk()).toBe(true)
      expect(mockGenerate).toHaveBeenCalled()
    })
  })

  describe('adjust', () => {
    it('should adjust standup using memory thread', async () => {
      const result = await service.adjust({
        standupId: 'standup-123',
        instruction: 'Make it shorter',
        previousContent: 'original content',
        previousSummary: 'original summary',
      })

      expect(result.isOk()).toBe(true)
      expect((result as any).value).toEqual(
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
      expect((result as any).value).toBe('Weekly insights here')
    })

    it('should return error when no standups provided', async () => {
      const result = await service.generateWeeklyInsights([])

      expect(result.isErr()).toBe(true)
    })
  })

  describe('model fallback', () => {
    it('should try next model when first fails', async () => {
      const registry = makeLlmRegistry({ totalModels: 2 })

      mockGenerate
        .mockRejectedValueOnce(new Error('Rate limit'))
        .mockResolvedValueOnce({
          object: { content: 'content', summary: 'summary' },
        })

      service = new StandupAgentService(
        makeLoggerFactory() as any,
        makePromptService() as any,
        registry as any,
        mockAgent as any,
      )

      const result = await service.generate(makeInput())

      expect(result.isOk()).toBe(true)
      expect(registry.reportFailure).toHaveBeenCalledTimes(1)
      expect(registry.reportSuccess).toHaveBeenCalledTimes(1)
    })

    it('should return error when all models fail', async () => {
      const registry = makeLlmRegistry({ totalModels: 1 })

      mockGenerate.mockRejectedValue(new Error('Model failed'))

      service = new StandupAgentService(
        makeLoggerFactory() as any,
        makePromptService() as any,
        registry as any,
        mockAgent as any,
      )

      const result = await service.generate(makeInput())

      expect(result.isErr()).toBe(true)
    })

    it('should return error when all providers unavailable', async () => {
      const registry = makeLlmRegistry({ totalModels: 1 })
      registry.getNextModel.mockImplementation(() => {
        throw new AllProvidersUnavailableError({
          message: 'All in backoff',
          modelsAttempted: 1,
        })
      })

      service = new StandupAgentService(
        makeLoggerFactory() as any,
        makePromptService() as any,
        registry as any,
        mockAgent as any,
      )

      const result = await service.generate(makeInput())

      expect(result.isErr()).toBe(true)
    })
  })
})
