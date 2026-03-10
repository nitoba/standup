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
  extractBranchCardNumber,
  extractCardNumbers,
  parseCommitBlocks,
  parseShowStat,
} from './parse.js'

const logger = createServiceLogger({
  service: 'git-collector',
  component: 'collector',
})

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
    await $`git -C ${repoPath} log --all --author=${options.author} --since="16 hours ago" --pretty=format:"%h%n%s%n%b%n---"`
      .quiet()
      .nothrow()
  const logOutput = logResult.stdout.toString()

  const commitBlocks = parseCommitBlocks(logOutput)

  const commits: CommitInfo[] = await Promise.all(
    commitBlocks.map(async (block) => {
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
