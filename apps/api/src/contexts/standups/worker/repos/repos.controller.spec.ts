import { Controller, Inject } from '@nestjs/common'
import { describe, expect, it, vi } from 'vitest'
import { ExternalServiceError, Result } from '../../../../shared/domain'
import { createControllerHttpTestApp } from '../../../../test/http/create-controller-http-test-app'
import { ListWorkerReposService } from './list-worker-repos.service'
import { ReposController } from './repos.controller'

@Controller('repos')
class TestReposController extends ReposController {
  constructor(
    @Inject(ListWorkerReposService) listWorkerRepos: ListWorkerReposService,
  ) {
    super(listWorkerRepos)
  }
}

describe('ReposController', () => {
  it('returns 503 when repo listing fails', async () => {
    const listRepos = vi.fn().mockResolvedValue(
      Result.err(
        new ExternalServiceError({
          service: 'azure-devops',
          message: 'failed',
        }),
      ),
    )
    const testApp = await createControllerHttpTestApp({
      controllers: [TestReposController],
      providers: [
        {
          provide: ListWorkerReposService,
          useValue: { listRepos },
        },
      ],
    })

    try {
      const response = await testApp.request.get('/repos')

      expect(response.status).toBe(503)
      expect(response.body.message).toBe('failed')
    } finally {
      await testApp.close()
    }
  })

  it('returns the repos payload on success', async () => {
    const listRepos = vi
      .fn()
      .mockResolvedValue(
        Result.ok([{ id: 'repo-1', name: 'repo-a', project: 'proj' }]),
      )
    const testApp = await createControllerHttpTestApp({
      controllers: [TestReposController],
      providers: [
        {
          provide: ListWorkerReposService,
          useValue: { listRepos },
        },
      ],
    })

    try {
      const response = await testApp.request.get('/repos')

      expect(response.status).toBe(200)
      expect(response.body).toEqual({
        data: [{ id: 'repo-1', name: 'repo-a', project: 'proj' }],
      })
    } finally {
      await testApp.close()
    }
  })
})
