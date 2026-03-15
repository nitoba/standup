import { describe, expect, it, vi } from 'vitest'
import { Result } from '../../../shared/domain'
import { DiscordAvailableReposService } from './discord-available-repos.service'

describe('DiscordAvailableReposService', () => {
  function makeLoggerFactory() {
    return {
      create: vi.fn(() => ({
        warn: vi.fn(),
      })),
    }
  }

  it('fetches available repos directly from the standups service', async () => {
    const listRepos = vi
      .fn()
      .mockResolvedValue(
        Result.ok([{ id: 'repo-1', name: 'repo-a', project: 'AGROTRACE' }]),
      )
    const service = new DiscordAvailableReposService(
      makeLoggerFactory() as never,
      { listRepos } as never,
    )

    await expect(service.fetchAvailableRepos()).resolves.toEqual([
      { id: 'repo-1', name: 'repo-a', project: 'AGROTRACE' },
    ])

    expect(listRepos).toHaveBeenCalledTimes(1)
  })
})
