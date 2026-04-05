/** biome-ignore-all lint/style/noNonNullAssertion: test assertions after expect().toBeDefined() */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Result } from '../../../../../shared/domain'
import { ExecuteGenerateStrategy } from './execute-generate-strategy'

// --- Mock factories ---

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

function makeGitCollector() {
  return {
    collect: vi.fn().mockResolvedValue(
      Result.ok({
        repos: [{ name: 'repo-a', commits: [{ message: 'feat: something' }] }],
      }),
    ),
  }
}

function makeBoardCollector() {
  return {
    collect: vi.fn().mockResolvedValue(null),
  }
}

function makeStandupAgent() {
  return {
    generate: vi.fn().mockResolvedValue(
      Result.ok({
        content: 'Agent standup content',
        summary: 'Agent summary',
      }),
    ),
  }
}

function makeTracing() {
  return {
    withSpan: vi
      .fn()
      .mockImplementation((_name: string, _attrs: unknown, fn: () => unknown) =>
        fn(),
      ),
  }
}

function makeStandupReadRepo() {
  return {
    findLastApprovedByUser: vi.fn().mockResolvedValue(Result.ok(null)),
  }
}

function makeLocalDateService() {
  return {
    today: vi.fn().mockReturnValue({ iso: '2026-04-01' }),
    getDayOfWeek: vi.fn().mockReturnValue('wednesday'),
  }
}

function makePromptService() {
  return {
    determineMeetingType: vi.fn().mockReturnValue('daily'),
  }
}

function makeDefaultOptions() {
  return {
    userId: 'user-1',
    discordUserId: 'discord-1',
    selectedRepos: ['/repos/repo-a'],
    gitAuthor: 'Bruno Alves',
    timezone: 'America/Sao_Paulo',
  }
}

describe('ExecuteGenerateStrategy', () => {
  let loggerFactory: ReturnType<typeof makeLoggerFactory>
  let gitCollector: ReturnType<typeof makeGitCollector>
  let boardCollector: ReturnType<typeof makeBoardCollector>
  let standupAgent: ReturnType<typeof makeStandupAgent>
  let tracing: ReturnType<typeof makeTracing>
  let standupReadRepo: ReturnType<typeof makeStandupReadRepo>
  let localDateService: ReturnType<typeof makeLocalDateService>
  let promptService: ReturnType<typeof makePromptService>

  function buildStrategy() {
    // biome-ignore lint/suspicious/noExplicitAny: test mock wiring
    const strategy = new (ExecuteGenerateStrategy as any)(
      loggerFactory,
      gitCollector,
      boardCollector,
      tracing,
      standupReadRepo,
      localDateService,
      standupAgent,
      promptService,
    ) as ExecuteGenerateStrategy
    return { strategy }
  }

  beforeEach(() => {
    vi.clearAllMocks()
    loggerFactory = makeLoggerFactory()
    gitCollector = makeGitCollector()
    boardCollector = makeBoardCollector()
    standupAgent = makeStandupAgent()
    tracing = makeTracing()
    standupReadRepo = makeStandupReadRepo()
    localDateService = makeLocalDateService()
    promptService = makePromptService()
  })

  it('uses PI Agent to generate standup', async () => {
    const { strategy } = buildStrategy()

    const result = await strategy.execute({
      options: makeDefaultOptions(),
      today: '2026-04-01',
    })

    expect(result.isOk()).toBe(true)
    expect(standupAgent.generate).toHaveBeenCalledOnce()

    if (result.isOk() && result.value) {
      expect(result.value.content).toBe('Agent standup content')
    }
  })

  it('passes correct tracing span name', async () => {
    const { strategy } = buildStrategy()

    await strategy.execute({
      options: makeDefaultOptions(),
      today: '2026-04-01',
    })

    const generationSpanCall = tracing.withSpan.mock.calls.find(
      (call: unknown[]) => call[0] === 'standup.agent.generate',
    )
    expect(generationSpanCall).toBeDefined()
    expect(generationSpanCall![1]).toEqual(
      expect.objectContaining({ 'standup.mode': 'agent' }),
    )
  })
})
