import { Injectable } from '@nestjs/common'
import { ExternalServiceError, Result } from '../../../../shared/domain'
import { WorkerRuntimeConfigService } from '../worker-runtime-config.service'
import type { WorkItemResponse, WorkItemUpdate } from './types'

const BATCH_SIZE = 200

@Injectable()
export class AzureDevopsRestClientService {
  private readonly baseUrl: string
  private readonly authHeader: string

  constructor(private readonly runtimeConfig: WorkerRuntimeConfigService) {
    const { AZURE_DEVOPS_ORG, AZURE_DEVOPS_PAT } = this.runtimeConfig.config
    this.baseUrl = `https://dev.azure.com/${AZURE_DEVOPS_ORG}`
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
