import { describe, expect, it, vi } from 'vitest'
import { ExternalServiceError, Result } from '../../../../shared/domain'
import { ListWorkerReposService } from './list-worker-repos.service'

describe('ListWorkerReposService', () => {
  it('handles repo requests from the event bus', async () => {
    const service = new ListWorkerReposService(
      {
        config: {
          AZURE_DEVOPS_PROJECTS: ['AGROTRACE'],
        },
      } as never,
      {
        listRepositories: vi
          .fn()
          .mockResolvedValue(
            Result.ok([{ id: 'repo-1', name: 'repo-a', project: 'AGROTRACE' }]),
          ),
      } as never,
    )

    await expect(service.handleRequestedRepos({})).resolves.toEqual(
      Result.ok([{ id: 'repo-1', name: 'repo-a', project: 'AGROTRACE' }]),
    )
  })

  it('returns the repository listing result directly', async () => {
    const error = new ExternalServiceError({
      service: 'azure-devops',
      message: 'failed',
    })
    const listRepositories = vi.fn().mockResolvedValue(Result.err(error))
    const service = new ListWorkerReposService(
      {
        config: {
          AZURE_DEVOPS_PROJECTS: ['AGROTRACE'],
        },
      } as never,
      {
        listRepositories,
      } as never,
    )

    const result = await service.listRepos()

    expect(result.isErr()).toBe(true)
    if (result.isErr()) {
      expect(result.error).toBe(error)
    }
    expect(listRepositories).toHaveBeenCalledWith(['AGROTRACE'])
  })
})
