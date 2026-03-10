import { join } from 'node:path'
import type {
  CommitInfo,
  GatheredGitActivity,
  RepoActivity,
} from '@standup/domain'
import { ExternalServiceError, Result } from '@standup/domain'
import { createServiceLogger } from '@standup/logger'
import { $ } from 'bun'
import {
  type CommitBlock,
  extractBranchCardNumber,
  extractCardNumbers,
  parseCommitBlocks,
  parseShowStat,
} from './parse.js'

const logger = createServiceLogger({
  service: 'git-collector',
  component: 'collector',
})

const MERGE_COMMIT_SUBJECT_PATTERNS = [
  /^Merged PR \d+:/i,
  /^Merge pull request #\d+/i,
  /^Merge branch /i,
  /^Merge remote-tracking branch /i,
]

function isRelevantCommitBlock(block: CommitBlock): boolean {
  const hash = block.hash.trim()
  const subject = block.subject.trim()

  if (!/^[0-9a-f]{7,40}$/i.test(hash)) {
    return false
  }

  if (!subject) {
    return false
  }

  return !MERGE_COMMIT_SUBJECT_PATTERNS.some((pattern) => pattern.test(subject))
}

export interface CollectOptions {
  /** Absolute path to the root directory where all repos are cloned. */
  reposRootPath: string
  /** Names of the repos to analyse (directory names under reposRootPath). */
  selectedRepos: string[]
  author: string
  sincePeriod: string
}

async function processRepo(
  repoPath: string,
  options: CollectOptions,
): Promise<RepoActivity> {
  const repoName = repoPath.split('/').pop() ?? repoPath

  logger.debug('processing repo', { repo: repoName })

  // Fetch latest refs from all remotes so --all sees remote branches.
  // Non-fatal: if fetch fails (no network, no remote) we continue with local data.
  const fetchResult = await $`git -C ${repoPath} fetch --all --quiet`
    .quiet()
    .nothrow()
  if (fetchResult.exitCode !== 0) {
    logger.warn('git fetch failed, continuing with local data', {
      repo: repoName,
      stderr: fetchResult.stderr.toString().trim(),
    })
  }

  const branchResult = await $`git -C ${repoPath} branch --show-current`
    .quiet()
    .nothrow()
  const currentBranch = branchResult.stdout.toString().trim()

  const logResult =
    await $`git -C ${repoPath} log --all --no-merges --author=${options.author} --since=${options.sincePeriod} --pretty=format:%x1e%h%x1f%s%x1f%b`
      .quiet()
      .nothrow()
  const logOutput = logResult.stdout.toString()

  const commitBlocks = parseCommitBlocks(logOutput)
  const relevantCommitBlocks = commitBlocks.filter(isRelevantCommitBlock)

  if (relevantCommitBlocks.length !== commitBlocks.length) {
    logger.debug('filtered non-relevant commits from standup collection', {
      repo: repoName,
      totalCommitBlocks: commitBlocks.length,
      keptCommitBlocks: relevantCommitBlocks.length,
    })
  }

  const commits: CommitInfo[] = await Promise.all(
    relevantCommitBlocks.map(async (block) => {
      const showResult =
        await $`git -C ${repoPath} show --stat --format="" ${block.hash}`
          .quiet()
          .nothrow()
      const stats = parseShowStat(showResult.stdout.toString())
      return {
        hash: block.hash,
        subject: block.subject,
        body: block.body,
        ...stats,
      }
    }),
  )

  const allText = commits.map((c) => `${c.subject} ${c.body}`).join(' ')
  const cardNumbers = extractCardNumbers(allText)
  const branchCardNumber = extractBranchCardNumber(currentBranch)

  return {
    repoName,
    repoPath,
    currentBranch,
    commits,
    cardNumbers,
    branchCardNumber,
  }
}

/**
 * Collects git activity across all repos under `reposBasePath`.
 * Returns `GatheredGitActivity` with only repos that have at least one commit.
 */
export async function collectGitActivity(
  options: CollectOptions,
): Promise<Result<GatheredGitActivity, ExternalServiceError>> {
  try {
    logger.info('starting git collection', {
      reposRootPath: options.reposRootPath,
      selectedRepos: options.selectedRepos,
      author: options.author,
      since: options.sincePeriod,
    })

    const repoPaths = options.selectedRepos.map((name) =>
      join(options.reposRootPath, name),
    )
    logger.debug('resolved repo paths', { count: repoPaths.length })

    const allRepos = await Promise.all(
      repoPaths.map((p) => processRepo(p, options)),
    )
    const repos = allRepos.filter((r: RepoActivity) => r.commits.length > 0)

    logger.info('git collection complete', {
      totalRepos: repoPaths.length,
      reposWithCommits: repos.length,
    })

    return Result.ok({
      timestamp: new Date().toISOString(),
      repos,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logger.error('git collection failed', { error: message })
    return Result.err(
      new ExternalServiceError({
        service: 'git',
        message: `git collection failed: ${message}`,
      }),
    )
  }
}
