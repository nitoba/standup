import { describe, expect, it, vi } from 'vitest'
import type { SettingsReposChangedEvent } from '../../../../platform/events/standup-events'
import { RepoCloneListener } from './repo-clone.listener'

function createListener() {
  const ensureAllCloned = vi.fn().mockResolvedValue({
    cloned: [],
    alreadyExisted: [],
    failed: [],
  })
  const repoCloneService = { ensureAllCloned }
  const logger = {
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  }
  const loggerFactory = { create: vi.fn().mockReturnValue(logger) }
  const runtimeConfig = {
    config: { AZURE_DEVOPS_DEFAULT_PROJECT: 'AGROTRACE' },
  }

  return {
    listener: new RepoCloneListener(
      loggerFactory as never,
      repoCloneService as never,
      runtimeConfig as never,
    ),
    ensureAllCloned,
    logger,
  }
}

describe('RepoCloneListener', () => {
  it('calls ensureAllCloned with parsed repos from event', async () => {
    const { listener, ensureAllCloned } = createListener()
    const event: SettingsReposChangedEvent = {
      userId: 'user-1',
      selectedRepos: ['AGROTRACE/repo-a', 'OTHER/repo-b'],
    }

    await listener.handleReposChanged(event)

    expect(ensureAllCloned).toHaveBeenCalledWith([
      { project: 'AGROTRACE', name: 'repo-a' },
      { project: 'OTHER', name: 'repo-b' },
    ])
  })

  it('logs warning when clone fails but does not throw', async () => {
    const { listener, ensureAllCloned, logger } = createListener()
    ensureAllCloned.mockResolvedValue({
      cloned: [],
      alreadyExisted: [],
      failed: [
        {
          repo: { project: 'AGROTRACE', name: 'repo-a' },
          error: { repo: 'repo-a', message: 'clone failed' },
        },
      ],
    })
    const event: SettingsReposChangedEvent = {
      userId: 'user-1',
      selectedRepos: ['AGROTRACE/repo-a'],
    }

    await expect(listener.handleReposChanged(event)).resolves.not.toThrow()
    expect(logger.warn).toHaveBeenCalled()
  })

  it('does nothing for empty selectedRepos', async () => {
    const { listener, ensureAllCloned } = createListener()
    const event: SettingsReposChangedEvent = {
      userId: 'user-1',
      selectedRepos: [],
    }

    await listener.handleReposChanged(event)

    expect(ensureAllCloned).toHaveBeenCalledWith([])
  })
})
