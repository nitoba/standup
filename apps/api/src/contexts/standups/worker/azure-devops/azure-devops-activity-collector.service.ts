import { Injectable } from '@nestjs/common'
import { AppLoggerFactory } from '../../../../platform/logger'
import { WorkerRuntimeConfigService } from '../worker-runtime-config.service'
import { AzureDevopsRestClientService } from './azure-devops-rest-client.service'
import type {
  BoardAction,
  BoardWorkItemActivity,
  GatheredBoardActivity,
  WorkItemResponse,
  WorkItemUpdate,
  WorkItemUpdateFieldChange,
} from './types'

const WORK_ITEM_FIELDS = [
  'System.Id',
  'System.Title',
  'System.WorkItemType',
  'System.State',
  'System.AssignedTo',
]

const NOISE_FIELDS = new Set([
  'System.Rev',
  'System.RevisedDate',
  'System.ChangedDate',
  'System.ChangedBy',
  'System.AuthorizedDate',
  'System.AuthorizedAs',
  'System.Watermark',
  'System.PersonId',
])

@Injectable()
export class AzureDevopsActivityCollectorService {
  private readonly logger: ReturnType<AppLoggerFactory['create']>

  constructor(
    private readonly loggerFactory: AppLoggerFactory,
    private readonly restClient: AzureDevopsRestClientService,
    private readonly runtimeConfig: WorkerRuntimeConfigService,
  ) {
    this.logger = this.loggerFactory.create('azure-devops-activity-collector')
  }

  async collect(
    azureDevopsUser: string,
    sincePeriod: string,
  ): Promise<GatheredBoardActivity | null> {
    const projects = this.runtimeConfig.config.AZURE_DEVOPS_PROJECTS
    const allWorkItems: BoardWorkItemActivity[] = []

    for (const project of projects) {
      const items = await this.collectForProject(
        project,
        azureDevopsUser,
        sincePeriod,
      )
      allWorkItems.push(...items)
    }

    if (allWorkItems.length === 0) {
      return null
    }

    return {
      timestamp: new Date().toISOString(),
      workItems: allWorkItems,
    }
  }

  private async collectForProject(
    project: string,
    user: string,
    sincePeriod: string,
  ): Promise<BoardWorkItemActivity[]> {
    const sinceDate = this.resolveSinceDate(sincePeriod)
    const wiql = this.buildWiql(sinceDate)

    const idsResult = await this.restClient.queryWorkItems(project, wiql)
    if (idsResult.isErr()) {
      this.logger.warn(
        `Failed to query work items for project ${project}: ${idsResult.error.message}`,
      )
      return []
    }

    const ids = idsResult.value
    if (ids.length === 0) {
      return []
    }

    const itemsResult = await this.restClient.getWorkItemsBatch(
      ids,
      WORK_ITEM_FIELDS,
    )
    if (itemsResult.isErr()) {
      this.logger.warn(
        `Failed to fetch work item details for project ${project}: ${itemsResult.error.message}`,
      )
      return []
    }

    const workItems: BoardWorkItemActivity[] = []

    for (const item of itemsResult.value) {
      const updatesResult = await this.restClient.getWorkItemUpdates(item.id)
      if (updatesResult.isErr()) {
        this.logger.warn(
          `Failed to fetch updates for work item ${item.id}: ${updatesResult.error.message}`,
        )
        continue
      }

      const actions = this.extractUserActions(
        updatesResult.value,
        user,
        sinceDate,
      )

      if (actions.length === 0) {
        continue
      }

      workItems.push(this.buildWorkItemActivity(item, project, actions))
    }

    return workItems
  }

  private extractUserActions(
    updates: WorkItemUpdate[],
    user: string,
    sinceDate: string,
  ): BoardAction[] {
    const actions: BoardAction[] = []

    for (const update of updates) {
      if (update.revisedBy.displayName !== user) {
        continue
      }

      if (update.revisedDate < sinceDate) {
        continue
      }

      if (!update.fields) {
        continue
      }

      const fieldActions = this.classifyFieldChanges(
        update.fields,
        update.revisedDate,
      )
      actions.push(...fieldActions)
    }

    return actions
  }

  private classifyFieldChanges(
    fields: Record<string, WorkItemUpdateFieldChange>,
    timestamp: string,
  ): BoardAction[] {
    const actions: BoardAction[] = []

    for (const [fieldName, change] of Object.entries(fields)) {
      if (NOISE_FIELDS.has(fieldName)) {
        continue
      }

      if (fieldName === 'System.State') {
        actions.push({
          type: 'state_change',
          timestamp,
          details: `${String(change.oldValue ?? 'none')} → ${String(change.newValue ?? 'none')}`,
        })
      } else if (fieldName === 'System.AssignedTo') {
        actions.push({
          type: 'assigned',
          timestamp,
          details: `Assigned to ${String(change.newValue ?? 'unassigned')}`,
        })
      } else if (fieldName === 'System.History') {
        actions.push({
          type: 'commented',
          timestamp,
          details: 'Added a comment',
        })
      } else if (fieldName === 'System.CreatedBy') {
        actions.push({
          type: 'created',
          timestamp,
          details: `Created by ${String(change.newValue ?? 'unknown')}`,
        })
      } else {
        actions.push({
          type: 'field_changed',
          timestamp,
          details: `${fieldName}: ${String(change.oldValue ?? 'none')} → ${String(change.newValue ?? 'none')}`,
        })
      }
    }

    return actions
  }

  private buildWiql(sinceDate: string): string {
    const dateOnly = sinceDate.split('T')[0]
    return `SELECT [System.Id] FROM WorkItems WHERE [System.ChangedDate] >= '${dateOnly}'`
  }

  private buildWorkItemActivity(
    item: WorkItemResponse,
    project: string,
    actions: BoardAction[],
  ): BoardWorkItemActivity {
    return {
      id: item.id,
      title: String(item.fields['System.Title'] ?? ''),
      type: String(item.fields['System.WorkItemType'] ?? ''),
      state: String(item.fields['System.State'] ?? ''),
      assignedTo: String(item.fields['System.AssignedTo'] ?? ''),
      project,
      actions,
    }
  }

  private resolveSinceDate(sincePeriod: string): string {
    const match = sincePeriod.match(/^(\d+)\s*hours?\s*ago$/i)
    const hours = match ? Number(match[1]) : 8

    const date = new Date()
    date.setHours(date.getHours() - hours)
    return date.toISOString()
  }
}
