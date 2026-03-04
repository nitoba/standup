import type { GatheredGitActivity, RepoActivity } from '@standup/domain'
import { ExternalServiceError, Result } from '@standup/domain'
import { createServiceLogger } from '@standup/logger'
import type {
  EnrichedGitActivity,
  EnrichedRepo,
  EnrichedWorkItem,
} from '../types.js'
import type { AzureMcpClient } from './azure-mcp-client.js'

const logger = createServiceLogger({
  service: 'standup-generator',
  component: 'enricher',
})

export async function enrichGitActivity(
  activity: GatheredGitActivity,
  client: AzureMcpClient,
): Promise<Result<EnrichedGitActivity, ExternalServiceError>> {
  const activeRepos = activity.repos.filter(
    (r: RepoActivity) => r.commits.length > 0,
  )

  if (activeRepos.length === 0) {
    return Result.err(
      new ExternalServiceError({
        service: 'git',
        message: 'No commits found in the configured time window',
      }),
    )
  }

  // Get the current user UUID (needed to filter PRs by creator)
  const meResult = await client.getMe()
  if (meResult.isErr()) {
    logger.error('Failed to get current user from Azure DevOps', {
      error: meResult.error.message,
    })
    return meResult
  }
  const userUuid = meResult.value
  logger.info('Got Azure DevOps user UUID', { userUuid })

  const enrichedRepos: EnrichedRepo[] = []

  for (const repo of activeRepos) {
    // Collect all unique card numbers: from commits + from branch name
    const allCardNumbers = Array.from(
      new Set([
        ...repo.cardNumbers,
        ...(repo.branchCardNumber ? [repo.branchCardNumber] : []),
      ]),
    )

    const enrichedItems: EnrichedWorkItem[] = []

    for (const cardNumber of allCardNumbers) {
      logger.info('Enriching work item', {
        repoName: repo.repoName,
        cardNumber,
      })

      const workItemResult = await client.getWorkItem(cardNumber)
      if (workItemResult.isErr()) {
        logger.warn('Failed to fetch work item, skipping', {
          cardNumber,
          error: workItemResult.error.message,
        })
        enrichedItems.push({ cardNumber, workItem: null, pullRequests: [] })
        continue
      }

      // For PRs, use the repo name as the repositoryId (Azure DevOps accepts repo names)
      const prsResult = await client.listPullRequests(repo.repoName)
      let pullRequests = prsResult.status === 'ok' ? prsResult.value : []

      // Filter to only PRs created by the current user
      pullRequests = pullRequests.filter(
        (pr: { creatorId: string }) => pr.creatorId === userUuid,
      )

      enrichedItems.push({
        cardNumber,
        workItem: workItemResult.value,
        pullRequests,
      })
    }

    enrichedRepos.push({
      repoName: repo.repoName,
      repoPath: repo.repoPath,
      currentBranch: repo.currentBranch,
      commits: repo.commits,
      cardNumbers: repo.cardNumbers,
      branchCardNumber: repo.branchCardNumber,
      enrichedItems,
    })
  }

  return Result.ok({
    timestamp: activity.timestamp,
    repos: enrichedRepos,
    userUuid,
  })
}
