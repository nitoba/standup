import { access, mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { Injectable } from '@nestjs/common'
import { AppLoggerFactory } from '../../../../platform/logger'
import { RepoCloneError, Result } from '../../../../shared/domain'
import type { ParsedRepo } from '../../../../shared/repos/parse-selected-repos'
import { WorkerRuntimeConfigService } from '../worker-runtime-config.service'
import { buildAuthHeader, buildCloneUrl } from './azure-devops-git-auth'
import { runGitCommand } from './run-git-command'

export interface CloneResult {
  cloned: ParsedRepo[]
  alreadyExisted: ParsedRepo[]
  failed: Array<{ repo: ParsedRepo; error: RepoCloneError }>
}

@Injectable()
export class RepoCloneService {
  private readonly logger: ReturnType<AppLoggerFactory['create']>
  private readonly inFlightClones = new Map<
    string,
    Promise<Result<void, RepoCloneError>>
  >()

  constructor(
    private readonly loggerFactory: AppLoggerFactory,
    private readonly runtimeConfig: WorkerRuntimeConfigService,
  ) {
    this.logger = this.loggerFactory.create('repo-clone')
  }

  async ensureCloned(repo: ParsedRepo): Promise<Result<void, RepoCloneError>> {
    const key = `${repo.project}/${repo.name}`
    const existing = this.inFlightClones.get(key)
    if (existing) return existing

    const promise = this.doClone(repo).finally(() =>
      this.inFlightClones.delete(key),
    )
    this.inFlightClones.set(key, promise)
    return promise
  }

  async ensureAllCloned(repos: ParsedRepo[]): Promise<CloneResult> {
    const result: CloneResult = {
      cloned: [],
      alreadyExisted: [],
      failed: [],
    }

    for (const repo of repos) {
      const repoPath = join(
        this.runtimeConfig.config.REPOS_ROOT_PATH,
        repo.name,
      )
      const existedBefore =
        (await this.directoryExists(repoPath)) &&
        (await this.isValidGitRepo(repoPath))

      const cloneResult = await this.ensureCloned(repo)

      if (cloneResult.isErr()) {
        result.failed.push({ repo, error: cloneResult.error })
      } else if (existedBefore) {
        result.alreadyExisted.push(repo)
      } else {
        result.cloned.push(repo)
      }
    }

    return result
  }

  private async doClone(
    repo: ParsedRepo,
  ): Promise<Result<void, RepoCloneError>> {
    const { REPOS_ROOT_PATH, AZURE_DEVOPS_PAT, AZURE_DEVOPS_ORG } =
      this.runtimeConfig.config
    const targetPath = join(REPOS_ROOT_PATH, repo.name)

    if (!AZURE_DEVOPS_ORG) {
      return Result.err(
        new RepoCloneError({
          repo: repo.name,
          message: 'AZURE_DEVOPS_ORG not configured — cannot build clone URL',
        }),
      )
    }

    const dirExists = await this.directoryExists(targetPath)

    if (dirExists) {
      const valid = await this.isValidGitRepo(targetPath)
      if (valid) {
        this.logger.debug(`Repo already exists: ${repo.name}`)
        return Result.ok(undefined)
      }

      this.logger.warn(
        `Directory exists but is not a valid git repo: ${targetPath} — removing`,
      )
      await rm(targetPath, { recursive: true, force: true })
    }

    await mkdir(REPOS_ROOT_PATH, { recursive: true })

    const url = buildCloneUrl(AZURE_DEVOPS_ORG, repo.project, repo.name)
    const authHeader = buildAuthHeader(AZURE_DEVOPS_PAT)

    const cloneResult = await runGitCommand(
      [
        '-c',
        'credential.helper=',
        '-c',
        'core.askPass=echo',
        '-c',
        `http.extraheader=${authHeader}`,
        'clone',
        '--quiet',
        url,
        targetPath,
      ],
      { env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } },
    )

    if (cloneResult.exitCode !== 0) {
      const stderr = cloneResult.stderr.toString('utf-8').trim()
      this.logger.warn(`Failed to clone ${repo.name}: ${stderr}`)
      return Result.err(
        new RepoCloneError({
          repo: repo.name,
          message: `git clone failed (exit ${cloneResult.exitCode}): ${stderr}`,
        }),
      )
    }

    this.logger.info(`Cloned repo: ${repo.name} -> ${targetPath}`)
    return Result.ok(undefined)
  }

  private async directoryExists(path: string): Promise<boolean> {
    try {
      await access(path)
      return true
    } catch {
      return false
    }
  }

  private async isValidGitRepo(path: string): Promise<boolean> {
    const result = await runGitCommand([
      '-C',
      path,
      'rev-parse',
      '--is-inside-work-tree',
    ])
    return result.exitCode === 0
  }
}
