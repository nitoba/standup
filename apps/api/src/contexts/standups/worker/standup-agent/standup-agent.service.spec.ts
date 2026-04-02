/** biome-ignore-all lint/style/noNonNullAssertion: test assertions after expect().toBeDefined() */
/** biome-ignore-all lint/suspicious/noExplicitAny: accessing private methods for unit testing */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AllProvidersUnavailableError } from '../../../../shared/domain'
import type { AgentGenerateInput } from './standup-agent.service'
import { StandupAgentService } from './standup-agent.service'

// --- Mock state ---

let toolCallContent: string
let toolCallSummary: string

const mockPrompt = vi.fn()
const mockState = {
  messages: [] as Array<{
    role: string
    content: Array<{ type: string; name?: string; arguments?: unknown }>
  }>,
}

const mockSubscribe = vi.fn(() => vi.fn())

vi.mock('@mariozechner/pi-agent-core', () => {
  function Agent(this: Record<string, unknown>) {
    this.prompt = mockPrompt
    this.state = mockState
    this.subscribe = mockSubscribe
  }
  return { Agent }
})

vi.mock('./pi-ai-model-adapter', () => ({
  toPiAiModel: vi.fn(() => ({ modelId: 'mock-model' })),
}))

vi.mock('./submit-standup.tool', () => ({
  submitStandupTool: { name: 'submit_standup', label: 'Submit Standup' },
  extractSubmitStandupResult: vi.fn(),
}))

import { extractSubmitStandupResult } from './submit-standup.tool'

const mockExtract = vi.mocked(extractSubmitStandupResult)

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
  }
}

function makeRuntimeConfig() {
  return {
    config: {
      GOOGLE_API_KEY: 'test-google-key',
      GROQ_API_KEY: 'test-groq-key',
      OPENROUTER_API_KEY: 'test-openrouter-key',
    },
  }
}

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
      const entry = models[modelIndex % models.length]!
      modelIndex++
      return entry
    }),
    reportFailure: vi.fn(),
    reportSuccess: vi.fn(),
  }
}

function makeInput(
  overrides?: Partial<AgentGenerateInput>,
): AgentGenerateInput {
  return {
    date: '2026-04-01',
    meetingType: 'daily',
    gitActivity: { timestamp: '2026-04-01', repos: [] } as never,
    ...overrides,
  }
}

function makeSessionManager() {
  return {
    get: vi.fn().mockReturnValue(null),
    create: vi.fn(),
    destroy: vi.fn(),
    has: vi.fn().mockReturnValue(false),
  }
}

