import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  runGitCommand: vi.fn(),
}))

vi.mock('./run-git-command', () => ({
  runGitCommand: mocks.runGitCommand,
}))

import { GitCollectorService } from './git-collector.service'

type GitCommandResult = {
  exitCode: number
  stderr: Buffer
  stdout: Buffer
}

function createGitCommandResult(
  result: Partial<{ exitCode: number; stderr: string; stdout: string }> = {},
): GitCommandResult {
  return {
    exitCode: result.exitCode ?? 0,
    stderr: Buffer.from(result.stderr ?? ''),
    stdout: Buffer.from(result.stdout ?? ''),
  }
}

function createService(pat = 'pat-token') {
  const logger = {
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  }
  const loggerFactory = {
    create: vi.fn().mockReturnValue(logger),
  }
  const runtimeConfig = {
    config: {
      REPOS_ROOT_PATH: '/repos',
      AZURE_DEVOPS_PAT: pat,
    },
  }

  return {
    logger,
    service: new GitCollectorService(
      loggerFactory as never,
      runtimeConfig as never,
    ),
  }
}

function getInternals(service: GitCollectorService) {
  return service as unknown as {
    fetchRepository(repositoryPath: string): Promise<GitCommandResult>
    buildAzureDevopsHttpRemoteUrl(remoteUrl: string): string | null
    buildAzureDevopsAuthHeader(pat: string): string
  }
}

