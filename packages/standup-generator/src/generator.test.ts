import type { AzureMcpClient, EnrichedWorkItem } from '@standup/azure-devops'
import type { GatheredGitActivity, GenerateStandupInput } from '@standup/domain'
import { ExternalServiceError, Result } from '@standup/domain'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { determineMeetingType } from './prompt/meeting-type.js'
import { MAX_STANDUP_CONTENT_CHARS } from './prompt/prompt.js'
import { determineWorkItemStatus } from './prompt/work-item-status.js'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@ai-sdk/groq', () => ({
  createGroq: vi.fn(() => (_model: string) => ({ modelId: _model })),
}))

vi.mock('ai', () => ({
  generateObject: vi.fn().mockResolvedValue({
    object: {
      content:
        '**Standup (04/03/2026)**\n\n**📌 agrotrace-web**\n\n**✅ Done:**\n➜ #1234 - Corrigir bug X\n',
      summary: 'Corrigi bug X no agrotrace-web',
    },
  }),
  generateText: vi.fn().mockResolvedValue({
    output: {
      content:
        '**Standup (04/03/2026)**\n\n**📌 agrotrace-web**\n\n**✅ Done:**\n➜ #1234 - Corrigir bug X\n',
      summary: 'Corrigi bug X no agrotrace-web',
    },
  }),
  Output: {
    json: vi.fn(() => ({})),
  },
}))

vi.mock('@standup/azure-devops', () => ({
  createAzureMcpClient: vi.fn(),
  enrichGitActivity: vi.fn(),
}))