describe('StandupAgentService', () => {
  let service: StandupAgentService
  let registry: ReturnType<typeof makeRegistry>
  let promptService: ReturnType<typeof makePromptService>

  beforeEach(() => {
    vi.clearAllMocks()
    toolCallContent = 'standup content'
    toolCallSummary = 'standup summary'

    registry = makeRegistry()
    promptService = makePromptService()

    // Default: extract returns a valid result
    mockExtract.mockReturnValue({
      content: toolCallContent,
      summary: toolCallSummary,
    })

    // Default: prompt resolves successfully
    mockPrompt.mockResolvedValue(undefined)

    service = new StandupAgentService(
      makeLoggerFactory() as never,
      promptService as never,
      registry as never,
      makeRuntimeConfig() as never,
      makeSessionManager() as never,
    )
  })

  it('succeeds on first model', async () => {
    const result = await service.generate(makeInput())

    expect(result.isOk()).toBe(true)
    if (result.isOk()) {
      expect(result.value.content).toBe('standup content')
      expect(result.value.summary).toBe('standup summary')
      expect(result.value.agent).toBeDefined()
    }
    expect(registry.reportSuccess).toHaveBeenCalledWith('google:gemini')
    expect(registry.getNextModel).toHaveBeenCalledTimes(1)
  })

  it('falls back to next model when agent throws', async () => {
    let callCount = 0
    mockPrompt.mockImplementation(async () => {
      callCount++
      if (callCount === 1) {
        throw new Error('Agent failed')
      }
    })

    const result = await service.generate(makeInput())

    expect(result.isOk()).toBe(true)
    expect(registry.getNextModel).toHaveBeenCalledTimes(2)
    expect(registry.reportSuccess).toHaveBeenCalledWith('groq:qwen')
  })

  it('treats missing tool call as error, tries next model', async () => {
    let callCount = 0
    mockExtract.mockImplementation(() => {
      callCount++
      if (callCount === 1) return null
      return { content: 'standup content', summary: 'standup summary' }
    })

    const result = await service.generate(makeInput())

    expect(result.isOk()).toBe(true)
    expect(registry.getNextModel).toHaveBeenCalledTimes(2)
    expect(registry.reportSuccess).toHaveBeenCalledWith('groq:qwen')
  })

  it('returns AllProvidersUnavailableError when all fail', async () => {
    mockPrompt.mockRejectedValue(new Error('Agent failed'))

    const result = await service.generate(makeInput())

    expect(result.isErr()).toBe(true)
    if (result.isErr()) {
      expect(result.error).toBeInstanceOf(AllProvidersUnavailableError)
    }
    expect(registry.getNextModel).toHaveBeenCalledTimes(3)
  })

  it('calls onStageChange callback', async () => {
    const onStageChange = vi.fn()

    await service.generate(makeInput({ onStageChange }))

    expect(onStageChange).toHaveBeenCalledWith('generating_standup')
  })

  it('reports rate limit error to registry', async () => {
    let callCount = 0
    mockPrompt.mockImplementation(async () => {
      callCount++
      if (callCount === 1) {
        const err = new Error('Rate limited')
        Object.assign(err, { statusCode: 429 })
        throw err
      }
    })

    const result = await service.generate(makeInput())

    expect(result.isOk()).toBe(true)
    expect(registry.reportFailure).toHaveBeenCalledWith(
      'google:gemini',
      expect.objectContaining({ statusCode: 429 }),
    )
    expect(registry.reportSuccess).toHaveBeenCalledWith('groq:qwen')
  })

  it('handles content exceeding limit with rewrite', async () => {
    let extractCallCount = 0
    mockExtract.mockImplementation(() => {
      extractCallCount++
      if (extractCallCount === 1) {
        return { content: 'x'.repeat(2500), summary: 'long summary' }
      }
      return { content: 'short content', summary: 'short summary' }
    })

    const result = await service.generate(makeInput())

    expect(result.isOk()).toBe(true)
    if (result.isOk()) {
      expect(result.value.content).toBe('short content')
    }
    expect(promptService.buildRewriteUserMessage).toHaveBeenCalled()
    // prompt called twice: initial + rewrite
    expect(mockPrompt).toHaveBeenCalledTimes(2)
  })

  it('slices content at max chars when rewrite still exceeds limit', async () => {
    mockExtract.mockReturnValue({
      content: 'x'.repeat(2500),
      summary: 'summary',
    })

    const result = await service.generate(makeInput())

    expect(result.isOk()).toBe(true)
    if (result.isOk()) {
      expect(result.value.content.length).toBe(2000)
    }
  })

  it('slices content at max chars when rewrite does not produce a tool call', async () => {
    let extractCallCount = 0
    mockExtract.mockImplementation(() => {
      extractCallCount++
      if (extractCallCount === 1) {
        // Initial call: oversized content triggers rewrite attempt
        return { content: 'x'.repeat(2500), summary: 'summary' }
      }
      // Rewrite call: agent didn't call the tool
      return null
    })

    const result = await service.generate(makeInput())

    expect(result.isOk()).toBe(true)
    if (result.isOk()) {
      expect(result.value.content.length).toBe(2000)
      expect(result.value.summary).toBe('summary')
    }
    expect(promptService.buildRewriteUserMessage).toHaveBeenCalled()
    expect(mockPrompt).toHaveBeenCalledTimes(2)
  })

  it('returns AllProvidersUnavailableError when registry throws it', async () => {
    const registryError = new AllProvidersUnavailableError({
      message: 'All exhausted',
      modelsAttempted: 3,
    })
    registry.getNextModel.mockImplementation(() => {
      throw registryError
    })

    const result = await service.generate(makeInput())

    expect(result.isErr()).toBe(true)
    if (result.isErr()) {
      expect(result.error).toBe(registryError)
    }
  })

  it('builds prompts with correct input parameters', async () => {
    const input = makeInput({
      boardActivity: { items: [] } as never,
      extraContext: 'extra info',
    })

    await service.generate(input)

    expect(promptService.buildSystemPrompt).toHaveBeenCalledWith({
      hasGit: true,
      hasBoard: true,
    })
    expect(promptService.buildUserMessage).toHaveBeenCalledWith(
      {
        date: '2026-04-01',
        meetingType: 'daily',
        gitActivity: input.gitActivity,
        boardActivity: input.boardActivity,
        extraContext: 'extra info',
        azureDevopsUuid: undefined,
      },
      input.enrichedActivity,
    )
  })

  describe('extractPartialContent', () => {
    it('extracts from complete JSON', () => {
      const svc = service as any
      expect(
        svc.extractPartialContent('{"content":"hello world","summary":"s"}'),
      ).toBe('hello world')
    })

    it('extracts from incomplete JSON', () => {
      const svc = service as any
      expect(svc.extractPartialContent('{"content":"hello world')).toBe(
        'hello world',
      )
    })

    it('handles escaped characters', () => {
      const svc = service as any
      expect(svc.extractPartialContent('{"content":"line1\\nline2')).toBe(
        'line1\nline2',
      )
    })

    it('returns null when no content field', () => {
      const svc = service as any
      expect(svc.extractPartialContent('{"summary":"s')).toBeNull()
    })

    it('returns null for empty string', () => {
      const svc = service as any
      expect(svc.extractPartialContent('')).toBeNull()
    })
  })

  it('accepts onContentDelta without errors', async () => {
    const onContentDelta = vi.fn()
    const result = await service.generate(makeInput({ onContentDelta }))
    expect(result.isOk()).toBe(true)
    // onContentDelta may not be called since mock Agent doesn't emit events
  })

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
      expect(sessionManager.create).toHaveBeenCalledWith(
        'standup-1',
        expect.anything(),
      )
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
})
