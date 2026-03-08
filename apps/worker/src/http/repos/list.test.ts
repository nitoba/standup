import type { AzureMcpClient } from '@standup/azure-devops'
import { ExternalServiceError, Result } from '@standup/domain'
import { Hono } from 'hono'
import { describe, expect, it, vi } from 'vitest'
import { internalAuthMiddleware } from '../middleware/auth.js'
import { handleListRepos } from './list.js'

const SECRET = 'test-secret'

const fakeReposAgrotrace = [
  { id: 'repo-1', name: 'agrotrace-web', project: 'AGROTRACE' },
  { id: 'repo-2', name: 'agrotrace-api', project: 'AGROTRACE' },
]
const fakeReposCheckmilk = [
  { id: 'repo-3', name: 'checkmilk-mobile', project: 'CHECKMILK' },
]

function makeApp(mcpClient: AzureMcpClient) {
  const app = new Hono()
  app.use('/internal/*', internalAuthMiddleware(SECRET))
  app.get('/internal/repos/list', (c) =>
    handleListRepos(c, {
      mcpClient,
      projects: ['AGROTRACE', 'CHECKMILK'],
    }),
  )
  return app
}

describe('handleListRepos', () => {
  it('returns 401 without auth header', async () => {
    const mcpClient = {
      listRepositories: vi.fn().mockResolvedValue(Result.ok([])),
    } as unknown as AzureMcpClient
    const app = makeApp(mcpClient)
    const res = await app.request('/internal/repos/list')
    expect(res.status).toBe(401)
  })

  it('returns merged repos from all projects', async () => {
    const listRepositories = vi
      .fn()
      .mockImplementation(async (project: string) => {
        if (project === 'AGROTRACE') return Result.ok(fakeReposAgrotrace)
        if (project === 'CHECKMILK') return Result.ok(fakeReposCheckmilk)
        return Result.ok([])
      })
    const mcpClient = { listRepositories } as unknown as AzureMcpClient
    const app = makeApp(mcpClient)
    const res = await app.request('/internal/repos/list', {
      headers: { 'x-internal-secret': SECRET },
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { repos: unknown[] }
    expect(body.repos).toHaveLength(3)
    expect(body.repos).toEqual([...fakeReposAgrotrace, ...fakeReposCheckmilk])
  })

  it('skips a project that fails and returns the rest', async () => {
    const listRepositories = vi
      .fn()
      .mockImplementation(async (project: string) => {
        if (project === 'AGROTRACE') return Result.ok(fakeReposAgrotrace)
        return Result.err(
          new ExternalServiceError({
            service: 'azure-devops',
            message: 'Project not found',
          }),
        )
      })
    const mcpClient = { listRepositories } as unknown as AzureMcpClient
    const app = makeApp(mcpClient)
    const res = await app.request('/internal/repos/list', {
      headers: { 'x-internal-secret': SECRET },
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { repos: unknown[] }
    expect(body.repos).toHaveLength(2)
    expect(body.repos).toEqual(fakeReposAgrotrace)
  })
})
