import { join } from 'node:path'
import { Injectable, Logger } from '@nestjs/common'
import type {
  CommitInfo,
  GatheredGitActivity,
  RepoActivity,
} from '@standup/domain'
import { ExternalServiceError, Result } from '@standup/domain'
import { $ } from 'bun'
import { WorkerRuntimeConfigService } from '../worker-runtime-config.service'

interface CommitBlock {
  hash: string
  subject: string
  body: string
}

@Injectable()
export class GitCollectorService {
  private readonly logger = new Logger(GitCollectorService.name)

  constructor(private readonly runtimeConfig: WorkerRuntimeConfigService) {}

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

      const repositoryPaths = selectedRepos.map((name) =>
        join(reposRootPath, name),
      )
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

    const fetchResult = await $`git -C ${repositoryPath} fetch --all --quiet`
      .quiet()
      .nothrow()

    if (fetchResult.exitCode !== 0) {
      this.logger.warn(
        `git fetch failed for ${repositoryName}: ${fetchResult.stderr.toString().trim()}`,
      )
    }

    const branchResult = await $`git -C ${repositoryPath} branch --show-current`
      .quiet()
      .nothrow()
    const currentBranch = branchResult.stdout.toString().trim()

    const logResult =
      await $`git -C ${repositoryPath} log --all --no-merges --author=${author} --since=${sincePeriod} --pretty=format:%x1e%h%x1f%s%x1f%b`
        .quiet()
        .nothrow()

    const commits = await Promise.all(
      this.parseCommitBlocks(logResult.stdout.toString())
        .filter((block) => this.isRelevantCommitBlock(block))
        .map(async (block) => {
          const showResult =
            await $`git -C ${repositoryPath} show --stat --format="" ${block.hash}`
              .quiet()
              .nothrow()
          const stats = this.parseShowStat(showResult.stdout.toString())

          return {
            hash: block.hash,
            subject: block.subject,
            body: block.body,
            ...stats,
          } satisfies CommitInfo
        }),
    )

    const text = commits
      .map((commit) => `${commit.subject} ${commit.body}`)
      .join(' ')

    return {
      repoName: repositoryName,
      repoPath: repositoryPath,
      currentBranch,
      commits,
      cardNumbers: this.extractCardNumbers(text),
      branchCardNumber: this.extractBranchCardNumber(currentBranch),
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
          const [hash = '', subject = '', ...bodyParts] =
            record.split(fieldSeparator)

          return {
            hash: hash.trim(),
            subject: subject.trim(),
            body: bodyParts.join(fieldSeparator).trim(),
          }
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

  private extractCardNumbers(text: string): string[] {
    const matches = text.match(/#(\d{3,7})/g)

    if (!matches) {
      return []
    }

    return [...new Set(matches.map((match) => match.replace('#', '')))]
  }

  private extractBranchCardNumber(branch: string): string | null {
    const match = branch.match(
      /(?:fix|feat|feature|bug|hotfix|refactor|task|chore|improvement)\/(\d{3,7})/,
    )

    return match ? (match[1] ?? null) : null
  }
}
