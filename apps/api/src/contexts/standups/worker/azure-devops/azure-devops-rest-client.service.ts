import { Injectable } from '@nestjs/common'
import { ExternalServiceError, Result } from '../../../../shared/domain'
import { WorkerRuntimeConfigService } from '../worker-runtime-config.service'
import type { PullRequestDetail, WorkItemDetail, WorkItemResponse, WorkItemUpdate } from './types'

const BATCH_SIZE = 200

@Injectable()
export class AzureDevopsRestClientService {
  private readonly baseUrl: string
  private readonly vsspsBaseUrl: string
  private readonly authHeader: string

  constructor(private readonly runtimeConfig: WorkerRuntimeConfigService) {
    const { AZURE_DEVOPS_ORG, AZURE_DEVOPS_PAT } = this.runtimeConfig.config
    this.baseUrl = `https://dev.azure.com/${AZURE_DEVOPS_ORG}`
    this.vsspsBaseUrl = `https://vssps.dev.azure.com/${AZURE_DEVOPS_ORG}`
    this.authHeader = `Basic ${Buffer.from(`:${AZURE_DEVOPS_PAT}`).toString('base64')}`
  }

  async queryWorkItems(
    project: string,
    wiql: string,
  ): Promise<Result<number[], ExternalServiceError>> {
    return Result.tryPromise({
      try: async () => {
        const url = `${this.baseUrl}/${project}/_apis/wit/wiql?api-version=7.1`
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: this.authHeader,
          },
          body: JSON.stringify({ query: wiql }),
        })

        await this.assertOk(response)

        const data = (await response.json()) as {
          workItems?: Array<{ id: number }>
        }
        return (data.workItems ?? []).map((item) => item.id)
      },
      catch: (error) => this.toError('queryWorkItems', error),
    })
  }

  async getWorkItemsBatch(
    ids: number[],
    fields: string[],
  ): Promise<Result<WorkItemResponse[], ExternalServiceError>> {
    if (ids.length === 0) {
      return Result.ok([])
    }

    return Result.tryPromise({
      try: async () => {
        const allItems: WorkItemResponse[] = []

        for (let i = 0; i < ids.length; i += BATCH_SIZE) {
          const batchIds = ids.slice(i, i + BATCH_SIZE)
          const idsParam = batchIds.join(',')
          const fieldsParam = fields.join(',')
          const url = `${this.baseUrl}/_apis/wit/workitems?ids=${idsParam}&fields=${fieldsParam}&api-version=7.1`

          const response = await fetch(url, {
            method: 'GET',
            headers: {
              Authorization: this.authHeader,
            },
          })

          await this.assertOk(response)

          const data = (await response.json()) as {
            value: WorkItemResponse[]
          }
          allItems.push(...data.value)
        }

        return allItems
      },
      catch: (error) => this.toError('getWorkItemsBatch', error),
    })
  }

  async getWorkItemUpdates(
    id: number,
  ): Promise<Result<WorkItemUpdate[], ExternalServiceError>> {
    return Result.tryPromise({
      try: async () => {
        const url = `${this.baseUrl}/_apis/wit/workitems/${id}/updates?api-version=7.1`
        const response = await fetch(url, {
          method: 'GET',
          headers: {
            Authorization: this.authHeader,
          },
        })

        await this.assertOk(response)

        const data = (await response.json()) as {
          value: WorkItemUpdate[]
        }
        return data.value
      },
      catch: (error) => this.toError('getWorkItemUpdates', error),
    })
  }

  async getWorkItem(
    id: number,
  ): Promise<Result<WorkItemDetail | null, ExternalServiceError>> {
    const { AZURE_DEVOPS_DEFAULT_PROJECT } = this.runtimeConfig.config

    return Result.tryPromise({
      try: async () => {
        const url = `${this.baseUrl}/${AZURE_DEVOPS_DEFAULT_PROJECT}/_apis/wit/workitems/${id}?fields=System.Title,System.State,System.AssignedTo&api-version=7.1`
        const response = await fetch(url, {
          method: 'GET',
          headers: { Authorization: this.authHeader },
        })

        await this.assertOk(response)

        const parsed = (await response.json()) as {
          id?: number
          fields?: {
            'System.Title'?: string
            'System.State'?: string
            'System.AssignedTo'?: { uniqueName?: string } | string
          }
        }

        if (!parsed.fields) {
          return null
        }

        const assignedTo = parsed.fields['System.AssignedTo']
        const assignedToEmail =
          typeof assignedTo === 'object'
            ? (assignedTo?.uniqueName ?? '')
            : (assignedTo ?? '')

        return {
          id: String(parsed.id ?? id),
          title: parsed.fields['System.Title'] ?? '',
          state: parsed.fields['System.State'] ?? '',
          assignedTo: assignedToEmail,
        }
      },
      catch: (error) => this.toError('getWorkItem', error),
    })
  }

  async listPullRequests(
    repositoryId: string,
  ): Promise<Result<PullRequestDetail[], ExternalServiceError>> {
    const { AZURE_DEVOPS_DEFAULT_PROJECT } = this.runtimeConfig.config

    return Result.tryPromise({
      try: async () => {
        const url = `${this.baseUrl}/${AZURE_DEVOPS_DEFAULT_PROJECT}/_apis/git/repositories/${repositoryId}/pullrequests?searchCriteria.status=all&api-version=7.1`
        const response = await fetch(url, {
          method: 'GET',
          headers: { Authorization: this.authHeader },
        })

        await this.assertOk(response)

        const data = (await response.json()) as {
          value: Array<{
            pullRequestId?: number
            title?: string
            status?: string
            repository?: { id?: string }
            createdBy?: { id?: string }
          }>
        }

        return data.value
          .filter((pr) => typeof pr.pullRequestId === 'number')
          .map((pr) => ({
            id: pr.pullRequestId ?? 0,
            title: pr.title ?? '',
            status: this.normalizePullRequestStatus(pr.status),
            repoId: pr.repository?.id ?? repositoryId,
            creatorId: pr.createdBy?.id ?? '',
          }))
      },
      catch: (error) => this.toError('listPullRequests', error),
    })
  }

  private normalizePullRequestStatus(
    status: string | undefined,
  ): 'active' | 'completed' | 'abandoned' {
    if (status === 'completed') return 'completed'
    if (status === 'abandoned') return 'abandoned'
    return 'active'
  }

  async resolveIdentity(
    filterValue: string,
  ): Promise<
    Result<{ id: string; displayName: string }, ExternalServiceError>
  > {
    return Result.tryPromise({
      try: async () => {
        const encoded = encodeURIComponent(filterValue)
        const url = `${this.vsspsBaseUrl}/_apis/identities?searchFilter=General&filterValue=${encoded}&queryMembership=None&api-version=7.1`
        const response = await fetch(url, {
          method: 'GET',
          headers: { Authorization: this.authHeader },
        })

        await this.assertOk(response)

        const data = (await response.json()) as {
          value: Array<{
            id: string
            providerDisplayName: string
            isActive: boolean
            isContainer?: boolean
          }>
        }

        const activeUsers = data.value.filter(
          (identity) => identity.isActive && !identity.isContainer,
        )

        if (activeUsers.length === 0) {
          throw new Error(
            `No Azure DevOps user found matching '${filterValue}'`,
          )
        }

        if (activeUsers.length > 1) {
          throw new Error(
            `Multiple Azure DevOps users match '${filterValue}'. Use email for a more precise match.`,
          )
        }

        // activeUsers.length === 1 is guaranteed by the checks above
        const user = activeUsers[0] as NonNullable<(typeof activeUsers)[0]>
        return {
          id: user.id,
          displayName: user.providerDisplayName,
        }
      },
      catch: (error) => this.toError('resolveIdentity', error),
    })
  }

  private async assertOk(response: Response): Promise<void> {
    if (!response.ok) {
      const body = await response.text()
      throw new Error(`HTTP ${response.status} ${response.statusText}: ${body}`)
    }
  }

  private toError(operation: string, error: unknown): ExternalServiceError {
    return new ExternalServiceError({
      service: 'azure-devops',
      message: `${operation} failed: ${error instanceof Error ? error.message : String(error)}`,
    })
  }
}
