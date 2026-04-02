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
  'System.AreaPath',
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

function extractDisplayName(value: unknown): string {
  if (value == null) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'object' && 'displayName' in value) {
    return String((value as { displayName: unknown }).displayName ?? '')
  }
  return String(value)
}

/**
 * Identity fields that indicate who actually performed a state change.
 * When these fields appear in an update and point to a different user,
 * the update was NOT performed by the revisedBy user — it was likely
 * a bulk sprint close or board automation attributed to the assignee.
 */
const ACTOR_IDENTITY_FIELDS = new Set([
  'Microsoft.VSTS.Common.ClosedBy',
  'Microsoft.VSTS.Common.ResolvedBy',
  'Microsoft.VSTS.Common.ActivatedBy',
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

    const deduplicated = this.deduplicateWorkItems(allWorkItems)

    return {
      timestamp: new Date().toISOString(),
      workItems: deduplicated,
    }
  }

  private deduplicateWorkItems(
    items: BoardWorkItemActivity[],
  ): BoardWorkItemActivity[] {
    const seen = new Map<number, BoardWorkItemActivity>()

    for (const item of items) {
      const existing = seen.get(item.id)
      if (!existing) {
        seen.set(item.id, item)
        continue
      }

      // Merge actions that don't already exist
      const existingKeys = new Set(
        existing.actions.map((a) => `${a.timestamp}|${a.details}`),
      )
      for (const action of item.actions) {
        const key = `${action.timestamp}|${action.details}`
        if (!existingKeys.has(key)) {
          existing.actions.push(action)
          existingKeys.add(key)
        }
      }
    }

    return [...seen.values()]
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

      // Azure DevOps uses 9999-01-01 as sentinel for the latest (current) revision.
      // For date filtering, fall back to System.ChangedDate from the fields.
      const effectiveDate = update.revisedDate.startsWith('9999')
        ? String(
            update.fields?.['System.ChangedDate']?.newValue ??
              update.revisedDate,
          )
        : update.revisedDate

      if (effectiveDate < sinceDate) {
        continue
      }

      if (!update.fields) {
        continue
      }

      // Check if an actor identity field (ClosedBy, ResolvedBy, ActivatedBy)
      // indicates a different user actually performed this action.
      // This catches sprint closes and board automations attributed to the assignee.
      if (this.isActorMismatch(update.fields, user)) {
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
          details: `Assigned to ${extractDisplayName(change.newValue) || 'unassigned'}`,
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
          details: `Created by ${extractDisplayName(change.newValue) || 'unknown'}`,
        })
      } else {
        // Use extractDisplayName for identity fields to avoid [object Object]
        const oldVal = ACTOR_IDENTITY_FIELDS.has(fieldName)
          ? extractDisplayName(change.oldValue) || 'none'
          : String(change.oldValue ?? 'none')
        const newVal = ACTOR_IDENTITY_FIELDS.has(fieldName)
          ? extractDisplayName(change.newValue) || 'none'
          : String(change.newValue ?? 'none')
        actions.push({
          type: 'field_changed',
          timestamp,
          details: `${fieldName}: ${oldVal} → ${newVal}`,
        })
      }
    }

    return actions
  }

  /**
   * Returns true if an actor identity field (ClosedBy, ResolvedBy, ActivatedBy)
   * exists in this update and its newValue points to a different user.
   * This means the action was performed by someone else (e.g. sprint close by manager).
   */
  private isActorMismatch(
    fields: Record<string, WorkItemUpdateFieldChange>,
    user: string,
  ): boolean {
    for (const fieldName of ACTOR_IDENTITY_FIELDS) {
      const change = fields[fieldName]
      if (!change?.newValue) continue

      const actorName = extractDisplayName(change.newValue)
      if (actorName && actorName !== user) {
        return true
      }
    }
    return false
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
    const areaPath = item.fields['System.AreaPath']
    const projectFromArea =
      typeof areaPath === 'string' ? areaPath.split('\\')[0] : undefined

    return {
      id: item.id,
      title: String(item.fields['System.Title'] ?? ''),
      type: String(item.fields['System.WorkItemType'] ?? ''),
      state: String(item.fields['System.State'] ?? ''),
      assignedTo: extractDisplayName(item.fields['System.AssignedTo']),
      project: projectFromArea ?? project,
      actions,
    }
  }

  private resolveSinceDate(sincePeriod: string): string {
    // If it's already an ISO date, return as-is
    if (/^\d{4}-\d{2}-\d{2}/.test(sincePeriod)) {
      return sincePeriod
    }

    const match = sincePeriod.match(/^(\d+)\s*hours?\s*ago$/i)
    const hours = match ? Number(match[1]) : 8

    const date = new Date()
    date.setHours(date.getHours() - hours)
    return date.toISOString()
  }
}
