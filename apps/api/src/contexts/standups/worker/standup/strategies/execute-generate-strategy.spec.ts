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

function makeStandupGenerator() {
  return {
    determineMeetingType: vi.fn().mockReturnValue('daily'),
    generateStandup: vi.fn().mockResolvedValue(
      Result.ok({
        content: 'Legacy standup content',
        summary: 'Legacy summary',
      }),
    ),
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

function makeRuntimeConfig(usePiAgent: boolean) {
  return {
    get config() {
      return { USE_PI_AGENT: usePiAgent }
    },
  }
}

function makeSessionManager() {
  return { create: vi.fn(), get: vi.fn(), destroy: vi.fn(), has: vi.fn() }
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
  let standupGenerator: ReturnType<typeof makeStandupGenerator>
  let standupAgent: ReturnType<typeof makeStandupAgent>
  let tracing: ReturnType<typeof makeTracing>
  let standupReadRepo: ReturnType<typeof makeStandupReadRepo>
  let localDateService: ReturnType<typeof makeLocalDateService>

  function buildStrategy(
    usePiAgent: boolean,
    sessionManager = makeSessionManager(),
  ) {
    const runtimeConfig = makeRuntimeConfig(usePiAgent)
    // biome-ignore lint/suspicious/noExplicitAny: test mock wiring
    const strategy = new (ExecuteGenerateStrategy as any)(
      loggerFactory,
      gitCollector,
      boardCollector,
      standupGenerator,
      tracing,
      standupReadRepo,
      localDateService,
      standupAgent,
      runtimeConfig,
      sessionManager,
    ) as ExecuteGenerateStrategy
    return { strategy, sessionManager }
  }

  beforeEach(() => {
    vi.clearAllMocks()
    loggerFactory = makeLoggerFactory()
    gitCollector = makeGitCollector()
    boardCollector = makeBoardCollector()
    standupGenerator = makeStandupGenerator()
    standupAgent = makeStandupAgent()
    tracing = makeTracing()
    standupReadRepo = makeStandupReadRepo()
    localDateService = makeLocalDateService()
  })

  it('uses legacy generator when USE_PI_AGENT is false', async () => {
    const { strategy } = buildStrategy(false)

    const result = await strategy.execute({
      options: makeDefaultOptions(),
      today: '2026-04-01',
    })

    expect(result.isOk()).toBe(true)
    expect(standupGenerator.generateStandup).toHaveBeenCalledOnce()
    expect(standupAgent.generate).not.toHaveBeenCalled()

    if (result.isOk() && result.value) {
      expect(result.value.content).toBe('Legacy standup content')
    }
  })

  it('uses PI Agent when USE_PI_AGENT is true', async () => {
    const { strategy } = buildStrategy(true)

    const result = await strategy.execute({
      options: makeDefaultOptions(),
      today: '2026-04-01',
    })

    expect(result.isOk()).toBe(true)
    expect(standupAgent.generate).toHaveBeenCalledOnce()
    expect(standupGenerator.generateStandup).not.toHaveBeenCalled()

    if (result.isOk() && result.value) {
      expect(result.value.content).toBe('Agent standup content')
    }
  })

  it('passes correct tracing span name for agent mode', async () => {
    const { strategy } = buildStrategy(true)

    await strategy.execute({
      options: makeDefaultOptions(),
      today: '2026-04-01',
    })

    // Find the generation span call (not the git collection span)
    const generationSpanCall = tracing.withSpan.mock.calls.find(
      (call: unknown[]) => call[0] === 'standup.agent.generate',
    )
    expect(generationSpanCall).toBeDefined()
    expect(generationSpanCall![1]).toEqual(
      expect.objectContaining({ 'standup.mode': 'agent' }),
    )
  })

  it('passes correct tracing span name for legacy mode', async () => {
    const { strategy } = buildStrategy(false)

    await strategy.execute({
      options: makeDefaultOptions(),
      today: '2026-04-01',
    })

    const generationSpanCall = tracing.withSpan.mock.calls.find(
      (call: unknown[]) => call[0] === 'standup.llm.generate',
    )
    expect(generationSpanCall).toBeDefined()
    expect(generationSpanCall![1]).toEqual(
      expect.objectContaining({ 'standup.mode': 'generate' }),
    )
  })

  it('destroys old session on regenerate when USE_PI_AGENT is true', async () => {
    const sm = makeSessionManager()
    const { strategy } = buildStrategy(true, sm)

    await strategy.execute({
      options: {
        ...makeDefaultOptions(),
        replaceStandupId: 'old-standup',
      } as never,
      today: '2026-04-02',
    })

    expect(sm.destroy).toHaveBeenCalledWith('old-standup')
  })

  it('does not destroy session when replaceStandupId is absent', async () => {
    const sm = makeSessionManager()
    const { strategy } = buildStrategy(true, sm)

    await strategy.execute({
      options: makeDefaultOptions() as never,
      today: '2026-04-02',
    })

    expect(sm.destroy).not.toHaveBeenCalled()
  })

  it('does not destroy session when USE_PI_AGENT is false', async () => {
    const sm = makeSessionManager()
    const { strategy } = buildStrategy(false, sm)

    await strategy.execute({
      options: {
        ...makeDefaultOptions(),
        replaceStandupId: 'old-standup',
      } as never,
      today: '2026-04-02',
    })

    expect(sm.destroy).not.toHaveBeenCalled()
  })
})
