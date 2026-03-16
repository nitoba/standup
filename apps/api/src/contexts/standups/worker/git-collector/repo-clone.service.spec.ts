import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  rm: vi.fn(),
  mkdir: vi.fn(),
  runGitCommand: vi.fn(),
}))

vi.mock('node:fs/promises', () => ({
  access: mocks.access,
  rm: mocks.rm,
  mkdir: mocks.mkdir,
}))

vi.mock('./run-git-command', () => ({
  runGitCommand: mocks.runGitCommand,
}))

import type { ParsedRepo } from '../../../../shared/repos/parse-selected-repos'
import { RepoCloneService } from './repo-clone.service'

function createService(
  overrides?: Partial<{ org: string; pat: string; reposRoot: string }>,
) {
  const logger = {
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  }
  const loggerFactory = { create: vi.fn().mockReturnValue(logger) }
  const runtimeConfig = {
    config: {
      REPOS_ROOT_PATH: overrides?.reposRoot ?? '/repos',
      AZURE_DEVOPS_PAT: overrides?.pat ?? 'test-pat',
      AZURE_DEVOPS_ORG: overrides?.org ?? 'test-org',
    },
  }

  return {
    logger,
    service: new RepoCloneService(
      loggerFactory as never,
      runtimeConfig as never,
    ),
  }
}

function gitOk(): { exitCode: number; stderr: Buffer; stdout: Buffer } {
  return { exitCode: 0, stderr: Buffer.from(''), stdout: Buffer.from('') }
}

function gitFail(stderr = 'fatal: repository not found'): {
  exitCode: number
  stderr: Buffer
  stdout: Buffer
} {
  return { exitCode: 128, stderr: Buffer.from(stderr), stdout: Buffer.from('') }
}

describe('RepoCloneService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.access.mockRejectedValue(new Error('ENOENT'))
    mocks.rm.mockResolvedValue(undefined)
    mocks.mkdir.mockResolvedValue(undefined)
    mocks.runGitCommand.mockResolvedValue(gitOk())
  })

  const repo: ParsedRepo = { project: 'AGROTRACE', name: 'my-repo' }

  describe('ensureCloned', () => {
    it('skips clone when directory exists and is valid git repo', async () => {
      mocks.access.mockResolvedValue(undefined)
      mocks.runGitCommand.mockResolvedValue(gitOk())

      const result = await createService().service.ensureCloned(repo)

      expect(result.isOk()).toBe(true)
      expect(mocks.runGitCommand).toHaveBeenCalledTimes(1)
      expect(mocks.runGitCommand.mock.calls[0]![0]).toContain('rev-parse')
    })

    it('removes and re-clones when directory exists but is not a valid git repo', async () => {
      mocks.access.mockResolvedValue(undefined)
      mocks.runGitCommand
        .mockResolvedValueOnce(gitFail('not a git repository'))
        .mockResolvedValueOnce(gitOk())

      const result = await createService().service.ensureCloned(repo)

      expect(result.isOk()).toBe(true)
      expect(mocks.rm).toHaveBeenCalledWith('/repos/my-repo', {
        recursive: true,
        force: true,
      })
      expect(mocks.runGitCommand).toHaveBeenCalledTimes(2)
    })

    it('clones repo when directory does not exist', async () => {
      const result = await createService().service.ensureCloned(repo)

      expect(result.isOk()).toBe(true)
      expect(mocks.mkdir).toHaveBeenCalledWith('/repos', { recursive: true })
      const cloneArgs = mocks.runGitCommand.mock.calls[0]![0] as string[]
      expect(cloneArgs).toContain('clone')
      expect(cloneArgs).toContain(
        'https://dev.azure.com/test-org/AGROTRACE/_git/my-repo',
      )
      expect(cloneArgs).toContain('/repos/my-repo')
    })

    it('passes correct auth header in clone command', async () => {
      await createService({ pat: 'my-pat' }).service.ensureCloned(repo)

      const cloneArgs = mocks.runGitCommand.mock.calls[0]![0] as string[]
      const headerArg = cloneArgs.find((a: string) =>
        a.includes('http.extraheader='),
      )
      const expectedBase64 = Buffer.from(':my-pat').toString('base64')
      expect(headerArg).toBe(
        `http.extraheader=AUTHORIZATION: Basic ${expectedBase64}`,
      )
    })

    it('returns RepoCloneError when clone fails', async () => {
      mocks.runGitCommand.mockResolvedValue(gitFail('repository not found'))

      const result = await createService().service.ensureCloned(repo)

      expect(result.isErr()).toBe(true)
      if (result.isErr()) {
        expect(result.error._tag).toBe('RepoCloneError')
        expect(result.error.repo).toBe('my-repo')
      }
    })

    it('returns RepoCloneError when AZURE_DEVOPS_ORG is empty', async () => {
      const result = await createService({ org: '' }).service.ensureCloned(repo)

      expect(result.isErr()).toBe(true)
      if (result.isErr()) {
        expect(result.error.message).toContain('AZURE_DEVOPS_ORG')
      }
    })

    it('deduplicates concurrent clones of the same repo', async () => {
      let resolveClone: () => void
      mocks.runGitCommand.mockReturnValue(
        new Promise((resolve) => {
          resolveClone = () => resolve(gitOk())
        }),
      )

      const { service } = createService()
      const promise1 = service.ensureCloned(repo)
      const promise2 = service.ensureCloned(repo)

      resolveClone!()
      const [result1, result2] = await Promise.all([promise1, promise2])

      expect(result1.isOk()).toBe(true)
      expect(result2.isOk()).toBe(true)
      expect(mocks.runGitCommand).toHaveBeenCalledTimes(1)
    })
  })

  describe('ensureAllCloned', () => {
    const repos: ParsedRepo[] = [
      { project: 'AGROTRACE', name: 'repo-a' },
      { project: 'AGROTRACE', name: 'repo-b' },
      { project: 'OTHER', name: 'repo-c' },
    ]

    it('returns summary with cloned and alreadyExisted', async () => {
      mocks.access
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('ENOENT'))
        .mockRejectedValueOnce(new Error('ENOENT'))
        .mockRejectedValueOnce(new Error('ENOENT'))
        .mockRejectedValueOnce(new Error('ENOENT'))

      mocks.runGitCommand
        .mockResolvedValueOnce(gitOk())
        .mockResolvedValueOnce(gitOk())
        .mockResolvedValueOnce(gitOk())
        .mockResolvedValueOnce(gitOk())

      const { service } = createService()
      const result = await service.ensureAllCloned(repos)

      expect(result.alreadyExisted).toHaveLength(1)
      expect(result.alreadyExisted[0]!.name).toBe('repo-a')
      expect(result.cloned).toHaveLength(2)
      expect(result.failed).toHaveLength(0)
    })

    it('continues processing after a clone failure', async () => {
      mocks.runGitCommand
        .mockResolvedValueOnce(gitOk())
        .mockResolvedValueOnce(gitFail())
        .mockResolvedValueOnce(gitOk())

      const { service } = createService()
      const result = await service.ensureAllCloned(repos)

      expect(result.cloned).toHaveLength(2)
      expect(result.failed).toHaveLength(1)
      expect(result.failed[0]!.repo.name).toBe('repo-b')
    })
  })
})
