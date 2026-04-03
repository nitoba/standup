import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { Injectable } from '@nestjs/common'
import { AppLoggerFactory } from '../../../../platform/logger'
import type {
  CommitInfo,
  GatheredGitActivity,
  RepoActivity,
} from '../../../../shared/domain'
import { ExternalServiceError, Result } from '../../../../shared/domain'
import { parseRepoIdentifier } from '../../../../shared/repos/parse-selected-repos'
import { WorkerRuntimeConfigService } from '../worker-runtime-config.service'
import { buildAuthHeader } from './azure-devops-git-auth'
import { RepoCloneService } from './repo-clone.service'
import { runGitCommand } from './run-git-command'

interface CommitBlock {
  hash: string
  subject: string
  body: string
  sourceRef: string
}

type GitCommandResult = Awaited<ReturnType<typeof runGitCommand>>
type RemoteTransport = 'https' | 'ssh' | 'unsupported'
type FetchFailureStage =
  | 'remote_discovery'
  | 'remote_unsupported'
  | 'credentials'
  | 'refspec_resolution'
  | 'authenticated_fetch'

interface FetchRepositoryResult extends GitCommandResult {
  failureStage?: FetchFailureStage
  fetchMode: 'azure-pat-https'
  httpRemoteUrlSanitized: string | null
  remoteTransport: RemoteTransport
  remoteUrlSanitized: string
}

const DEFAULT_FETCH_REFSPEC = '+refs/heads/*:refs/remotes/origin/*'
const FETCH_MODE = 'azure-pat-https'

@Injectable()
export class GitCollectorService {
  private readonly logger: ReturnType<AppLoggerFactory['create']>

  constructor(
    private readonly loggerFactory: AppLoggerFactory,
    private readonly runtimeConfig: WorkerRuntimeConfigService,
    private readonly repoCloneService: RepoCloneService,
  ) {
    this.logger = this.loggerFactory.create('git-collector')
  }

  async collect(
    selectedRepos: string[],
    author: string,
    sincePeriod: string,
  ): Promise<Result<GatheredGitActivity, ExternalServiceError>> {
    try {
      const reposRootPath = this.runtimeConfig.config.REPOS_ROOT_PATH
      if (!reposRootPath) {
        return Result.err(
          new ExternalServiceError({
            service: 'git',
            message: 'REPOS_ROOT_PATH not configured',
          }),
        )
      }

      const defaultProject =
        this.runtimeConfig.config.AZURE_DEVOPS_DEFAULT_PROJECT
      const parsed = selectedRepos.map((id) =>
        parseRepoIdentifier(id, defaultProject),
      )

      // Fallback: ensure all repos are cloned before collecting
      const cloneResult = await this.repoCloneService.ensureAllCloned(parsed)

      for (const { repo, error } of cloneResult.failed) {
        this.logger.warn('Repo clone failed, skipping', {
          repo: repo.name,
          error: error.message,
        })
      }

      const failedKeys = new Set(
        cloneResult.failed.map((f) => `${f.repo.project}/${f.repo.name}`),
      )
      const repositoryPaths = parsed
        .filter((r) => !failedKeys.has(`${r.project}/${r.name}`))
        .map((r) => join(reposRootPath, r.name))

      const repositories = await Promise.all(
        repositoryPaths.map((path) =>
          this.processRepository(path, author, sincePeriod),
        ),
      )

      return Result.ok({
        timestamp: new Date().toISOString(),
        repos: repositories.filter(
          (repository) => repository.commits.length > 0,
        ),
      })
    } catch (error) {
      return Result.err(
        new ExternalServiceError({
          service: 'git',
          message: `git collection failed: ${error instanceof Error ? error.message : String(error)}`,
        }),
      )
    }
  }

