import { describe, expect, it, vi } from 'vitest'
import { ExternalServiceError, Result } from '../../../shared/domain'
import { ReposController } from './repos.controller'

describe('ReposController', () => {
  it('returns 503 when repo listing fails', async () => {
    const controller = new ReposController({
      listRepos: vi.fn().mockResolvedValue(
        Result.err(
          new ExternalServiceError({
            service: 'azure-devops',
            message: 'failed',
          }),
        ),
      ),
    } as never)

    await expect(controller.list()).rejects.toThrow('failed')
  })

  it('returns the repos payload on success', async () => {
    const controller = new ReposController({
      listRepos: vi
        .fn()
        .mockResolvedValue(
          Result.ok([{ id: 'repo-1', name: 'repo-a', project: 'proj' }]),
        ),
    } as never)

    await expect(controller.list()).resolves.toEqual({
      data: [{ id: 'repo-1', name: 'repo-a', project: 'proj' }],
    })
  })
})
