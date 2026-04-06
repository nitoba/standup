import { Injectable } from '@nestjs/common'
import { AppLoggerFactory } from '../../../../platform/logger'
import type {
  GatheredGitActivity,
  RepoActivity,
} from '../../../../shared/domain'
import { ExternalServiceError, Result } from '../../../../shared/domain'
import { AzureDevopsRestClientService } from './azure-devops-rest-client.service'
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
    private readonly restClient: AzureDevopsRestClientService,
  ) {
    this.logger = this.loggerFactory.create('azure-devops-enrichment')
  }

  async enrichGitActivity(
    activity: GatheredGitActivity,
    azureDevopsUuid?: string,
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

    const userUuid = azureDevopsUuid ?? 'unknown'
    const enrichedRepos: EnrichedRepo[] = []

    for (const repo of activeRepos) {
      const cardNumbers = [...repo.cardNumbers]

      const pullRequestsResult = await this.restClient.listPullRequests(
        repo.repoName,
      )
      const pullRequests = pullRequestsResult.isOk()
        ? azureDevopsUuid
          ? pullRequestsResult.value.filter(
              (pullRequest) => pullRequest.creatorId === azureDevopsUuid,
            )
          : pullRequestsResult.value
        : []

      const enrichedItems: EnrichedWorkItem[] = []

      for (const cardNumber of cardNumbers) {
        const workItemResult = await this.restClient.getWorkItem(
          Number(cardNumber),
        )

        if (workItemResult.isErr()) {
          this.logger.warn(
            `Failed to fetch work item ${cardNumber}: ${workItemResult.error.message}`,
          )
          enrichedItems.push({ cardNumber, workItem: null, pullRequests: [] })
          continue
        }

        enrichedItems.push({
          cardNumber,
          workItem: workItemResult.value,
          pullRequests,
        })
      }

      enrichedRepos.push({
        repoName: repo.repoName,
        repoPath: repo.repoPath,
        commits: repo.commits,
        cardNumbers: repo.cardNumbers,
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
    const repositories: RepoInfo[] = []

    for (const project of projects) {
      const result = await this.restClient.listRepositories(project)
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
