import { describe, expect, it, vi } from 'vitest'
import { GitCollectorService } from './git-collector.service'

function createService() {
  const loggerFactory = {
    create: vi.fn().mockReturnValue({
      warn: vi.fn(),
      info: vi.fn(),
      debug: vi.fn(),
      error: vi.fn(),
    }),
  }
  const runtimeConfig = {
    config: {
      REPOS_ROOT_PATH: '/repos',
      AZURE_DEVOPS_PAT: 'pat-token',
    },
  }

  return new GitCollectorService(loggerFactory as never, runtimeConfig as never)
}

function getInternals(service: GitCollectorService) {
  return service as unknown as {
    buildAzureDevopsHttpRemoteUrl(remoteUrl: string): string | null
    buildAzureDevopsAuthHeader(pat: string): string
  }
}

describe('GitCollectorService', () => {
  it('converts Azure DevOps scp-like SSH remotes to HTTPS', () => {
    const service = createService()
    const internals = getInternals(service)

    expect(
      internals.buildAzureDevopsHttpRemoteUrl(
        'git@ssh.dev.azure.com:v3/org/project/repo',
      ),
    ).toBe('https://dev.azure.com/org/project/_git/repo')
  })

  it('converts Azure DevOps ssh:// remotes to HTTPS', () => {
    const service = createService()
    const internals = getInternals(service)

    expect(
      internals.buildAzureDevopsHttpRemoteUrl(
        'ssh://git@ssh.dev.azure.com/v3/org/project/repo',
      ),
    ).toBe('https://dev.azure.com/org/project/_git/repo')
  })

  it('normalizes Azure DevOps HTTPS remotes by removing inline credentials', () => {
    const service = createService()
    const internals = getInternals(service)

    expect(
      internals.buildAzureDevopsHttpRemoteUrl(
        'https://org@dev.azure.com/org/project/_git/repo',
      ),
    ).toBe('https://dev.azure.com/org/project/_git/repo')
  })

  it('returns null for non-Azure remotes', () => {
    const service = createService()
    const internals = getInternals(service)

    expect(
      internals.buildAzureDevopsHttpRemoteUrl(
        'git@github.com:example/repo.git',
      ),
    ).toBeNull()
  })

  it('builds a Basic auth header from the PAT', () => {
    const service = createService()
    const internals = getInternals(service)

    expect(internals.buildAzureDevopsAuthHeader('pat-token')).toBe(
      'AUTHORIZATION: Basic OnBhdC10b2tlbg==',
    )
  })
})