  private async processRepository(
    repositoryPath: string,
    author: string,
    sincePeriod: string,
  ): Promise<RepoActivity> {
    const repositoryName = repositoryPath.split('/').pop() ?? repositoryPath

    if (!existsSync(repositoryPath)) {
      this.logger.warn(
        `Repository directory not found: ${repositoryPath} — skipping ${repositoryName}`,
      )
      return {
        repoName: repositoryName,
        repoPath: repositoryPath,
        commits: [],
        cardNumbers: [],
      }
    }

    const fetchResult = await this.fetchRepository(repositoryPath)

    if (fetchResult.exitCode !== 0) {
      this.logger.warn('Git fetch failed for repository', {
        error: fetchResult.stderr.toString().trim(),
        failureStage: fetchResult.failureStage ?? 'authenticated_fetch',
        fetchMode: fetchResult.fetchMode,
        httpRemoteUrlSanitized: fetchResult.httpRemoteUrlSanitized,
        remoteTransport: fetchResult.remoteTransport,
        remoteUrlSanitized: fetchResult.remoteUrlSanitized,
        repositoryName,
      })
    }

    const logResult = await runGitCommand([
      '-C',
      repositoryPath,
      'log',
      '--all',
      '--no-merges',
      '--source',
      `--author=${author}`,
      `--since=${sincePeriod}`,
      '--pretty=format:%x1e%h%x1f%s%x1f%b%x1f%S',
    ])

    const commits = await Promise.all(
      this.parseCommitBlocks(logResult.stdout.toString())
        .filter((block) => this.isRelevantCommitBlock(block))
        .map(async (block) => {
          const showResult = await runGitCommand([
            '-C',
            repositoryPath,
            'show',
            '--stat',
            '--format=',
            block.hash,
          ])
          const stats = this.parseShowStat(showResult.stdout.toString())

          return {
            hash: block.hash,
            subject: block.subject,
            body: block.body,
            sourceBranch: this.normalizeSourceRef(block.sourceRef),
            ...stats,
          } satisfies CommitInfo
        }),
    )

    const sourceBranches = [
      ...new Set(commits.map((c) => c.sourceBranch).filter(Boolean)),
    ]
    const cardNumbers = this.extractCardNumbersFromBranches(sourceBranches)

    return {
      repoName: repositoryName,
      repoPath: repositoryPath,
      commits,
      cardNumbers,
    }
  }

  private async fetchRepository(
    repositoryPath: string,
  ): Promise<FetchRepositoryResult> {
    const repositoryName = repositoryPath.split('/').pop() ?? repositoryPath
    const remoteUrlResult = await runGitCommand([
      '-C',
      repositoryPath,
      'remote',
      'get-url',
      'origin',
    ])
    const remoteUrl = remoteUrlResult.stdout.toString().trim()
    const remoteUrlSanitized = this.sanitizeGitRemoteUrl(remoteUrl)
    const remoteTransport = this.detectRemoteTransport(remoteUrl)

    if (remoteUrlResult.exitCode !== 0) {
      return {
        ...remoteUrlResult,
        failureStage: 'remote_discovery',
        fetchMode: FETCH_MODE,
        httpRemoteUrlSanitized: null,
        remoteTransport,
        remoteUrlSanitized: remoteUrlSanitized || '<unresolved>',
      }
    }

    const httpRemoteUrl = this.buildAzureDevopsHttpRemoteUrl(remoteUrl)
    if (!httpRemoteUrl) {
      return {
        ...remoteUrlResult,
        exitCode: 1,
        failureStage: 'remote_unsupported',
        fetchMode: FETCH_MODE,
        httpRemoteUrlSanitized: null,
        remoteTransport,
        remoteUrlSanitized,
        stderr: Buffer.from(
          `Unsupported git remote for PAT fetch: ${remoteUrl || '<empty>'}`,
        ),
      }
    }

    const azurePat = this.runtimeConfig.config.AZURE_DEVOPS_PAT
    if (!azurePat) {
      return {
        ...remoteUrlResult,
        exitCode: 1,
        failureStage: 'credentials',
        fetchMode: FETCH_MODE,
        httpRemoteUrlSanitized: httpRemoteUrl,
        remoteTransport,
        remoteUrlSanitized,
        stderr: Buffer.from('AZURE_DEVOPS_PAT not configured'),
      }
    }

    const authHeader = this.buildAzureDevopsAuthHeader(azurePat)
    const fetchRefspecs = await this.resolveFetchRefspecs({
      httpRemoteUrlSanitized: httpRemoteUrl,
      remoteTransport,
      remoteUrlSanitized,
      repositoryPath,
      repositoryName,
    })
    const args = [
      '-c',
      'credential.helper=',
      '-c',
      'core.askPass=echo',
      '-c',
      `http.extraheader=${authHeader}`,
      '-C',
      repositoryPath,
      'fetch',
      '--quiet',
      httpRemoteUrl,
      ...fetchRefspecs,
    ]

    this.logger.debug('Fetching repository through Azure DevOps HTTPS PAT', {
      fetchMode: FETCH_MODE,
      httpRemoteUrlSanitized: httpRemoteUrl,
      remoteTransport,
      remoteUrlSanitized,
      repositoryName,
    })

    const fetchResult = await runGitCommand(args, {
      env: {
        ...process.env,
        GIT_TERMINAL_PROMPT: '0',
      },
    })

    return {
      ...fetchResult,
      failureStage:
        fetchResult.exitCode === 0 ? undefined : 'authenticated_fetch',
      fetchMode: FETCH_MODE,
      httpRemoteUrlSanitized: httpRemoteUrl,
      remoteTransport,
      remoteUrlSanitized,
    }
  }

