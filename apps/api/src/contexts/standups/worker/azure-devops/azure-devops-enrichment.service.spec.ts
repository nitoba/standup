import { describe, expect, it, vi } from 'vitest'
import type {
  GatheredGitActivity,
  RepoActivity,
} from '../../../../shared/domain'
import { Result } from '../../../../shared/domain'
import { AzureDevopsEnrichmentService } from './azure-devops-enrichment.service'

function makeLoggerFactory() {
  return {
    create: vi.fn(() => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      child: vi.fn(),
    })),
  }
}

function makeActivity(
  repos: Partial<RepoActivity>[] = [],
): GatheredGitActivity {
  return {
    timestamp: '2026-03-17T17:00:00Z',
    repos: repos.map((r) => ({
      repoName: r.repoName ?? 'repo-a',
      repoPath: r.repoPath ?? '/repos/repo-a',
      commits: r.commits ?? [
        {
          hash: 'abc',
          subject: 'feat: x',
          body: '',
          sourceBranch: 'main',
          filesChanged: 1,
          insertions: 1,
          deletions: 0,
          files: ['a.ts'],
        },
      ],
      cardNumbers: r.cardNumbers ?? ['123'],
    })),
  }
}

describe('AzureDevopsEnrichmentService', () => {
  function createService(mcpOverrides: Record<string, unknown> = {}) {
    const mcpClient = {
      getMe: vi.fn(),
      getWorkItem: vi.fn().mockResolvedValue(
        Result.ok({
          id: '123',
          title: 'Task',
          state: 'Active',
          assignedTo: 'user',
        }),
      ),
      listPullRequests: vi.fn().mockResolvedValue(
        Result.ok([
          {
            id: 1,
            title: 'PR 1',
            status: 'active',
            repoId: 'repo-a',
            creatorId: 'uuid-match',
          },
          {
            id: 2,
            title: 'PR 2',
            status: 'active',
            repoId: 'repo-a',
            creatorId: 'uuid-other',
          },
        ]),
      ),
      ...mcpOverrides,
    }
    const service = new AzureDevopsEnrichmentService(
      makeLoggerFactory() as never,
      mcpClient as never,
    )
    return { service, mcpClient }
  }

  it('should not call getMe when azureDevopsUuid is provided', async () => {
    const { service, mcpClient } = createService()

    await service.enrichGitActivity(makeActivity([{}]), 'uuid-match')

    expect(mcpClient.getMe).not.toHaveBeenCalled()
  })

  it('should filter PRs by the provided azureDevopsUuid', async () => {
    const { service } = createService()

    const result = await service.enrichGitActivity(
      makeActivity([{}]),
      'uuid-match',
    )

    expect(result.isOk()).toBe(true)
    if (result.isOk()) {
      const prs = result.value.repos[0].enrichedItems[0].pullRequests
      expect(prs).toHaveLength(1)
      expect(prs[0].creatorId).toBe('uuid-match')
    }
  })

  it('should include all PRs when azureDevopsUuid is not provided', async () => {
    const { service } = createService()

    const result = await service.enrichGitActivity(makeActivity([{}]))

    expect(result.isOk()).toBe(true)
    if (result.isOk()) {
      const prs = result.value.repos[0].enrichedItems[0].pullRequests
      expect(prs).toHaveLength(2)
    }
  })

  it('should set userUuid from the provided parameter', async () => {
    const { service } = createService()

    const result = await service.enrichGitActivity(
      makeActivity([{}]),
      'my-uuid',
    )

    expect(result.isOk()).toBe(true)
    if (result.isOk()) {
      expect(result.value.userUuid).toBe('my-uuid')
    }
  })

  it('should set userUuid to unknown when parameter is absent', async () => {
    const { service } = createService()

    const result = await service.enrichGitActivity(makeActivity([{}]))

    expect(result.isOk()).toBe(true)
    if (result.isOk()) {
      expect(result.value.userUuid).toBe('unknown')
    }
  })

  it('should return error when no repos have commits', async () => {
    const { service } = createService()
    const emptyActivity: GatheredGitActivity = {
      timestamp: '2026-03-17T17:00:00Z',
      repos: [
        {
          repoName: 'repo-a',
          repoPath: '/repos/repo-a',
          commits: [],
          cardNumbers: [],
        },
      ],
    }

    const result = await service.enrichGitActivity(emptyActivity, 'uuid')

    expect(result.isErr()).toBe(true)
  })
})
