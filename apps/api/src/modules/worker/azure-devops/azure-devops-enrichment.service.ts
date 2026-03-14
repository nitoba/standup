import { Injectable } from '@nestjs/common'
import type { GatheredGitActivity, RepoActivity } from '../../../shared/domain'
import { ExternalServiceError, Result } from '../../../shared/domain'
import { AppLoggerFactory } from '../../../shared/logger'
import { AzureDevopsMcpClientService } from './azure-devops-mcp-client.service'
import type {
  EnrichedGitActivity,
  EnrichedRepo,
  EnrichedWorkItem,
  RepoInfo,
} from './types'

@Injectable()
export class AzureDevopsEnrichmentService {
  private readonly logger: ReturnType<AppLoggerFactory['create']>

  constructor(
    private readonly loggerFactory: AppLoggerFactory,
    private readonly azureDevopsMcpClient: AzureDevopsMcpClientService,
  ) {
    this.logger = this.loggerFactory.create('azure-devops-enrichment')
  }

  async enrichGitActivity(
    activity: GatheredGitActivity,
  ): Promise<Result<EnrichedGitActivity, ExternalServiceError>> {
    const activeRepos = activity.repos.filter(
      (repo: RepoActivity) => repo.commits.length > 0,
    )

    if (activeRepos.length === 0) {
      return Result.err(
        new ExternalServiceError({
          service: 'git',
          message: 'No commits found in the configured time window',
        }),
      )
    }

    const meResult = await this.azureDevopsMcpClient.getMe()
    if (meResult.isErr()) {
      return meResult
    }

    const userUuid = meResult.value
    const enrichedRepos: EnrichedRepo[] = []

    for (const repo of activeRepos) {
      const cardNumbers = Array.from(
        new Set([
          ...repo.cardNumbers,
          ...(repo.branchCardNumber ? [repo.branchCardNumber] : []),
        ]),
      )

      const enrichedItems: EnrichedWorkItem[] = []

      for (const cardNumber of cardNumbers) {
        const workItemResult =
          await this.azureDevopsMcpClient.getWorkItem(cardNumber)

        if (workItemResult.isErr()) {
          this.logger.warn(
            `Failed to fetch work item ${cardNumber}: ${workItemResult.error.message}`,
          )
          enrichedItems.push({ cardNumber, workItem: null, pullRequests: [] })
          continue
        }

        const pullRequestsResult =
          await this.azureDevopsMcpClient.listPullRequests(repo.repoName)
        const pullRequests = pullRequestsResult.isOk()
          ? pullRequestsResult.value.filter(
              (pullRequest) => pullRequest.creatorId === userUuid,
            )
          : []

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

  async listRepositories(
    projects: string[],
  ): Promise<Result<RepoInfo[], ExternalServiceError>> {
    if (!this.azureDevopsMcpClient.isConnected()) {
      return Result.err(
        new ExternalServiceError({
          service: 'azure-devops',
          message: 'Azure MCP client is not connected',
        }),
      )
    }

    const repositories: RepoInfo[] = []

    for (const project of projects) {
      const result = await this.azureDevopsMcpClient.listRepositories(project)
      if (result.isErr()) {
        this.logger.warn(
          `Failed to list repositories for ${project}: ${result.error.message}`,
        )
        continue
      }

      repositories.push(...result.value)
    }

    return Result.ok(repositories)
  }
}