// Mock setTimeout to avoid real delays during retry tests
vi.stubGlobal('setTimeout', (fn: () => void) => {
  fn()
  return 0
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeGitActivity(
  overrides?: Partial<GatheredGitActivity>,
): GatheredGitActivity {
  return {
    timestamp: '2026-03-04T17:00:00.000Z',
    repos: [
      {
        repoName: 'agrotrace-web',
        repoPath: '/repos/agrotrace-web',
        currentBranch: 'feat/1234-fix-bug',
        commits: [
          {
            hash: 'abc12345',
            subject: 'fix: corrigir bug X',
            body: '',
            filesChanged: 2,
            insertions: 10,
            deletions: 3,
            files: ['src/components/Foo.tsx'],
          },
        ],
        cardNumbers: ['1234'],
        branchCardNumber: '1234',
      },
    ],
    ...overrides,
  }
}

function makeInput(
  overrides?: Partial<GenerateStandupInput>,
): GenerateStandupInput {
  return {
    date: '2026-03-04',
    meetingType: '',
    gitActivity: makeGitActivity(),
    ...overrides,
  }
}

function makeFakeMcpClient(): AzureMcpClient {
  return {
    connect: vi.fn().mockResolvedValue(Result.ok(undefined)),
    disconnect: vi.fn().mockResolvedValue(undefined),
    getMe: vi.fn().mockResolvedValue(Result.ok('user-uuid-123')),
    getWorkItem: vi.fn().mockResolvedValue(
      Result.ok({
        id: '1234',
        title: 'Corrigir bug X',
        state: 'Done',
        assignedTo: 'bruno@example.com',
      }),
    ),
    listPullRequests: vi.fn().mockResolvedValue(Result.ok([])),
    listRepositories: vi.fn().mockResolvedValue(Result.ok([])),
  }
}

// ---------------------------------------------------------------------------
// Unit tests: determineMeetingType
// ---------------------------------------------------------------------------

describe('determineMeetingType', () => {
  it('returns Start of week meeting on Monday', () => {
    // 2026-03-02 is a Monday
    expect(determineMeetingType('2026-03-02')).toBe(
      '📆 (Start of week meeting)',
    )
  })

  it('returns Planing Web on Wednesday', () => {
    // 2026-03-04 is a Wednesday
    expect(determineMeetingType('2026-03-04')).toBe('📆 (Planing Web)')
  })

  it('returns Encerramento semanal on Friday', () => {
    // 2026-03-06 is a Friday
    expect(determineMeetingType('2026-03-06')).toBe('📆 (Encerramento semanal)')
  })

  it('returns empty string on Tuesday', () => {
    // 2026-03-03 is a Tuesday
    expect(determineMeetingType('2026-03-03')).toBe('')
  })

  it('returns empty string on Thursday', () => {
    // 2026-03-05 is a Thursday
    expect(determineMeetingType('2026-03-05')).toBe('')
  })

  it('returns empty string on Saturday', () => {
    // 2026-03-07 is a Saturday
    expect(determineMeetingType('2026-03-07')).toBe('')
  })
})

// ---------------------------------------------------------------------------
// Unit tests: determineWorkItemStatus
// ---------------------------------------------------------------------------

describe('determineWorkItemStatus', () => {
  it('returns done when work item state is Done', () => {
    const item: EnrichedWorkItem = {
      cardNumber: '1234',
      workItem: {
        id: '1234',
        title: 'Fix bug',
        state: 'Done',
        assignedTo: 'user@example.com',
      },
      pullRequests: [],
    }
    expect(determineWorkItemStatus(item)).toBe('done')
  })

  it('returns done when state is In Progress and all PRs are completed', () => {
    const item: EnrichedWorkItem = {
      cardNumber: '1234',
      workItem: {
        id: '1234',
        title: 'Fix bug',
        state: 'In Progress',
        assignedTo: 'user@example.com',
      },
      pullRequests: [
        {
          id: 1,
          title: 'PR 1',
          status: 'completed',
          repoId: 'repo',
          creatorId: 'uuid',
        },
        {
          id: 2,
          title: 'PR 2',
          status: 'active',
          repoId: 'repo',
          creatorId: 'uuid',
        },
      ],
    }
    expect(determineWorkItemStatus(item)).toBe('done')
  })

  it('returns in_progress when state is In Progress with no PRs', () => {
    const item: EnrichedWorkItem = {
      cardNumber: '1234',
      workItem: {
        id: '1234',
        title: 'Fix bug',
        state: 'In Progress',
        assignedTo: 'user@example.com',
      },
      pullRequests: [],
    }
    expect(determineWorkItemStatus(item)).toBe('in_progress')
  })

  it('returns in_progress when state is Committed', () => {
    const item: EnrichedWorkItem = {
      cardNumber: '5678',
      workItem: {
        id: '5678',
        title: 'New feature',
        state: 'Committed',
        assignedTo: 'user@example.com',
      },
      pullRequests: [],
    }
    expect(determineWorkItemStatus(item)).toBe('in_progress')
  })

  it('returns in_progress when work item is null', () => {
    const item: EnrichedWorkItem = {
      cardNumber: '9999',
      workItem: null,
      pullRequests: [],
    }
    expect(determineWorkItemStatus(item)).toBe('in_progress')
  })

  it('returns in_progress when state is In Progress and some PR is abandoned', () => {
    const item: EnrichedWorkItem = {
      cardNumber: '1234',
      workItem: {
        id: '1234',
        title: 'Fix bug',
        state: 'In Progress',
        assignedTo: 'user@example.com',
      },
      pullRequests: [
        {
          id: 1,
          title: 'PR 1',
          status: 'abandoned',
          repoId: 'repo',
          creatorId: 'uuid',
        },
      ],
    }
    expect(determineWorkItemStatus(item)).toBe('in_progress')
  })
})

// ---------------------------------------------------------------------------
// Integration-style tests: generateStandup (all external deps mocked)
// ---------------------------------------------------------------------------

describe('generateStandup', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  async function setup() {
    const { createAzureMcpClient, enrichGitActivity } = await import(
      '@standup/azure-devops'
    )
    const { generateStandup } = await import('./generator.js')
    const { generateText } = await import('ai')

    // Restore default happy-path mock for generateText after clearAllMocks
    vi.mocked(generateText).mockResolvedValue({
      output: {
        content:
          '**Standup (04/03/2026)**\n\n**📌 agrotrace-web**\n\n**✅ Done:**\n➜ #1234 - Corrigir bug X\n',
        summary: 'Corrigi bug X no agrotrace-web',
      },
    } as never)

    return {
      createAzureMcpClient,
      enrichGitActivity,
      generateStandup,
      generateText,
    }
  }

  const baseConfig = {
    aiProviderApiKey: 'test-token',
    azure: {
      orgUrl: 'https://dev.azure.com/test',
      pat: 'test-pat',
      defaultProject: 'AGROTRACE',
    },
  }

  const fakeEnrichedActivity = {
    timestamp: '2026-03-04T17:00:00.000Z',
    repos: [
      {
        repoName: 'agrotrace-web',
        repoPath: '/repos/agrotrace-web',
        currentBranch: 'feat/1234-fix-bug',
        commits: [
          {
            hash: 'abc12345',
            subject: 'fix: corrigir bug X',
            body: '',
            filesChanged: 2,
            insertions: 10,
            deletions: 3,
            files: ['src/components/Foo.tsx'],
          },
        ],
        cardNumbers: ['1234'],
        branchCardNumber: '1234',
        enrichedItems: [
          {
            cardNumber: '1234',
            workItem: {
              id: '1234',
              title: 'Corrigir bug X',
              state: 'Done',
              assignedTo: 'bruno@example.com',
            },
            pullRequests: [],
          },
        ],
      },
    ],
    userUuid: 'user-uuid-123',
  }

  it('returns Result.ok with content and summary on success', async () => {
    const { createAzureMcpClient, enrichGitActivity, generateStandup } =
      await setup()
    const fakeMcp = makeFakeMcpClient()
    vi.mocked(createAzureMcpClient).mockReturnValue(fakeMcp)
    vi.mocked(enrichGitActivity).mockResolvedValue(
      Result.ok(fakeEnrichedActivity) as never,
    )

    const result = await generateStandup(makeInput(), baseConfig)

    expect(result.status).toBe('ok')
    if (result.status === 'ok') {
      expect(result.value.content).toContain('Standup')
      expect(result.value.summary).toBeTruthy()
    }
  })

  it('rewrites standup when initial content exceeds max characters', async () => {
    const { createAzureMcpClient, enrichGitActivity, generateStandup } =
      await setup()
    const { generateText } = await import('ai')
    const fakeMcp = makeFakeMcpClient()
    vi.mocked(createAzureMcpClient).mockReturnValue(fakeMcp)
    vi.mocked(enrichGitActivity).mockResolvedValue(
      Result.ok(fakeEnrichedActivity) as never,
    )

    const oversizedContent =
      '**Standup (04/03/2026)**\n\n' +
      'A'.repeat(MAX_STANDUP_CONTENT_CHARS + 40)
    const rewrittenContent =
      '**Standup (04/03/2026)**\n\n**📌 agrotrace-web**\n\n**✅ Done:**\n➜ #1234 - Corrigir bug X\n'

    vi.mocked(generateText)
      .mockResolvedValueOnce({
        output: {
          content: oversizedContent,
          summary: 'Resumo longo',
        },
      } as never)
      .mockResolvedValueOnce({
        output: {
          content: rewrittenContent,
          summary: 'Resumo reescrito',
        },
      } as never)

    const result = await generateStandup(makeInput(), baseConfig)

    expect(result.status).toBe('ok')
    expect(generateText).toHaveBeenCalledTimes(2)
    if (result.status === 'ok') {
      expect(Array.from(result.value.content).length).toBeLessThanOrEqual(
        MAX_STANDUP_CONTENT_CHARS,
      )
      expect(result.value.summary).toBe('Resumo reescrito')
    }
  })

  it('returns Result.err when rewritten content still exceeds max characters', async () => {
    const { createAzureMcpClient, enrichGitActivity, generateStandup } =
      await setup()
    const { generateText } = await import('ai')
    const fakeMcp = makeFakeMcpClient()
    vi.mocked(createAzureMcpClient).mockReturnValue(fakeMcp)
    vi.mocked(enrichGitActivity).mockResolvedValue(
      Result.ok(fakeEnrichedActivity) as never,
    )

    const oversizedContent =
      '**Standup (04/03/2026)**\n\n' +
      'B'.repeat(MAX_STANDUP_CONTENT_CHARS + 80)

    vi.mocked(generateText)
      .mockResolvedValueOnce({
        output: {
          content: oversizedContent,
          summary: 'Resumo inicial',
        },
      } as never)
      .mockResolvedValueOnce({
        output: {
          content: oversizedContent,
          summary: 'Resumo ainda longo',
        },
      } as never)

    const result = await generateStandup(makeInput(), baseConfig)

    expect(result.status).toBe('error')
    expect(generateText).toHaveBeenCalledTimes(2)
    if (result.isErr()) {
      expect(result.error.message).toContain(
        `exceeds ${MAX_STANDUP_CONTENT_CHARS} characters`,
      )
    }
  })

  it('generates standup with git data only when MCP connect fails (fallback)', async () => {
    const { createAzureMcpClient, generateStandup } = await setup()
    const { generateText } = await import('ai')

    const fakeMcp = makeFakeMcpClient()
    vi.mocked(fakeMcp.connect).mockResolvedValue(
      Result.err(
        new ExternalServiceError({
          service: 'azure-devops',
          message: 'Connection refused',
        }),
      ) as never,
    )
    vi.mocked(createAzureMcpClient).mockReturnValue(fakeMcp)

    const result = await generateStandup(makeInput(), baseConfig)

    // Fallback: standup still generated with git data only
    expect(result.status).toBe('ok')
    expect(generateText).toHaveBeenCalled()
  })

  it('generates standup with git data only when enrichGitActivity fails (fallback)', async () => {
    const { createAzureMcpClient, enrichGitActivity, generateStandup } =
      await setup()
    const { generateText } = await import('ai')

    const fakeMcp = makeFakeMcpClient()
    vi.mocked(createAzureMcpClient).mockReturnValue(fakeMcp)
    vi.mocked(enrichGitActivity).mockResolvedValue(
      Result.err(
        new ExternalServiceError({
          service: 'git',
          message: 'No commits found',
        }),
      ) as never,
    )

    const result = await generateStandup(makeInput(), baseConfig)

    // Fallback: standup still generated with git data only
    expect(result.status).toBe('ok')
    expect(generateText).toHaveBeenCalled()
    expect(fakeMcp.disconnect).toHaveBeenCalled()
  })

  it('disconnects MCP client even when enrichment throws unexpectedly', async () => {
    const { createAzureMcpClient, enrichGitActivity, generateStandup } =
      await setup()

    const fakeMcp = makeFakeMcpClient()
    vi.mocked(createAzureMcpClient).mockReturnValue(fakeMcp)
    vi.mocked(enrichGitActivity).mockRejectedValueOnce(
      new Error('Unexpected error'),
    )

    const result = await generateStandup(makeInput(), baseConfig)

    // disconnect must have been called even on unexpected error
    expect(fakeMcp.disconnect).toHaveBeenCalled()
    // fallback activated — result is still ok
    expect(result.status).toBe('ok')
  })

  it('returns Result.err when no auth is configured', async () => {
    const { generateStandup } = await setup()

    const result = await generateStandup(makeInput(), {
      azure: baseConfig.azure,
      // no aiProviderApiKey
    })

    expect(result.status).toBe('error')
    if (result.isErr()) {
      expect(result.error.message).toContain('No authentication configured')
    }
  })

  it('returns Result.err when LLM throws on all retry attempts', async () => {
    const { createAzureMcpClient, enrichGitActivity, generateStandup } =
      await setup()
    const { generateText } = await import('ai')

    const fakeMcp = makeFakeMcpClient()
    vi.mocked(createAzureMcpClient).mockReturnValue(fakeMcp)
    vi.mocked(enrichGitActivity).mockResolvedValue(
      Result.ok(fakeEnrichedActivity) as never,
    )
    // All 3 LLM attempts fail
    vi.mocked(generateText)
      .mockRejectedValueOnce(new Error('API rate limit exceeded'))
      .mockRejectedValueOnce(new Error('API rate limit exceeded'))
      .mockRejectedValueOnce(new Error('API rate limit exceeded'))

    const result = await generateStandup(makeInput(), baseConfig)

    expect(result.status).toBe('error')
    expect(generateText).toHaveBeenCalledTimes(3)
    if (result.isErr()) {
      expect(result.error.message).toContain('rate limit')
    }
  })

  it('succeeds when LLM recovers on a retry attempt', async () => {
    const { createAzureMcpClient, enrichGitActivity, generateStandup } =
      await setup()
    const { generateText } = await import('ai')

    const fakeMcp = makeFakeMcpClient()
    vi.mocked(createAzureMcpClient).mockReturnValue(fakeMcp)
    vi.mocked(enrichGitActivity).mockResolvedValue(
      Result.ok(fakeEnrichedActivity) as never,
    )

    const successResponse = {
      output: {
        content:
          '**Standup (04/03/2026)**\n\n**📌 agrotrace-web**\n\n**✅ Done:**\n➜ #1234 - Corrigir bug X\n',
        summary: 'Corrigi bug X no agrotrace-web',
      },
    } as never

    // First LLM call fails, second succeeds
    vi.mocked(generateText)
      .mockRejectedValueOnce(new Error('Transient LLM error'))
      .mockResolvedValue(successResponse)

    const result = await generateStandup(makeInput(), baseConfig)

    expect(result.status).toBe('ok')
    expect(generateText).toHaveBeenCalledTimes(2)
  })

  it('retries enrichment and succeeds on second attempt', async () => {
    const { createAzureMcpClient, enrichGitActivity, generateStandup } =
      await setup()
    const { generateText } = await import('ai')

    const fakeMcpFail = makeFakeMcpClient()
    const fakeMcpOk = makeFakeMcpClient()

    // First MCP client: connect fails → triggers retry with new client
    vi.mocked(fakeMcpFail.connect).mockResolvedValue(
      Result.err(
        new ExternalServiceError({
          service: 'azure-devops',
          message: 'Timeout on first attempt',
        }),
      ) as never,
    )

    // Second MCP client: succeeds
    vi.mocked(enrichGitActivity).mockResolvedValue(
      Result.ok(fakeEnrichedActivity) as never,
    )

    // Return different clients on successive calls
    vi.mocked(createAzureMcpClient)
      .mockReturnValueOnce(fakeMcpFail)
      .mockReturnValueOnce(fakeMcpOk)

    const result = await generateStandup(makeInput(), baseConfig)

    expect(result.status).toBe('ok')
    // Two MCP clients were created (one per attempt)
    expect(createAzureMcpClient).toHaveBeenCalledTimes(2)
    expect(generateText).toHaveBeenCalled()
  })

  it('activates fallback after all enrichment retries exhausted', async () => {
    const { createAzureMcpClient, generateStandup } = await setup()
    const { generateText } = await import('ai')

    // Both MCP clients fail to connect
    const makeFailing = () => {
      const mcp = makeFakeMcpClient()
      vi.mocked(mcp.connect).mockResolvedValue(
        Result.err(
          new ExternalServiceError({
            service: 'azure-devops',
            message: 'Connection refused',
          }),
        ) as never,
      )
      return mcp
    }

    vi.mocked(createAzureMcpClient)
      .mockReturnValueOnce(makeFailing())
      .mockReturnValueOnce(makeFailing())

    const result = await generateStandup(makeInput(), baseConfig)

    // Fallback activated: standup generated with git data only
    expect(result.status).toBe('ok')
    expect(createAzureMcpClient).toHaveBeenCalledTimes(2)
    expect(generateText).toHaveBeenCalled()
  })
})
