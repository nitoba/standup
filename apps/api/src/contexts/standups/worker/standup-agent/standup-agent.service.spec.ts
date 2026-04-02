/** biome-ignore-all lint/style/noNonNullAssertion: never be nullable */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AllProvidersUnavailableError, Result } from '../../../../shared/domain'
import { StandupAgentService } from './standup-agent.service'
import type { AgentGenerateInput } from './standup-agent.service'

// --- Mock state ---

let agentPromptCalls: string[]
let agentPromptBehavior: Array<'success' | 'no-tool-call' | 'error' | 'timeout'>
let agentCallIndex: number
let toolCallContent: string
let toolCallSummary: string

const mockPrompt = vi.fn()
const mockState = {
  messages: [] as Array<{
    role: string
    content: Array<{ type: string; name?: string; arguments?: unknown }>
  }>,
}

vi.mock('@mariozechner/pi-agent-core', () => {
  function Agent(this: Record<string, unknown>) {
    this.prompt = mockPrompt
    this.state = mockState
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

import { Agent } from '@mariozechner/pi-agent-core'
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

function makeInput(overrides?: Partial<AgentGenerateInput>): AgentGenerateInput {
  return {
    date: '2026-04-01',
    meetingType: 'daily',
    gitActivity: { timestamp: '2026-04-01', repos: [] } as never,
    ...overrides,
  }
}

describe('StandupAgentService', () => {
  let service: StandupAgentService
  let registry: ReturnType<typeof makeRegistry>
  let promptService: ReturnType<typeof makePromptService>

  beforeEach(() => {
    vi.clearAllMocks()
    agentPromptCalls = []
    agentPromptBehavior = []
    agentCallIndex = 0
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
    )
  })

  it('succeeds on first model', async () => {
    const result = await service.generate(makeInput())

    expect(result.isOk()).toBe(true)
    if (result.isOk()) {
      expect(result.value).toEqual({
        content: 'standup content',
        summary: 'standup summary',
      })
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
})
