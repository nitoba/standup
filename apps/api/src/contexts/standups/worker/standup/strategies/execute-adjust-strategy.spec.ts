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

function makeStandupAgent(overrides: Record<string, unknown> = {}) {
  return {
    adjust: vi
      .fn()
      .mockResolvedValue(
        Result.ok({ content: 'agent adjusted', summary: 'agent' }),
      ),
    ...overrides,
  }
}

function buildStrategy(
  opts: {
    repo?: ReturnType<typeof makeStandupRepository>
    agent?: ReturnType<typeof makeStandupAgent>
  } = {},
) {
  return new ExecuteAdjustStrategy(
    (opts.repo ?? makeStandupRepository()) as never,
    (opts.agent ?? makeStandupAgent()) as never,
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

describe('ExecuteAdjustStrategy', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('uses PI Agent to adjust standup', async () => {
    const agent = makeStandupAgent()
    const strategy = buildStrategy({ agent })

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
      findByIdForUser: vi
        .fn()
        .mockResolvedValue(Result.err(new Error('not found'))),
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
    const strategy = buildStrategy({ agent })

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

  it('returns content with meetingType and sourceData from base standup', async () => {
    const strategy = buildStrategy()

    const result = await strategy.execute({
      options: defaultOptions as never,
      today: '2026-04-02',
    })

    expect(result.isOk()).toBe(true)
    if (result.isOk()) {
      expect(result.value).toEqual(
        expect.objectContaining({
          content: 'agent adjusted',
          meetingType: 'daily',
          sourceData: '{}',
          replaceStandupId: 'standup-1',
        }),
      )
    }
  })
})
