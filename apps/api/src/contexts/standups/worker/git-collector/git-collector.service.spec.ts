import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  runGitCommand: vi.fn(),
  ensureAllCloned: vi.fn(),
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
      AZURE_DEVOPS_DEFAULT_PROJECT: 'AGROTRACE',
    },
  }
  const repoCloneService = {
    ensureAllCloned: mocks.ensureAllCloned.mockResolvedValue({
      cloned: [],
      alreadyExisted: [],
      failed: [],
    }),
  }

  return {
    logger,
    service: new GitCollectorService(
      loggerFactory as never,
      runtimeConfig as never,
      repoCloneService as never,
    ),
  }
}

function getInternals(service: GitCollectorService) {
  return service as unknown as {
    fetchRepository(repositoryPath: string): Promise<GitCommandResult>
    buildAzureDevopsHttpRemoteUrl(remoteUrl: string): string | null
    buildAzureDevopsAuthHeader(pat: string): string
    extractBranchCardNumber(branch: string): string | null
    extractCardNumbers(text: string): string[]
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

  describe('extractBranchCardNumber', () => {
    it.each([
      // prefix/NNNNN-description (standard convention)
      ['feat/11748-dashboard-gestao', '11748'],
      ['fix/11496-alter-date-format', '11496'],
      ['feature/11268-habilitar-pacote', '11268'],
      ['hotfix/12345', '12345'],
      ['task/999-small-fix', '999'],
      ['refactor/1234567', '1234567'],
      ['chore/4567-cleanup', '4567'],

      // bugfix prefix (must work explicitly, not by accident)
      ['bugfix/11238-fix-evento-timezone', '11238'],

      // bare NNNNN/description (CHECKMILK repos convention)
      ['10461/Rota_historico_animal', '10461'],
      ['10780/Adicionar_deslocamento_atendimento_tables', '10780'],
      ['11075/Adicionar_notificacao_parto_app', '11075'],
      ['11413/Dashboard_gestor_watch_app', '11413'],
      ['11414/Login_watch', '11414'],
    ])('extracts card number from "%s" → %s', (branch, expected) => {
      const { service } = createService()
      const internals = getInternals(service)

      expect(internals.extractBranchCardNumber(branch)).toBe(expected)
    })

    it.each([
      // excluded branches
      ['master'],
      ['main'],
      ['dev'],
      ['develop'],
      ['sprint/93'],
      ['sprint/94'],

      // no card number
      ['feat/desktop-app'],
      ['chore/migrate-to-turbo-monorepo'],

      // empty/null
      [''],
    ])('returns null for "%s"', (branch) => {
      const { service } = createService()
      const internals = getInternals(service)

      expect(internals.extractBranchCardNumber(branch)).toBeNull()
    })
  })

  describe('extractCardNumbers', () => {
    it('extracts #NNNNN references from commit text', () => {
      const { service } = createService()
      const internals = getInternals(service)

      expect(
        internals.extractCardNumbers('feat: dashboard #11748 and #11496'),
      ).toEqual(['11748', '11496'])
    })

    it('deduplicates repeated card numbers', () => {
      const { service } = createService()
      const internals = getInternals(service)

      expect(internals.extractCardNumbers('#11748 fix #11748 again')).toEqual([
        '11748',
      ])
    })

    it('returns empty array when no card numbers found', () => {
      const { service } = createService()
      const internals = getInternals(service)

      expect(
        internals.extractCardNumbers('chore: update dependencies'),
      ).toEqual([])
    })

    it('matches AB#NNNNN (Azure DevOps format)', () => {
      const { service } = createService()
      const internals = getInternals(service)

      expect(
        internals.extractCardNumbers('AB#11075 - Adicionar notificacao'),
      ).toEqual(['11075'])
    })
  })

  describe('collect - repo clone fallback', () => {
    it('calls ensureAllCloned before collecting commits', async () => {
      mocks.ensureAllCloned.mockResolvedValue({
        cloned: [],
        alreadyExisted: [{ project: 'AGROTRACE', name: 'my-repo' }],
        failed: [],
      })
      mocks.runGitCommand.mockResolvedValue(
        createGitCommandResult({ stdout: 'main' }),
      )

      const { service } = createService()
      await service.collect(
        ['AGROTRACE/my-repo'],
        'author@test.com',
        '8 hours ago',
      )

      expect(mocks.ensureAllCloned).toHaveBeenCalledWith([
        { project: 'AGROTRACE', name: 'my-repo' },
      ])
    })

    it('skips failed repos from collect', async () => {
      mocks.ensureAllCloned.mockResolvedValue({
        cloned: [],
        alreadyExisted: [],
        failed: [
          {
            repo: { project: 'AGROTRACE', name: 'bad-repo' },
            error: { repo: 'bad-repo', message: 'clone failed' },
          },
        ],
      })

      const { service, logger } = createService()
      const result = await service.collect(
        ['AGROTRACE/bad-repo'],
        'author@test.com',
        '8 hours ago',
      )

      expect(result.isOk()).toBe(true)
      if (result.isOk()) {
        expect(result.value.repos).toHaveLength(0)
      }
      expect(logger.warn).toHaveBeenCalled()
    })
  })
})