  private buildAzureDevopsAuthHeader(pat: string): string {
    return buildAuthHeader(pat)
  }

  private buildAzureDevopsHttpRemoteUrl(remoteUrl: string): string | null {
    if (remoteUrl.startsWith('https://')) {
      try {
        const parsedUrl = new URL(remoteUrl)
        if (parsedUrl.hostname !== 'dev.azure.com') {
          return null
        }

        parsedUrl.username = ''
        parsedUrl.password = ''
        return parsedUrl.toString()
      } catch {
        return null
      }
    }

    const scpLikeMatch = remoteUrl.match(
      /^git@ssh\.dev\.azure\.com:v3\/([^/]+)\/([^/]+)\/(.+)$/,
    )
    if (scpLikeMatch) {
      const [, organization, project, repository] = scpLikeMatch
      return `https://dev.azure.com/${organization}/${project}/_git/${repository}`
    }

    const sshMatch = remoteUrl.match(
      /^ssh:\/\/git@ssh\.dev\.azure\.com\/v3\/([^/]+)\/([^/]+)\/(.+)$/,
    )
    if (sshMatch) {
      const [, organization, project, repository] = sshMatch
      return `https://dev.azure.com/${organization}/${project}/_git/${repository}`
    }

    return null
  }

  private async resolveFetchRefspecs(options: {
    httpRemoteUrlSanitized: string
    remoteTransport: RemoteTransport
    remoteUrlSanitized: string
    repositoryName: string
    repositoryPath: string
  }): Promise<string[]> {
    const {
      httpRemoteUrlSanitized,
      remoteTransport,
      remoteUrlSanitized,
      repositoryName,
      repositoryPath,
    } = options
    const refspecResult = await runGitCommand([
      '-C',
      repositoryPath,
      'config',
      '--get-all',
      'remote.origin.fetch',
    ])
    const refspecs = refspecResult.stdout
      .toString()
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)

    if (refspecResult.exitCode === 0 && refspecs.length > 0) {
      return refspecs
    }

    this.logger.warn('Using default git fetch refspec for repository', {
      error:
        refspecResult.stderr.toString().trim() ||
        'remote.origin.fetch not configured',
      failureStage: 'refspec_resolution',
      fetchMode: FETCH_MODE,
      httpRemoteUrlSanitized,
      remoteTransport,
      remoteUrlSanitized,
      repositoryName,
    })