describe('GitCollectorService', () => {
  beforeEach(() => {
    mocks.runGitCommand.mockReset()
  })

  it('converts Azure DevOps scp-like SSH remotes to HTTPS', () => {
    const { service } = createService()
    const internals = getInternals(service)

    expect(
      internals.buildAzureDevopsHttpRemoteUrl(
        'git@ssh.dev.azure.com:v3/org/project/repo',
      ),
    ).toBe('https://dev.azure.com/org/project/_git/repo')
  })

  it('converts Azure DevOps ssh:// remotes to HTTPS', () => {
    const { service } = createService()
    const internals = getInternals(service)

    expect(
      internals.buildAzureDevopsHttpRemoteUrl(
        'ssh://git@ssh.dev.azure.com/v3/org/project/repo',
      ),
    ).toBe('https://dev.azure.com/org/project/_git/repo')
  })

  it('normalizes Azure DevOps HTTPS remotes by removing inline credentials', () => {
    const { service } = createService()
    const internals = getInternals(service)

    expect(
      internals.buildAzureDevopsHttpRemoteUrl(
        'https://org@dev.azure.com/org/project/_git/repo',
      ),
    ).toBe('https://dev.azure.com/org/project/_git/repo')
  })

  it('returns null for non-Azure remotes', () => {
    const { service } = createService()
    const internals = getInternals(service)

    expect(
      internals.buildAzureDevopsHttpRemoteUrl(
        'git@github.com:example/repo.git',
      ),
    ).toBeNull()
  })

  it('builds a Basic auth header from the PAT', () => {
    const { service } = createService()
    const internals = getInternals(service)

    expect(internals.buildAzureDevopsAuthHeader('pat-token')).toBe(
      'AUTHORIZATION: Basic OnBhdC10b2tlbg==',
    )
  })

  it('fetches Azure DevOps remotes through the explicit HTTPS URL', async () => {
    const { service } = createService()
    const internals = getInternals(service)
    mocks.runGitCommand
      .mockResolvedValueOnce(
        createGitCommandResult({
          stdout: 'git@ssh.dev.azure.com:v3/org/project/repo\n',
        }),
      )
      .mockResolvedValueOnce(
        createGitCommandResult({
          stdout: '+refs/heads/*:refs/remotes/origin/*\n',
        }),
      )
      .mockResolvedValueOnce(createGitCommandResult())

    await internals.fetchRepository('/repos/repo')

    expect(mocks.runGitCommand).toHaveBeenNthCalledWith(1, [
      '-C',
      '/repos/repo',
      'remote',
      'get-url',
      'origin',
    ])
    expect(mocks.runGitCommand).toHaveBeenNthCalledWith(2, [
      '-C',
      '/repos/repo',
      'config',
      '--get-all',
      'remote.origin.fetch',
    ])

    const fetchArgs = mocks.runGitCommand.mock.calls[2]?.[0]
    const fetchOptions = mocks.runGitCommand.mock.calls[2]?.[1]

    expect(fetchArgs).toEqual([
      '-c',
      'credential.helper=',
      '-c',
      'core.askPass=echo',
      '-c',
      'http.extraheader=AUTHORIZATION: Basic OnBhdC10b2tlbg==',
      '-C',
      '/repos/repo',
      'fetch',
      '--quiet',
      'https://dev.azure.com/org/project/_git/repo',
      '+refs/heads/*:refs/remotes/origin/*',
    ])
    expect(fetchArgs).not.toContain('origin')
    expect(fetchArgs).not.toContain(
      'remote.origin.url=https://dev.azure.com/org/project/_git/repo',
    )
    expect(fetchOptions).toEqual({
      env: expect.objectContaining({
        GIT_TERMINAL_PROMPT: '0',
      }),
    })
  })

  it('preserves custom origin refspecs when fetching over HTTPS', async () => {
    const { service } = createService()
    const internals = getInternals(service)
    mocks.runGitCommand
      .mockResolvedValueOnce(
        createGitCommandResult({
          stdout: 'git@ssh.dev.azure.com:v3/org/project/repo\n',
        }),
      )
      .mockResolvedValueOnce(
        createGitCommandResult({
          stdout: [
            '+refs/heads/main:refs/remotes/origin/main',
            '+refs/heads/release/*:refs/remotes/origin/release/*',
          ].join('\n'),
        }),
      )
      .mockResolvedValueOnce(createGitCommandResult())

    await internals.fetchRepository('/repos/repo')

    const fetchArgs = mocks.runGitCommand.mock.calls[2]?.[0]
    expect(fetchArgs).toEqual([
      '-c',
      'credential.helper=',
      '-c',
      'core.askPass=echo',
      '-c',
      'http.extraheader=AUTHORIZATION: Basic OnBhdC10b2tlbg==',
      '-C',
      '/repos/repo',
      'fetch',
      '--quiet',
      'https://dev.azure.com/org/project/_git/repo',
      '+refs/heads/main:refs/remotes/origin/main',
      '+refs/heads/release/*:refs/remotes/origin/release/*',
    ])
  })

  it('falls back to the default origin refspec when none is configured', async () => {
    const { service } = createService()
    const internals = getInternals(service)
    mocks.runGitCommand
      .mockResolvedValueOnce(
        createGitCommandResult({
          stdout: 'git@ssh.dev.azure.com:v3/org/project/repo\n',
        }),
      )
      .mockResolvedValueOnce(
        createGitCommandResult({
          exitCode: 1,
          stderr: 'missing remote.origin.fetch',
        }),
      )
      .mockResolvedValueOnce(createGitCommandResult())

    await internals.fetchRepository('/repos/repo')

    expect(mocks.runGitCommand.mock.calls[2]?.[0]).toEqual([
      '-c',
      'credential.helper=',
      '-c',
      'core.askPass=echo',
      '-c',
      'http.extraheader=AUTHORIZATION: Basic OnBhdC10b2tlbg==',
      '-C',
      '/repos/repo',
      'fetch',
      '--quiet',
      'https://dev.azure.com/org/project/_git/repo',
      '+refs/heads/*:refs/remotes/origin/*',
    ])
  })

  it('returns a configuration error when the Azure DevOps PAT is missing', async () => {
    const { service } = createService('')
    const internals = getInternals(service)
    mocks.runGitCommand.mockResolvedValueOnce(
      createGitCommandResult({
        stdout: 'git@ssh.dev.azure.com:v3/org/project/repo\n',
      }),
    )

    const result = await internals.fetchRepository('/repos/repo')

    expect(result.exitCode).toBe(1)
    expect(result.stderr.toString()).toBe('AZURE_DEVOPS_PAT not configured')
    expect(mocks.runGitCommand).toHaveBeenCalledTimes(1)
  })

  it('returns an explicit error for unsupported remotes', async () => {
    const { service } = createService()
    const internals = getInternals(service)
    mocks.runGitCommand.mockResolvedValueOnce(
      createGitCommandResult({
        stdout: 'git@github.com:example/repo.git\n',
      }),
    )

    const result = await internals.fetchRepository('/repos/repo')

    expect(result.exitCode).toBe(1)
    expect(result.stderr.toString()).toBe(
      'Unsupported git remote for PAT fetch: git@github.com:example/repo.git',
    )
    expect(mocks.runGitCommand).toHaveBeenCalledTimes(1)
  })
})
