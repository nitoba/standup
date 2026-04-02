import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Result } from '../../../../../shared/domain'
import { ExecuteAdjustStrategy } from './execute-adjust-strategy'

// --- Mock factories ---

function makeStandupRepository(overrides: Record<string, unknown> = {}) {
  return {
    findByIdForUser: vi.fn().mockResolvedValue(
      Result.ok({
        content: 'old standup',
        meetingType: 'daily',
        sourceData: '{}',
      }),
    ),
    ...overrides,
  }
}

function makeStandupGenerator(overrides: Record<string, unknown> = {}) {
  return {
    generateAdjustedStandup: vi.fn().mockResolvedValue(
      Result.ok({ content: 'legacy adjusted', summary: 'legacy' }),
    ),
    ...overrides,
  }
}

function makeStandupAgent(overrides: Record<string, unknown> = {}) {
  return {
    adjust: vi.fn().mockResolvedValue(
      Result.ok({ content: 'agent adjusted', summary: 'agent' }),
    ),
    ...overrides,
  }
}

function makeRuntimeConfig(usePiAgent = false) {
  return {
    get config() {
      return { USE_PI_AGENT: usePiAgent }
    },
  }
}

function buildStrategy(opts: {
  repo?: ReturnType<typeof makeStandupRepository>
  generator?: ReturnType<typeof makeStandupGenerator>
  agent?: ReturnType<typeof makeStandupAgent>
  runtimeConfig?: ReturnType<typeof makeRuntimeConfig>
} = {}) {
  return new ExecuteAdjustStrategy(
    (opts.repo ?? makeStandupRepository()) as never,
    (opts.generator ?? makeStandupGenerator()) as never,
    (opts.agent ?? makeStandupAgent()) as never,
    (opts.runtimeConfig ?? makeRuntimeConfig(false)) as never,
  )
}

const defaultOptions = {
  userId: 'user-1',
  discordUserId: 'discord-1',
  selectedRepos: [],
  gitAuthor: '',
  timezone: 'UTC',
  rewriteInstruction: 'make it shorter',
  rewriteFromStandupId: 'standup-1',
  replaceStandupId: 'standup-1',
}

describe('ExecuteAdjustStrategy — PI Agent branching', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('uses legacy generator when USE_PI_AGENT is false', async () => {
    const generator = makeStandupGenerator()
    const agent = makeStandupAgent()
    const strategy = buildStrategy({
      generator,
      agent,
      runtimeConfig: makeRuntimeConfig(false),
    })

    const result = await strategy.execute({
      options: defaultOptions as never,
      today: '2026-04-02',
    })

    expect(result.isOk()).toBe(true)
    expect(generator.generateAdjustedStandup).toHaveBeenCalled()
    expect(agent.adjust).not.toHaveBeenCalled()
  })

  it('uses PI Agent when USE_PI_AGENT is true', async () => {
    const generator = makeStandupGenerator()
    const agent = makeStandupAgent()
    const strategy = buildStrategy({
      generator,
      agent,
      runtimeConfig: makeRuntimeConfig(true),
    })

    const result = await strategy.execute({
      options: defaultOptions as never,
      today: '2026-04-02',
    })

    expect(result.isOk()).toBe(true)
    expect(agent.adjust).toHaveBeenCalledWith(
      expect.objectContaining({
        standupId: 'standup-1',
        instruction: 'make it shorter',
        previousContent: 'old standup',
      }),
    )
    expect(generator.generateAdjustedStandup).not.toHaveBeenCalled()
  })

  it('returns error when rewriteInstruction is missing', async () => {
    const strategy = buildStrategy()

    const result = await strategy.execute({
      options: { ...defaultOptions, rewriteInstruction: '' } as never,
      today: '2026-04-02',
    })

    expect(result.isErr()).toBe(true)
  })

  it('returns error when rewriteFromStandupId is missing', async () => {
    const strategy = buildStrategy()

    const result = await strategy.execute({
      options: { ...defaultOptions, rewriteFromStandupId: '' } as never,
      today: '2026-04-02',
    })

    expect(result.isErr()).toBe(true)
  })

  it('returns error when base standup is not found', async () => {
    const repo = makeStandupRepository({
      findByIdForUser: vi.fn().mockResolvedValue(
        Result.err(new Error('not found')),
      ),
    })
    const strategy = buildStrategy({ repo })

    const result = await strategy.execute({
      options: defaultOptions as never,
      today: '2026-04-02',
    })

    expect(result.isErr()).toBe(true)
  })

  it('passes extraContext to PI Agent when provided', async () => {
    const agent = makeStandupAgent()
    const strategy = buildStrategy({
      agent,
      runtimeConfig: makeRuntimeConfig(true),
    })

    await strategy.execute({
      options: { ...defaultOptions, extraContext: ' some context ' } as never,
      today: '2026-04-02',
    })

    expect(agent.adjust).toHaveBeenCalledWith(
      expect.objectContaining({
        extraContext: 'some context',
      }),
    )
  })

  it('passes extraContext to legacy generator when provided', async () => {
    const generator = makeStandupGenerator()
    const strategy = buildStrategy({
      generator,
      runtimeConfig: makeRuntimeConfig(false),
    })

    await strategy.execute({
      options: { ...defaultOptions, extraContext: ' some context ' } as never,
      today: '2026-04-02',
    })

    expect(generator.generateAdjustedStandup).toHaveBeenCalledWith(
      expect.objectContaining({
        extraContext: 'some context',
      }),
      expect.any(Function),
    )
  })

  it('returns content with meetingType and sourceData from base standup', async () => {
    const strategy = buildStrategy({
      runtimeConfig: makeRuntimeConfig(false),
    })

    const result = await strategy.execute({
      options: defaultOptions as never,
      today: '2026-04-02',
    })

    expect(result.isOk()).toBe(true)
    if (result.isOk()) {
      expect(result.value).toEqual(
        expect.objectContaining({
          content: 'legacy adjusted',
          meetingType: 'daily',
          sourceData: '{}',
          replaceStandupId: 'standup-1',
        }),
      )
    }
  })
})