    return [DEFAULT_FETCH_REFSPEC]
  }

  private detectRemoteTransport(remoteUrl: string): RemoteTransport {
    if (remoteUrl.startsWith('https://')) {
      return 'https'
    }

    if (
      remoteUrl.startsWith('git@ssh.dev.azure.com:') ||
      remoteUrl.startsWith('ssh://git@ssh.dev.azure.com/')
    ) {
      return 'ssh'
    }

    return 'unsupported'
  }

  private sanitizeGitRemoteUrl(remoteUrl: string): string {
    if (!remoteUrl.startsWith('https://')) {
      return remoteUrl
    }

    try {
      const parsedUrl = new URL(remoteUrl)
      parsedUrl.username = ''
      parsedUrl.password = ''
      return parsedUrl.toString()
    } catch {
      return remoteUrl
    }
  }

  private isRelevantCommitBlock(block: CommitBlock): boolean {
    const mergePatterns = [
      /^Merged PR \d+:/i,
      /^Merge pull request #\d+/i,
      /^Merge branch /i,
      /^Merge remote-tracking branch /i,
    ]

    return (
      /^[0-9a-f]{7,40}$/i.test(block.hash.trim()) &&
      Boolean(block.subject.trim()) &&
      !mergePatterns.some((pattern) => pattern.test(block.subject.trim()))
    )
  }

  private parseCommitBlocks(raw: string): CommitBlock[] {
    const recordSeparator = '\x1e'
    const fieldSeparator = '\x1f'

    if (!raw.trim()) {
      return []
    }

    if (raw.includes(recordSeparator)) {
      return raw
        .split(recordSeparator)
        .map((record) => record.trim())
        .filter(Boolean)
        .map((record) => {
          const parts = record.split(fieldSeparator)
          const hash = (parts[0] ?? '').trim()
          const subject = (parts[1] ?? '').trim()
          // Last field is sourceRef (%S); everything between subject and sourceRef is body
          const sourceRef = parts.length > 3 ? (parts.at(-1) ?? '').trim() : ''
          const body =
            parts.length > 3
              ? parts.slice(2, -1).join(fieldSeparator).trim()
              : (parts[2] ?? '').trim()

          return { hash, subject, body, sourceRef }
        })
    }

    return raw
      .trim()
      .replace(/\n?---\s*$/, '')
      .trim()
      .split('\n---\n')
      .filter((block) => block.trim())
      .map((block) => {
        const lines = block.trim().split('\n')
        return {
          hash: lines[0] ?? '',
          subject: lines[1] ?? '',
          body: lines.slice(2).join('\n').trim(),
          sourceRef: '',
        }
      })
  }

  private parseShowStat(raw: string) {
    const files: string[] = []
    let filesChanged = 0
    let insertions = 0
    let deletions = 0

    const fileRegex = /^\s+(.+?)\s+\|\s+\d+/
    const summaryRegex =
      /(\d+)\s+files?\s+changed(?:,\s+(\d+)\s+insertions?\(\+\))?(?:,\s+(\d+)\s+deletions?\(-\))?/

    for (const line of raw.split('\n')) {
      const fileMatch = line.match(fileRegex)
      if (fileMatch?.[1]) {
        files.push(fileMatch[1].trim())
        continue
      }

      const summaryMatch = line.match(summaryRegex)
      if (summaryMatch) {
        filesChanged = Number.parseInt(summaryMatch[1] ?? '0', 10) || 0
        insertions = Number.parseInt(summaryMatch[2] ?? '0', 10) || 0
        deletions = Number.parseInt(summaryMatch[3] ?? '0', 10) || 0
      }
    }

    return { filesChanged, insertions, deletions, files }
  }

  private static readonly EXCLUDED_BRANCHES =
    /^(?:master|main|dev|develop|sprint\/)/

  /**
   * Strips git ref prefixes like `refs/heads/` or `refs/remotes/origin/`
   * to produce a clean branch name (e.g. `feat/11748-dashboard`).
   */
  private normalizeSourceRef(sourceRef: string): string {
    return sourceRef
      .replace(/^refs\/remotes\/origin\//, '')
      .replace(/^refs\/heads\//, '')
      .replace(/^refs\/remotes\/[^/]+\//, '')
  }

  /**
   * Extracts unique card numbers from a list of branch names.
   * Looks for 3-7 digit numbers in the branch path segments.
   * Excludes non-feature branches (master, main, dev, develop, sprint/*).
   */
  private extractCardNumbersFromBranches(branches: string[]): string[] {
    const numbers = new Set<string>()

    for (const branch of branches) {
      const cardNumber = this.extractBranchCardNumber(branch)
      if (cardNumber) {
        numbers.add(cardNumber)
      }
    }

    return [...numbers]
  }

  private extractBranchCardNumber(branch: string): string | null {
    if (!branch || GitCollectorService.EXCLUDED_BRANCHES.test(branch)) {
      return null
    }

    const match = branch.match(/(?:^|\/)(\d{3,7})(?:[-/]|$)/)
    return match ? (match[1] ?? null) : null
  }
}
