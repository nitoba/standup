# Azure DevOps Board Activity Collector Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend standup generation to non-developer roles by collecting work item activity from Azure DevOps boards via REST API, running alongside the existing git collector.

**Architecture:** A new `AzureDevopsRestClientService` (REST API) and `AzureDevopsActivityCollectorService` join the existing `azure-devops` module. The `ExecuteGenerateStrategy` orchestrates both git and board collectors in parallel based on user settings. The LLM prompt adapts to the active data sources. `sourceData` gains a new wrapper format with backward-compatible parsing.

**Tech Stack:** NestJS 11, Bun, Vitest, TypeScript strict, better-result (TaggedError/Result), Drizzle ORM (SQLite/libSQL), Vercel AI SDK, Azure DevOps REST API v7.1

**Spec:** `docs/superpowers/specs/2026-03-16-azure-devops-board-activity-collector-design.md`

---

## Chunk 1: Board Activity Types and REST Client

### Task 1: Board activity types

**Files:**
- Modify: `apps/api/src/contexts/standups/worker/azure-devops/types.ts`

- [ ] **Step 1: Add board activity types to the existing types file**

Append to the end of the file (after the existing `RepoInfo` interface):

```ts
// apps/api/src/contexts/standups/worker/azure-devops/types.ts
// (append after existing types)

export type BoardActionType =
  | 'created'
  | 'state_change'
  | 'assigned'
  | 'commented'
  | 'field_changed'

export interface BoardAction {
  type: BoardActionType
  timestamp: string
  details: string
}

export interface BoardWorkItemActivity {
  id: number
  title: string
  type: string
  state: string
  assignedTo: string
  project: string
  actions: BoardAction[]
}

export interface GatheredBoardActivity {
  timestamp: string
  workItems: BoardWorkItemActivity[]
}

export interface WorkItemResponse {
  id: number
  fields: Record<string, unknown>
}

export interface WorkItemUpdateFieldChange {
  oldValue?: unknown
  newValue?: unknown
}

export interface WorkItemUpdate {
  id: number
  rev: number
  revisedDate: string
  revisedBy: { displayName: string }
  fields?: Record<string, WorkItemUpdateFieldChange>
}
```

- [ ] **Step 2: Run typecheck**

Run: `bun run typecheck` in `apps/api`
Expected: PASS (no type errors)

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/contexts/standups/worker/azure-devops/types.ts
git commit -m "feat: add board activity types to azure-devops module"
```

---

### Task 2: REST client — tests

**Files:**
- Create: `apps/api/src/contexts/standups/worker/azure-devops/azure-devops-rest-client.service.spec.ts`

- [ ] **Step 1: Write failing tests for the REST client**

```ts
// apps/api/src/contexts/standups/worker/azure-devops/azure-devops-rest-client.service.spec.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AzureDevopsRestClientService } from './azure-devops-rest-client.service'

const mockFetch = vi.fn()

function makeService(org = 'my-org', pat = 'my-pat') {
  const runtimeConfig = {
    config: {
      AZURE_DEVOPS_ORG: org,
      AZURE_DEVOPS_PAT: pat,
    },
  }
  return new AzureDevopsRestClientService(runtimeConfig as never)
}

describe('AzureDevopsRestClientService', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('queryWorkItems', () => {
    it('returns work item IDs from a WIQL query', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          workItems: [{ id: 100 }, { id: 200 }, { id: 300 }],
        }),
      })

      const service = makeService()
      const result = await service.queryWorkItems('AGROTRACE', "SELECT [System.Id] FROM WorkItems WHERE [System.ChangedBy] = 'Bruno'")

      expect(result.isOk()).toBe(true)
      if (result.isOk()) {
        expect(result.value).toEqual([100, 200, 300])
      }

      expect(mockFetch).toHaveBeenCalledWith(
        'https://dev.azure.com/my-org/AGROTRACE/_apis/wit/wiql?api-version=7.1',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
        }),
      )
    })

    it('returns ExternalServiceError on non-ok response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
      })

      const service = makeService()
      const result = await service.queryWorkItems('AGROTRACE', 'SELECT [System.Id] FROM WorkItems')

      expect(result.isErr()).toBe(true)
      if (result.isErr()) {
        expect(result.error.service).toBe('azure-devops')
      }
    })

    it('returns empty array when no work items match', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ workItems: [] }),
      })

      const service = makeService()
      const result = await service.queryWorkItems('AGROTRACE', 'SELECT [System.Id] FROM WorkItems')

      expect(result.isOk()).toBe(true)
      if (result.isOk()) {
        expect(result.value).toEqual([])
      }
    })
  })

  describe('getWorkItemsBatch', () => {
    it('returns work item details for given IDs', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          value: [
            { id: 100, fields: { 'System.Title': 'Fix bug' } },
            { id: 200, fields: { 'System.Title': 'Add feature' } },
          ],
        }),
      })

      const service = makeService()
      const result = await service.getWorkItemsBatch([100, 200], ['System.Title'])

      expect(result.isOk()).toBe(true)
      if (result.isOk()) {
        expect(result.value).toHaveLength(2)
        expect(result.value[0].id).toBe(100)
      }
    })

    it('handles empty IDs array', async () => {
      const service = makeService()
      const result = await service.getWorkItemsBatch([], ['System.Title'])

      expect(result.isOk()).toBe(true)
      if (result.isOk()) {
        expect(result.value).toEqual([])
      }
      expect(mockFetch).not.toHaveBeenCalled()
    })
  })

  describe('getWorkItemUpdates', () => {
    it('returns update history for a work item', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          value: [
            {
              id: 1,
              rev: 1,
              revisedDate: '2026-03-16T10:00:00Z',
              revisedBy: { displayName: 'Bruno' },
              fields: {
                'System.State': { oldValue: 'To Do', newValue: 'In Progress' },
              },
            },
          ],
        }),
      })

      const service = makeService()
      const result = await service.getWorkItemUpdates(100)

      expect(result.isOk()).toBe(true)
      if (result.isOk()) {
        expect(result.value).toHaveLength(1)
        expect(result.value[0].revisedBy.displayName).toBe('Bruno')
      }
    })

    it('returns ExternalServiceError on fetch failure', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'))

      const service = makeService()
      const result = await service.getWorkItemUpdates(100)

      expect(result.isErr()).toBe(true)
    })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun run test -- --reporter=verbose azure-devops-rest-client` in `apps/api`
Expected: FAIL — module `./azure-devops-rest-client.service` not found

- [ ] **Step 3: Commit failing tests**

```bash
git add apps/api/src/contexts/standups/worker/azure-devops/azure-devops-rest-client.service.spec.ts
git commit -m "test: add failing tests for AzureDevopsRestClientService"
```

---

### Task 3: REST client — implementation

**Files:**
- Create: `apps/api/src/contexts/standups/worker/azure-devops/azure-devops-rest-client.service.ts`

- [ ] **Step 1: Implement the REST client**

```ts
// apps/api/src/contexts/standups/worker/azure-devops/azure-devops-rest-client.service.ts
import { Injectable } from '@nestjs/common'
import { ExternalServiceError, Result } from '../../../../shared/domain'
import { WorkerRuntimeConfigService } from '../worker-runtime-config.service'
import type { WorkItemResponse, WorkItemUpdate } from './types'

@Injectable()
export class AzureDevopsRestClientService {
  private readonly baseUrl: string
  private readonly authHeader: string

  constructor(private readonly runtimeConfig: WorkerRuntimeConfigService) {
    const config = this.runtimeConfig.config
    this.baseUrl = `https://dev.azure.com/${config.AZURE_DEVOPS_ORG}`
    this.authHeader = `Basic ${btoa(`:${config.AZURE_DEVOPS_PAT}`)}`
  }

  async queryWorkItems(
    project: string,
    wiql: string,
  ): Promise<Result<number[], ExternalServiceError>> {
    return Result.tryPromise({
      try: async () => {
        const response = await fetch(
          `${this.baseUrl}/${project}/_apis/wit/wiql?api-version=7.1`,
          {
            method: 'POST',
            headers: this.headers(),
            body: JSON.stringify({ query: wiql }),
          },
        )

        this.assertOk(response)
        const data = (await response.json()) as {
          workItems: Array<{ id: number }>
        }
        return data.workItems.map((item) => item.id)
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

        // Azure DevOps limits to 200 IDs per request
        for (let i = 0; i < ids.length; i += 200) {
          const batch = ids.slice(i, i + 200)
          const idsParam = batch.join(',')
          const fieldsParam = fields.join(',')

          const response = await fetch(
            `${this.baseUrl}/_apis/wit/workitems?ids=${idsParam}&fields=${fieldsParam}&api-version=7.1`,
            { headers: this.headers() },
          )

          this.assertOk(response)
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
        const response = await fetch(
          `${this.baseUrl}/_apis/wit/workitems/${id}/updates?api-version=7.1`,
          { headers: this.headers() },
        )

        this.assertOk(response)
        const data = (await response.json()) as {
          value: WorkItemUpdate[]
        }
        return data.value
      },
      catch: (error) => this.toError('getWorkItemUpdates', error),
    })
  }

  private headers(): Record<string, string> {
    return {
      Authorization: this.authHeader,
      'Content-Type': 'application/json',
    }
  }

  private assertOk(response: Response): void {
    if (!response.ok) {
      throw new Error(
        `Azure DevOps REST API returned ${response.status} ${response.statusText}`,
      )
    }
  }

  private toError(
    operation: string,
    error: unknown,
  ): ExternalServiceError {
    return new ExternalServiceError({
      service: 'azure-devops',
      message: `${operation} failed: ${error instanceof Error ? error.message : String(error)}`,
    })
  }
}
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `bun run test -- --reporter=verbose azure-devops-rest-client` in `apps/api`
Expected: ALL PASS

- [ ] **Step 3: Run typecheck**

Run: `bun run typecheck` in `apps/api`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/contexts/standups/worker/azure-devops/azure-devops-rest-client.service.ts
git commit -m "feat: implement AzureDevopsRestClientService"
```

---

### Task 4: Activity collector — tests

**Files:**
- Create: `apps/api/src/contexts/standups/worker/azure-devops/azure-devops-activity-collector.service.spec.ts`

- [ ] **Step 1: Write failing tests for the activity collector**

```ts
// apps/api/src/contexts/standups/worker/azure-devops/azure-devops-activity-collector.service.spec.ts
import { describe, expect, it, vi } from 'vitest'
import { Result } from '../../../../shared/domain'
import { AzureDevopsActivityCollectorService } from './azure-devops-activity-collector.service'
import type { WorkItemResponse, WorkItemUpdate } from './types'

function makeLoggerFactory() {
  return {
    create: vi.fn(() => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    })),
  }
}

function makeRestClient(overrides: Record<string, unknown> = {}) {
  return {
    queryWorkItems: vi.fn().mockResolvedValue(Result.ok([])),
    getWorkItemsBatch: vi.fn().mockResolvedValue(Result.ok([])),
    getWorkItemUpdates: vi.fn().mockResolvedValue(Result.ok([])),
    ...overrides,
  }
}

function makeRuntimeConfig(projects = ['AGROTRACE']) {
  return {
    config: {
      AZURE_DEVOPS_PROJECTS: projects,
    },
  }
}

function workItemResponse(id: number, title: string, type: string, state: string, assignedTo: string, project: string): WorkItemResponse {
  return {
    id,
    fields: {
      'System.Title': title,
      'System.WorkItemType': type,
      'System.State': state,
      'System.AssignedTo': { displayName: assignedTo },
      'System.TeamProject': project,
    },
  }
}

function stateChangeUpdate(displayName: string, date: string, oldState: string, newState: string): WorkItemUpdate {
  return {
    id: 1,
    rev: 2,
    revisedDate: date,
    revisedBy: { displayName },
    fields: {
      'System.State': { oldValue: oldState, newValue: newState },
    },
  }
}

describe('AzureDevopsActivityCollectorService', () => {
  it('returns null when no work items found', async () => {
    const service = new AzureDevopsActivityCollectorService(
      makeLoggerFactory() as never,
      makeRestClient() as never,
      makeRuntimeConfig() as never,
    )

    const result = await service.collect('Bruno Oliveira', '8 hours ago')

    expect(result.isOk()).toBe(true)
    if (result.isOk()) {
      expect(result.value).toBeNull()
    }
  })

  it('collects work items with state change actions', async () => {
    const restClient = makeRestClient({
      queryWorkItems: vi.fn().mockResolvedValue(Result.ok([100])),
      getWorkItemsBatch: vi.fn().mockResolvedValue(
        Result.ok([workItemResponse(100, 'Fix bug', 'Bug', 'In Progress', 'Bruno', 'AGROTRACE')]),
      ),
      getWorkItemUpdates: vi.fn().mockResolvedValue(
        Result.ok([stateChangeUpdate('Bruno Oliveira', '2026-03-16T14:00:00Z', 'To Do', 'In Progress')]),
      ),
    })

    const service = new AzureDevopsActivityCollectorService(
      makeLoggerFactory() as never,
      restClient as never,
      makeRuntimeConfig() as never,
    )

    const result = await service.collect('Bruno Oliveira', '8 hours ago')

    expect(result.isOk()).toBe(true)
    if (result.isOk()) {
      expect(result.value).not.toBeNull()
      expect(result.value!.workItems).toHaveLength(1)
      expect(result.value!.workItems[0].id).toBe(100)
      expect(result.value!.workItems[0].actions).toHaveLength(1)
      expect(result.value!.workItems[0].actions[0].type).toBe('state_change')
    }
  })

  it('filters updates to only those by the configured user', async () => {
    const restClient = makeRestClient({
      queryWorkItems: vi.fn().mockResolvedValue(Result.ok([100])),
      getWorkItemsBatch: vi.fn().mockResolvedValue(
        Result.ok([workItemResponse(100, 'Fix bug', 'Bug', 'Done', 'Bruno', 'AGROTRACE')]),
      ),
      getWorkItemUpdates: vi.fn().mockResolvedValue(
        Result.ok([
          stateChangeUpdate('Bruno Oliveira', '2026-03-16T14:00:00Z', 'To Do', 'In Progress'),
          stateChangeUpdate('Another Person', '2026-03-16T15:00:00Z', 'In Progress', 'Done'),
        ]),
      ),
    })

    const service = new AzureDevopsActivityCollectorService(
      makeLoggerFactory() as never,
      restClient as never,
      makeRuntimeConfig() as never,
    )

    const result = await service.collect('Bruno Oliveira', '8 hours ago')

    expect(result.isOk()).toBe(true)
    if (result.isOk()) {
      expect(result.value!.workItems[0].actions).toHaveLength(1)
      expect(result.value!.workItems[0].actions[0].details).toContain('To Do')
    }
  })

  it('continues to next project when one fails', async () => {
    const queryMock = vi.fn()
      .mockResolvedValueOnce(Result.err({ service: 'azure-devops', message: 'fail' }))
      .mockResolvedValueOnce(Result.ok([200]))

    const restClient = makeRestClient({
      queryWorkItems: queryMock,
      getWorkItemsBatch: vi.fn().mockResolvedValue(
        Result.ok([workItemResponse(200, 'Task', 'Task', 'Done', 'Bruno', 'CHECKMILK')]),
      ),
      getWorkItemUpdates: vi.fn().mockResolvedValue(
        Result.ok([stateChangeUpdate('Bruno Oliveira', '2026-03-16T10:00:00Z', 'New', 'Done')]),
      ),
    })

    const service = new AzureDevopsActivityCollectorService(
      makeLoggerFactory() as never,
      restClient as never,
      makeRuntimeConfig(['AGROTRACE', 'CHECKMILK']) as never,
    )

    const result = await service.collect('Bruno Oliveira', '8 hours ago')

    expect(result.isOk()).toBe(true)
    if (result.isOk()) {
      expect(result.value!.workItems).toHaveLength(1)
      expect(result.value!.workItems[0].project).toBe('CHECKMILK')
    }
  })

  it('skips work items with no user actions', async () => {
    const restClient = makeRestClient({
      queryWorkItems: vi.fn().mockResolvedValue(Result.ok([100])),
      getWorkItemsBatch: vi.fn().mockResolvedValue(
        Result.ok([workItemResponse(100, 'Fix bug', 'Bug', 'Done', 'Bruno', 'AGROTRACE')]),
      ),
      getWorkItemUpdates: vi.fn().mockResolvedValue(
        Result.ok([stateChangeUpdate('Another Person', '2026-03-16T14:00:00Z', 'To Do', 'Done')]),
      ),
    })

    const service = new AzureDevopsActivityCollectorService(
      makeLoggerFactory() as never,
      restClient as never,
      makeRuntimeConfig() as never,
    )

    const result = await service.collect('Bruno Oliveira', '8 hours ago')

    expect(result.isOk()).toBe(true)
    if (result.isOk()) {
      expect(result.value).toBeNull()
    }
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun run test -- --reporter=verbose azure-devops-activity-collector` in `apps/api`
Expected: FAIL — module not found

- [ ] **Step 3: Commit failing tests**

```bash
git add apps/api/src/contexts/standups/worker/azure-devops/azure-devops-activity-collector.service.spec.ts
git commit -m "test: add failing tests for AzureDevopsActivityCollectorService"
```

---

### Task 5: Activity collector — implementation

**Files:**
- Create: `apps/api/src/contexts/standups/worker/azure-devops/azure-devops-activity-collector.service.ts`

- [ ] **Step 1: Implement the activity collector**

```ts
// apps/api/src/contexts/standups/worker/azure-devops/azure-devops-activity-collector.service.ts
import { Injectable } from '@nestjs/common'
import { ExternalServiceError, Result } from '../../../../shared/domain'
import { AppLoggerFactory } from '../../../../platform/logger'
import { WorkerRuntimeConfigService } from '../worker-runtime-config.service'
import { AzureDevopsRestClientService } from './azure-devops-rest-client.service'
import type {
  BoardAction,
  BoardActionType,
  BoardWorkItemActivity,
  GatheredBoardActivity,
  WorkItemResponse,
  WorkItemUpdate,
  WorkItemUpdateFieldChange,
} from './types'

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
  ): Promise<Result<GatheredBoardActivity | null, ExternalServiceError>> {
    const projects = this.runtimeConfig.config.AZURE_DEVOPS_PROJECTS

    const allWorkItems: BoardWorkItemActivity[] = []

    for (const project of projects) {
      const projectResult = await this.collectForProject(
        project,
        azureDevopsUser,
        sincePeriod,
      )

      if (projectResult.isErr()) {
        this.logger.warn(
          `Failed to collect board activity for project ${project}`,
          { error: projectResult.error.message },
        )
        continue
      }

      allWorkItems.push(...projectResult.value)
    }

    if (allWorkItems.length === 0) {
      return Result.ok(null)
    }

    return Result.ok({
      timestamp: new Date().toISOString(),
      workItems: allWorkItems,
    })
  }

  private async collectForProject(
    project: string,
    azureDevopsUser: string,
    sincePeriod: string,
  ): Promise<Result<BoardWorkItemActivity[], ExternalServiceError>> {
    const sinceDate = this.resolveSinceDate(sincePeriod)

    const wiql = `SELECT [System.Id] FROM WorkItems WHERE [System.ChangedBy] = '${azureDevopsUser}' AND [System.ChangedDate] >= '${sinceDate}' AND [System.TeamProject] = '${project}' ORDER BY [System.ChangedDate] DESC`

    const idsResult = await this.restClient.queryWorkItems(project, wiql)
    if (idsResult.isErr()) {
      return idsResult
    }

    const ids = idsResult.value
    if (ids.length === 0) {
      return Result.ok([])
    }

    const fields = [
      'System.Title',
      'System.WorkItemType',
      'System.State',
      'System.AssignedTo',
      'System.TeamProject',
    ]

    const detailsResult = await this.restClient.getWorkItemsBatch(ids, fields)
    if (detailsResult.isErr()) {
      return detailsResult
    }

    const workItems: BoardWorkItemActivity[] = []

    for (const item of detailsResult.value) {
      const updatesResult = await this.restClient.getWorkItemUpdates(item.id)
      if (updatesResult.isErr()) {
        this.logger.warn(`Failed to get updates for work item ${item.id}`, {
          error: updatesResult.error.message,
        })
        continue
      }

      const actions = this.extractUserActions(
        updatesResult.value,
        azureDevopsUser,
        sinceDate,
      )

      if (actions.length === 0) {
        continue
      }

      workItems.push({
        id: item.id,
        title: String(item.fields['System.Title'] ?? ''),
        type: String(item.fields['System.WorkItemType'] ?? ''),
        state: String(item.fields['System.State'] ?? ''),
        assignedTo: this.extractDisplayName(item.fields['System.AssignedTo']),
        project: String(item.fields['System.TeamProject'] ?? project),
        actions,
      })
    }

    return Result.ok(workItems)
  }

  private extractUserActions(
    updates: WorkItemUpdate[],
    azureDevopsUser: string,
    sinceDate: string,
  ): BoardAction[] {
    const actions: BoardAction[] = []
    const sinceDateMs = new Date(sinceDate).getTime()

    for (const update of updates) {
      if (update.revisedBy.displayName !== azureDevopsUser) {
        continue
      }

      if (new Date(update.revisedDate).getTime() < sinceDateMs) {
        continue
      }

      if (!update.fields) {
        continue
      }

      const extractedActions = this.classifyFieldChanges(
        update.fields,
        update.revisedDate,
      )
      actions.push(...extractedActions)
    }

    return actions
  }

  private classifyFieldChanges(
    fields: Record<string, WorkItemUpdateFieldChange>,
    timestamp: string,
  ): BoardAction[] {
    const actions: BoardAction[] = []

    if (fields['System.State']) {
      const change = fields['System.State']
      actions.push({
        type: 'state_change',
        timestamp,
        details: `State: ${String(change.oldValue ?? '(none)')} -> ${String(change.newValue ?? '(none)')}`,
      })
    }

    if (fields['System.AssignedTo']) {
      const change = fields['System.AssignedTo']
      const newAssignee = this.extractDisplayName(change.newValue)
      actions.push({
        type: 'assigned',
        timestamp,
        details: `Assigned to ${newAssignee}`,
      })
    }

    if (fields['System.History']) {
      actions.push({
        type: 'commented',
        timestamp,
        details: 'Comment added',
      })
    }

    // Revision 1 with System.CreatedBy means item was created
    if (fields['System.CreatedBy']) {
      actions.push({
        type: 'created',
        timestamp,
        details: 'Work item created',
      })
    }

    // Other notable fields
    for (const fieldName of Object.keys(fields)) {
      if (
        fieldName === 'System.State' ||
        fieldName === 'System.AssignedTo' ||
        fieldName === 'System.History' ||
        fieldName === 'System.CreatedBy' ||
        fieldName.startsWith('System.Revised') ||
        fieldName === 'System.ChangedDate' ||
        fieldName === 'System.ChangedBy' ||
        fieldName === 'System.AuthorizedDate' ||
        fieldName === 'System.Watermark' ||
        fieldName === 'System.Rev'
      ) {
        continue
      }

      const change = fields[fieldName]
      if (change.oldValue !== undefined || change.newValue !== undefined) {
        const shortName = fieldName.replace(/^System\./, '').replace(/^Microsoft\.VSTS\.Common\./, '')
        actions.push({
          type: 'field_changed',
          timestamp,
          details: `${shortName}: ${String(change.oldValue ?? '(none)')} -> ${String(change.newValue ?? '(none)')}`,
        })
      }
    }

    return actions
  }

  private extractDisplayName(value: unknown): string {
    if (typeof value === 'string') return value
    if (value && typeof value === 'object' && 'displayName' in value) {
      return String((value as { displayName: unknown }).displayName)
    }
    return ''
  }

  private resolveSinceDate(sincePeriod: string): string {
    const match = sincePeriod.match(/^(\d+)\s+hours?\s+ago$/i)
    if (match) {
      const hours = Number.parseInt(match[1], 10)
      const since = new Date(Date.now() - hours * 60 * 60 * 1000)
      return since.toISOString()
    }
    // Fallback: 8 hours ago
    const since = new Date(Date.now() - 8 * 60 * 60 * 1000)
    return since.toISOString()
  }
}
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `bun run test -- --reporter=verbose azure-devops-activity-collector` in `apps/api`
Expected: ALL PASS

- [ ] **Step 3: Run typecheck**

Run: `bun run typecheck` in `apps/api`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/contexts/standups/worker/azure-devops/azure-devops-activity-collector.service.ts
git commit -m "feat: implement AzureDevopsActivityCollectorService"
```

---

### Task 6: Update azure-devops module registration

**Files:**
- Modify: `apps/api/src/contexts/standups/worker/azure-devops/azure-devops.module.ts`

- [ ] **Step 1: Register new providers in the module**

```ts
// apps/api/src/contexts/standups/worker/azure-devops/azure-devops.module.ts
import { Module } from '@nestjs/common'
import { WorkerRuntimeConfigModule } from '../worker-runtime-config.module'
import { AzureDevopsActivityCollectorService } from './azure-devops-activity-collector.service'
import { AzureDevopsEnrichmentService } from './azure-devops-enrichment.service'
import { AzureDevopsMcpClientService } from './azure-devops-mcp-client.service'
import { AzureDevopsRestClientService } from './azure-devops-rest-client.service'

@Module({
  imports: [WorkerRuntimeConfigModule],
  providers: [
    AzureDevopsMcpClientService,
    AzureDevopsEnrichmentService,
    AzureDevopsRestClientService,
    AzureDevopsActivityCollectorService,
  ],
  exports: [
    AzureDevopsMcpClientService,
    AzureDevopsEnrichmentService,
    AzureDevopsRestClientService,
    AzureDevopsActivityCollectorService,
  ],
})
export class AzureDevopsModule {}
```

- [ ] **Step 2: Run typecheck**

Run: `bun run typecheck` in `apps/api`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/contexts/standups/worker/azure-devops/azure-devops.module.ts
git commit -m "feat: register REST client and activity collector in AzureDevopsModule"
```

---

## Chunk 2: Domain Types, Schemas, and Source Data Parsing

### Task 7: Update domain types and schemas

**Files:**
- Modify: `apps/api/src/shared/domain/types.ts`
- Modify: `apps/api/src/shared/domain/schemas.ts`

- [ ] **Step 1: Add board activity types directly to `shared/domain/types.ts`**

Board activity types are pure data interfaces with no NestJS or context-specific dependencies. They belong in shared/domain, not re-exported from a context module. Append after the existing `GatheredGitActivity` interface:

```ts
// apps/api/src/shared/domain/types.ts
// (append after GatheredGitActivity, around line 53)

export type BoardActionType =
  | 'created'
  | 'state_change'
  | 'assigned'
  | 'commented'
  | 'field_changed'

export interface BoardAction {
  type: BoardActionType
  timestamp: string
  details: string
}

export interface BoardWorkItemActivity {
  id: number
  title: string
  type: string
  state: string
  assignedTo: string
  project: string
  actions: BoardAction[]
}

export interface GatheredBoardActivity {
  timestamp: string
  workItems: BoardWorkItemActivity[]
}

export interface StandupSourceData {
  git: GatheredGitActivity | null
  board: GatheredBoardActivity | null
}
```

- [ ] **Step 2: Update `GenerateStandupInput` to make `gitActivity` optional and add `boardActivity`**

In the same file, change `GenerateStandupInput`:

```ts
// BEFORE (line 55-60):
export interface GenerateStandupInput {
  date: string
  meetingType: string
  gitActivity: GatheredGitActivity
  extraContext?: string
}

// AFTER:
export interface GenerateStandupInput {
  date: string
  meetingType: string
  gitActivity?: GatheredGitActivity
  boardActivity?: GatheredBoardActivity
  extraContext?: string
}
```

- [ ] **Step 3: Update the azure-devops/types.ts to re-export from shared domain**

In `apps/api/src/contexts/standups/worker/azure-devops/types.ts`, the board types added in Task 1 should now re-export from shared/domain to avoid duplication:

```ts
// At end of apps/api/src/contexts/standups/worker/azure-devops/types.ts
// Replace the board types added in Task 1 with re-exports:
export type {
  BoardActionType,
  BoardAction,
  BoardWorkItemActivity,
  GatheredBoardActivity,
} from '../../../../shared/domain'

// Keep WorkItemResponse and WorkItemUpdate here (REST API-specific types)
```

- [ ] **Step 4: Update Zod schemas**

In `apps/api/src/shared/domain/schemas.ts`, extract `GitActivitySchema`, make `gitActivity` optional, and add board schemas:

```ts
// BEFORE (line 54-79):
export const GenerateStandupInputSchema = z.object({
  date: z.string().min(10),
  meetingType: z.string().min(1),
  gitActivity: z.object({
    timestamp: z.string().datetime(),
    repos: z.array(
      z.object({
        repoName: z.string().min(1),
        repoPath: z.string().min(1),
        commits: z.array(
          z.object({
            hash: z.string().min(1),
            subject: z.string().min(1),
            body: z.string(),
            sourceBranch: z.string(),
            filesChanged: z.number().int(),
            insertions: z.number().int(),
            deletions: z.number().int(),
            files: z.array(z.string()),
          }),
        ),
        cardNumbers: z.array(z.string()),
      }),
    ),
  }),
  extraContext: z.string().optional(),
})

// AFTER:
export const GitActivitySchema = z.object({
  timestamp: z.string().datetime(),
  repos: z.array(
    z.object({
      repoName: z.string().min(1),
      repoPath: z.string().min(1),
      commits: z.array(
        z.object({
          hash: z.string().min(1),
          subject: z.string().min(1),
          body: z.string(),
          sourceBranch: z.string(),
          filesChanged: z.number().int(),
          insertions: z.number().int(),
          deletions: z.number().int(),
          files: z.array(z.string()),
        }),
      ),
      cardNumbers: z.array(z.string()),
    }),
  ),
})

export const BoardActionSchema = z.object({
  type: z.enum(['created', 'state_change', 'assigned', 'commented', 'field_changed']),
  timestamp: z.string(),
  details: z.string(),
})

export const GatheredBoardActivitySchema = z.object({
  timestamp: z.string(),
  workItems: z.array(
    z.object({
      id: z.number(),
      title: z.string(),
      type: z.string(),
      state: z.string(),
      assignedTo: z.string(),
      project: z.string(),
      actions: z.array(BoardActionSchema),
    }),
  ),
})

export const StandupSourceDataSchema = z.object({
  git: GitActivitySchema.nullable(),
  board: GatheredBoardActivitySchema.nullable(),
})

export const GenerateStandupInputSchema = z.object({
  date: z.string().min(10),
  meetingType: z.string().min(1),
  gitActivity: GitActivitySchema.optional(),
  boardActivity: GatheredBoardActivitySchema.optional(),
  extraContext: z.string().optional(),
})
```

Note: `GitActivitySchema` is exported (not `const`) so it can be used by `parseSourceData`.

- [ ] **Step 5: Update barrel export**

Check `apps/api/src/shared/domain/index.ts` — ensure new schemas and types are exported. Add:

```ts
export { StandupSourceDataSchema, GatheredBoardActivitySchema, BoardActionSchema, GitActivitySchema } from './schemas'
export type { StandupSourceData, GatheredBoardActivity, BoardWorkItemActivity, BoardAction, BoardActionType } from './types'
```

- [ ] **Step 6: Run typecheck**

Run: `bun run typecheck` in `apps/api`
Expected: Likely errors from consumers of `GenerateStandupInput.gitActivity` that assume it's required. These will be fixed in later tasks. Note the errors but do NOT fix them yet.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/shared/domain/types.ts apps/api/src/shared/domain/schemas.ts apps/api/src/shared/domain/index.ts \
  apps/api/src/contexts/standups/worker/azure-devops/types.ts
git commit -m "feat: update domain types and schemas for board activity support"
```

---

### Task 8: Source data parsing utility — tests

**Files:**
- Create: `apps/api/src/shared/domain/parse-source-data.spec.ts`

- [ ] **Step 1: Write tests for parseSourceData**

```ts
// apps/api/src/shared/domain/parse-source-data.spec.ts
import { describe, expect, it } from 'vitest'
import { parseSourceData } from './parse-source-data'

const oldFormatGitActivity = {
  timestamp: '2026-03-16T17:00:00Z',
  repos: [
    {
      repoName: 'my-repo',
      repoPath: '/repos/my-repo',
      commits: [
        {
          hash: 'abc123',
          subject: 'fix bug',
          body: '',
          sourceBranch: 'feature/1234-fix',
          filesChanged: 1,
          insertions: 5,
          deletions: 2,
          files: ['src/app.ts'],
        },
      ],
      cardNumbers: ['1234'],
    },
  ],
}

const newFormatSourceData = {
  git: oldFormatGitActivity,
  board: {
    timestamp: '2026-03-16T17:00:00Z',
    workItems: [
      {
        id: 5678,
        title: 'Implement feature',
        type: 'Task',
        state: 'In Progress',
        assignedTo: 'Bruno',
        project: 'AGROTRACE',
        actions: [
          { type: 'state_change' as const, timestamp: '2026-03-16T14:00:00Z', details: 'State: To Do -> In Progress' },
        ],
      },
    ],
  },
}

describe('parseSourceData', () => {
  it('parses old format (raw GatheredGitActivity) into { git, board: null }', () => {
    const result = parseSourceData(JSON.stringify(oldFormatGitActivity))

    expect(result.isOk()).toBe(true)
    if (result.isOk()) {
      expect(result.value.git).not.toBeNull()
      expect(result.value.git!.repos).toHaveLength(1)
      expect(result.value.board).toBeNull()
    }
  })

  it('parses new format { git, board }', () => {
    const result = parseSourceData(JSON.stringify(newFormatSourceData))

    expect(result.isOk()).toBe(true)
    if (result.isOk()) {
      expect(result.value.git).not.toBeNull()
      expect(result.value.board).not.toBeNull()
      expect(result.value.board!.workItems).toHaveLength(1)
    }
  })

  it('parses board-only format { git: null, board }', () => {
    const boardOnly = { git: null, board: newFormatSourceData.board }
    const result = parseSourceData(JSON.stringify(boardOnly))

    expect(result.isOk()).toBe(true)
    if (result.isOk()) {
      expect(result.value.git).toBeNull()
      expect(result.value.board).not.toBeNull()
    }
  })

  it('returns error for invalid JSON', () => {
    const result = parseSourceData('not json')

    expect(result.isErr()).toBe(true)
  })

  it('returns error for empty object', () => {
    const result = parseSourceData('{}')

    // {} has no 'git' or 'board' key and is not valid old-format either
    expect(result.isErr()).toBe(true)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun run test -- --reporter=verbose parse-source-data` in `apps/api`
Expected: FAIL

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/shared/domain/parse-source-data.spec.ts
git commit -m "test: add failing tests for parseSourceData utility"
```

---

### Task 9: Source data parsing utility — implementation

**Files:**
- Create: `apps/api/src/shared/domain/parse-source-data.ts`

- [ ] **Step 1: Implement parseSourceData**

```ts
// apps/api/src/shared/domain/parse-source-data.ts
import { Result } from 'better-result'
import { ValidationError } from './errors'
import type { StandupSourceData } from './types'
import { GitActivitySchema, StandupSourceDataSchema } from './schemas'

export function parseSourceData(
  raw: string,
): Result<StandupSourceData, ValidationError> {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return Result.err(
      new ValidationError({
        field: 'sourceData',
        message: 'Stored sourceData is not valid JSON',
      }),
    )
  }

  if (
    parsed !== null &&
    typeof parsed === 'object' &&
    ('git' in parsed || 'board' in parsed)
  ) {
    const validated = StandupSourceDataSchema.safeParse(parsed)
    if (!validated.success) {
      return Result.err(
        new ValidationError({
          field: 'sourceData',
          message: `Invalid sourceData (new format): ${validated.error.message}`,
        }),
      )
    }
    return Result.ok(validated.data as StandupSourceData)
  }

  // Old format: raw GatheredGitActivity — use GitActivitySchema directly
  // (NOT GenerateStandupInputSchema.shape.gitActivity which is now optional)
  const gitValidated = GitActivitySchema.safeParse(parsed)
  if (!gitValidated.success) {
    return Result.err(
      new ValidationError({
        field: 'sourceData',
        message: 'Stored sourceData is invalid and cannot be reused',
      }),
    )
  }

  return Result.ok({ git: gitValidated.data, board: null } as StandupSourceData)
}
```

- [ ] **Step 2: Export from domain barrel**

Add to `apps/api/src/shared/domain/index.ts`:

```ts
export { parseSourceData } from './parse-source-data'
```

- [ ] **Step 3: Run tests to verify they pass**

Run: `bun run test -- --reporter=verbose parse-source-data` in `apps/api`
Expected: ALL PASS

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/shared/domain/parse-source-data.ts apps/api/src/shared/domain/index.ts
git commit -m "feat: implement parseSourceData for dual-format backward compatibility"
```

---

## Chunk 3: Database, Settings, and Dispatch Changes

### Task 10: Database schema — add `azure_devops_user` column

**Files:**
- Modify: `apps/api/src/platform/database/schema.ts`

- [ ] **Step 1: Add column to userSettings table**

In `apps/api/src/platform/database/schema.ts`, add after `gitAuthor` (line ~120):

```ts
// Add after gitAuthor line:
  azureDevopsUser: text('azure_devops_user'),
```

- [ ] **Step 2: Generate migration**

Run: `bun run db:generate` in `apps/api`
Expected: New migration SQL file created in `drizzle/` with `ALTER TABLE user_settings ADD COLUMN azure_devops_user TEXT`

- [ ] **Step 3: Apply migration**

Run: `bun run db:migrate` in `apps/api`
Expected: Migration applied successfully

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/platform/database/schema.ts apps/api/drizzle/
git commit -m "feat: add azure_devops_user column to user_settings"
```

---

### Task 11: Update `PutMeSettingsDto` and `MeSettingsRecord`

**Files:**
- Modify: `apps/api/src/contexts/preferences/me/me-settings.dto.ts`

- [ ] **Step 1: Relax validations and add new field**

Replace the full file content:

```ts
// apps/api/src/contexts/preferences/me/me-settings.dto.ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator'

export class PutMeSettingsDto {
  @ApiProperty()
  @IsString()
  @MinLength(1, { message: 'standupCron is required' })
  standupCron!: string

  @ApiProperty()
  @IsString()
  @MinLength(1, { message: 'reminderCron is required' })
  reminderCron!: string

  @ApiProperty()
  @IsString()
  @MinLength(1, { message: 'recoveryCron is required' })
  recoveryCron!: string

  @ApiProperty()
  @IsString()
  @MinLength(1, { message: 'timezone is required' })
  timezone!: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  gitAuthor?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1, { message: 'gitSincePeriod is required' })
  gitSincePeriod?: string

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true, message: 'selectedRepos entries must be non-empty' })
  selectedRepos?: string[]

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  azureDevopsUser?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  active?: boolean

  @ApiPropertyOptional({ enum: ['light', 'dark'] })
  @IsOptional()
  @IsIn(['light', 'dark'])
  emailTheme?: 'light' | 'dark'
}

export type MeSettingsRecord = {
  standupCron: string
  reminderCron: string
  recoveryCron: string
  timezone: string
  gitAuthor: string
  gitSincePeriod: string
  selectedRepos: string[]
  azureDevopsUser: string | null
  active: boolean
  emailTheme: 'light' | 'dark'
  snoozedUntil: number | null
  cancelledDate: string | null
}
```

- [ ] **Step 2: Run typecheck**

Run: `bun run typecheck` in `apps/api`
Expected: Errors in `MeSettingsService` due to new `azureDevopsUser` field in `MeSettingsRecord`. Fix in next step.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/contexts/preferences/me/me-settings.dto.ts
git commit -m "feat: relax DTO validations and add azureDevopsUser field"
```

---

### Task 12: Update `MeSettingsService`

**Files:**
- Modify: `apps/api/src/contexts/preferences/me/me-settings.service.ts`

- [ ] **Step 1: Add `azureDevopsUser` to get/put and add cross-field validation**

In `get()`, add `azureDevopsUser` to the returned record (both default and from-db paths):

```ts
// In createDefaultSettings(), add:
  azureDevopsUser: null,

// In DEFAULT_SETTINGS, add:
  azureDevopsUser: null,
```

In the `get()` method's return from DB, add:
```ts
  azureDevopsUser: result.value.azureDevopsUser ?? null,
```

In `put()`, add cross-field validation before the upsert:
```ts
    const hasGitSource = (body.gitAuthor?.trim() ?? '').length > 0 && (body.selectedRepos ?? []).length > 0
    const hasBoardSource = (body.azureDevopsUser?.trim() ?? '').length > 0
    if (!hasGitSource && !hasBoardSource) {
      throw new BadRequestException(
        'At least one data source must be configured: git repos with git author, or Azure DevOps user',
      )
    }
```

Add `BadRequestException` to the NestJS imports.

In the upsert call, add:
```ts
      azureDevopsUser: body.azureDevopsUser?.trim() || null,
```

In the return from `put()`, add:
```ts
  azureDevopsUser: result.value.azureDevopsUser ?? null,
```

- [ ] **Step 2: Run typecheck**

Run: `bun run typecheck` in `apps/api`
Expected: PASS (or note remaining errors for other consumers)

- [ ] **Step 3: Update existing tests**

In `apps/api/src/contexts/preferences/me/me-settings.service.spec.ts`, update test fixtures to include `azureDevopsUser` where `MeSettingsRecord` is expected.

- [ ] **Step 4: Run tests**

Run: `bun run test -- --reporter=verbose me-settings` in `apps/api`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/contexts/preferences/me/me-settings.service.ts apps/api/src/contexts/preferences/me/me-settings.service.spec.ts
git commit -m "feat: add azureDevopsUser to settings service with cross-field validation"
```

---

### Task 13: Update `StandupJobOptions` and `StandupDispatchService`

**Files:**
- Modify: `apps/api/src/contexts/standups/worker/standup/types.ts`
- Modify: `apps/api/src/contexts/standups/worker/standup/standup-dispatch.service.ts`
- Modify: `apps/api/src/contexts/standups/worker/standup/standup-dispatch.service.spec.ts`

- [ ] **Step 1: Add `azureDevopsUser` to `StandupJobOptions`**

In `apps/api/src/contexts/standups/worker/standup/types.ts`, add after `gitAuthor`:

```ts
  azureDevopsUser?: string
```

- [ ] **Step 2: Add `collecting_board` to `StrategyProgressStep`**

In the same file, update:

```ts
// BEFORE:
export type StrategyProgressStep =
  | 'collecting_git'
  | 'enriching_data'
  | 'generating_standup'

// AFTER:
export type StrategyProgressStep =
  | 'collecting_git'
  | 'collecting_board'
  | 'enriching_data'
  | 'generating_standup'
```

- [ ] **Step 3: Update `StandupStrategyBase` to accept `collecting_board`**

In `apps/api/src/contexts/standups/worker/standup/strategies/standup-strategy.base.ts`:

```ts
// BEFORE:
  protected async reportStage(
    reportProgress: StrategyExecutionInput['reportProgress'],
    step: 'collecting_git' | 'enriching_data' | 'generating_standup',
    message: string,
  ): Promise<void> {

// AFTER:
  protected async reportStage(
    reportProgress: StrategyExecutionInput['reportProgress'],
    step: 'collecting_git' | 'collecting_board' | 'enriching_data' | 'generating_standup',
    message: string,
  ): Promise<void> {
```

- [ ] **Step 4: Update `StandupDispatchService` validation**

In `apps/api/src/contexts/standups/worker/standup/standup-dispatch.service.ts`, replace the `selectedRepos.length === 0` check (lines 70-78):

```ts
// BEFORE:
    const selectedRepos = parseSelectedRepos(settingsResult.value.selectedRepos)
    if (selectedRepos.length === 0) {
      return Result.err(
        new ValidationError({
          field: 'selectedRepos',
          message: 'No repositories selected',
        }),
      )
    }

// AFTER:
    const selectedRepos = parseSelectedRepos(settingsResult.value.selectedRepos)
    const azureDevopsUser = settingsResult.value.azureDevopsUser?.trim() || ''

    if (selectedRepos.length === 0 && !azureDevopsUser) {
      return Result.err(
        new ValidationError({
          field: 'sources',
          message: 'At least one data source must be configured (git repos or Azure DevOps user)',
        }),
      )
    }
```

And update the return to include `azureDevopsUser`:

```ts
    return Result.ok({
      userId,
      discordUserId: discordResult.value,
      selectedRepos,
      gitAuthor: settingsResult.value.gitAuthor,
      azureDevopsUser: azureDevopsUser || undefined,
      timezone: settingsResult.value.timezone,
      gitSincePeriod: settingsResult.value.gitSincePeriod,
    })
```

- [ ] **Step 5: Update dispatch service tests**

In `standup-dispatch.service.spec.ts`, update the existing "empty repos" test and add new tests:

```ts
  // REPLACE the existing "returns validation error when selected repos are empty" test:
  it('returns validation error when no sources configured', async () => {
    const service = new StandupDispatchService(
      makeLoggerFactory() as never,
      {
        findDiscordIdByUserId: vi
          .fn()
          .mockResolvedValue(Result.ok('discord-1')),
      } as never,
      {
        findByUserId: vi.fn().mockResolvedValue(
          Result.ok({
            selectedRepos: '[]',
            gitAuthor: '',
            azureDevopsUser: null,
            timezone: 'America/Sao_Paulo',
            gitSincePeriod: '8 hours ago',
          }),
        ),
      } as never,
      { run: vi.fn() } as never,
    )

    const result = await service.dispatchStandupJobForUser('user-1')

    expect(result.isErr()).toBe(true)
    if (result.isErr()) {
      expect(result.error.message).toContain('At least one data source')
    }
  })

  // ADD new test:
  it('dispatches board-only job when azureDevopsUser is set but no repos', async () => {
    const run = vi.fn().mockResolvedValue(undefined)
    const service = new StandupDispatchService(
      makeLoggerFactory() as never,
      {
        findDiscordIdByUserId: vi
          .fn()
          .mockResolvedValue(Result.ok('discord-1')),
      } as never,
      {
        findByUserId: vi.fn().mockResolvedValue(
          Result.ok({
            selectedRepos: '[]',
            gitAuthor: '',
            azureDevopsUser: 'Bruno Oliveira',
            timezone: 'America/Sao_Paulo',
            gitSincePeriod: '8 hours ago',
          }),
        ),
      } as never,
      { run } as never,
    )

    const result = await service.dispatchStandupJobForUser('user-1')

    expect(result.isOk()).toBe(true)
    expect(run).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        selectedRepos: [],
        azureDevopsUser: 'Bruno Oliveira',
      }),
    )
  })
```

Also update the existing success test to include `azureDevopsUser` in the settings fixture and verify it's passed through.

- [ ] **Step 6: Run tests**

Run: `bun run test -- --reporter=verbose standup-dispatch` in `apps/api`
Expected: ALL PASS

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/contexts/standups/worker/standup/types.ts \
  apps/api/src/contexts/standups/worker/standup/strategies/standup-strategy.base.ts \
  apps/api/src/contexts/standups/worker/standup/standup-dispatch.service.ts \
  apps/api/src/contexts/standups/worker/standup/standup-dispatch.service.spec.ts
git commit -m "feat: update StandupJobOptions and dispatch for board-only users"
```

---

### Task 14: Update SSE event types

**Files:**
- Modify: `apps/api/src/platform/events/standup-events.ts`
- Modify: `apps/api/src/contexts/standups/events/standup-sse.types.ts`
- Modify: `apps/web/src/app/shared/models/standup-models.ts`

- [ ] **Step 1: Add `collecting_board` to `StandupProgressStep` in standup-events.ts**

```ts
// BEFORE (line 14-22):
export type StandupProgressStep =
  | 'queued'
  | 'collecting_git'
  | 'enriching_data'
  | 'generating_standup'
  | 'saving_draft'
  | 'notifying_review'
  | 'completed'
  | 'no_activity'

// AFTER:
export type StandupProgressStep =
  | 'queued'
  | 'collecting_git'
  | 'collecting_board'
  | 'enriching_data'
  | 'generating_standup'
  | 'saving_draft'
  | 'notifying_review'
  | 'completed'
  | 'no_activity'
```

- [ ] **Step 2: Add `collecting_board` to SSE types**

In `apps/api/src/contexts/standups/events/standup-sse.types.ts`, add `'collecting_board'` to the step union in the `standup_progress` variant (after `'collecting_git'`).

- [ ] **Step 3: Add `collecting_board` to web models**

In `apps/web/src/app/shared/models/standup-models.ts`, add `'collecting_board'` to the `StandupProgressStep` type (after `'collecting_git'`).

- [ ] **Step 4: Run typecheck for both apps**

Run: `bun run typecheck` in `apps/api` and `apps/web`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/platform/events/standup-events.ts \
  apps/api/src/contexts/standups/events/standup-sse.types.ts \
  apps/web/src/app/shared/models/standup-models.ts
git commit -m "feat: add collecting_board SSE progress step across api and web"
```

---

## Chunk 4: Pipeline, Strategy, Prompt, and Generator Changes

### Task 15: Update `ExecuteGenerateStrategy` to support dual collectors

**Files:**
- Modify: `apps/api/src/contexts/standups/worker/standup/strategies/execute-generate-strategy.ts`

- [ ] **Step 1: Inject `AzureDevopsActivityCollectorService` and orchestrate both collectors**

Replace the full file:

```ts
// apps/api/src/contexts/standups/worker/standup/strategies/execute-generate-strategy.ts
import { Injectable } from '@nestjs/common'
import { Span } from 'nestjs-otel'
import { AppLoggerFactory } from '../../../../../platform/logger'
import { AppTracingService } from '../../../../../platform/observability/app-tracing.service'
import type { GatheredGitActivity } from '../../../../../shared/domain'
import { Result } from '../../../../../shared/domain'
import { AzureDevopsActivityCollectorService } from '../../azure-devops/azure-devops-activity-collector.service'
import type { GatheredBoardActivity } from '../../azure-devops/types'
import { GitCollectorService } from '../../git-collector/git-collector.service'
import { StandupGeneratorService } from '../../standup-generator/standup-generator.service'
import type {
  GeneratedContent,
  StrategyExecutionInput,
  StrategyResult,
} from '../types'
import { StandupStrategyBase } from './standup-strategy.base'

@Injectable()
export class ExecuteGenerateStrategy extends StandupStrategyBase {
  private readonly logger: ReturnType<AppLoggerFactory['create']>
  constructor(
    private readonly loggerFactory: AppLoggerFactory,
    private readonly gitCollector: GitCollectorService,
    private readonly boardCollector: AzureDevopsActivityCollectorService,
    private readonly standupGenerator: StandupGeneratorService,
    private readonly tracing: AppTracingService,
  ) {
    super()
    this.logger = this.loggerFactory.create('generate-strategy')
  }

  @Span('worker.standup.generate.execute')
  async execute(input: StrategyExecutionInput): Promise<StrategyResult> {
    const { options, today, reportProgress } = input

    const hasGitSource =
      options.selectedRepos.length > 0 && options.gitAuthor.trim().length > 0
    const hasBoardSource = !!options.azureDevopsUser?.trim()

    // Collect from active sources
    let gitActivity: GatheredGitActivity | null = null
    let boardActivity: GatheredBoardActivity | null = null

    if (hasGitSource) {
      await this.reportStage(
        reportProgress,
        'collecting_git',
        'Coletando commits dos repositorios',
      )

      const gitResult = await this.tracing.withSpan(
        'standup.git.collect',
        {
          'git.author': options.gitAuthor,
          'git.repos': options.selectedRepos.length,
        },
        () =>
          this.gitCollector.collect(
            options.selectedRepos,
            options.gitAuthor,
            options.gitSincePeriod ?? '8 hours ago',
          ),
      )

      if (gitResult.isErr()) {
        if (!hasBoardSource) {
          return gitResult
        }
        this.logger.warn('Git collection failed, continuing with board only', {
          error: gitResult.error.message,
        })
      } else if (gitResult.value.repos.length > 0) {
        gitActivity = gitResult.value
      }
    }

    if (hasBoardSource) {
      await this.reportStage(
        reportProgress,
        'collecting_board',
        'Coletando atividade do board do Azure DevOps',
      )

      const boardResult = await this.tracing.withSpan(
        'standup.board.collect',
        { 'board.user': options.azureDevopsUser },
        () =>
          this.boardCollector.collect(
            options.azureDevopsUser!,
            options.gitSincePeriod ?? '8 hours ago',
          ),
      )

      if (boardResult.isErr()) {
        if (!hasGitSource || !gitActivity) {
          return boardResult
        }
        this.logger.warn('Board collection failed, continuing with git only', {
          error: boardResult.error.message,
        })
      } else {
        boardActivity = boardResult.value
      }
    }

    // No activity from any source
    if (!gitActivity && !boardActivity) {
      this.logger.info('No activity found today', { userId: options.userId })
      return Result.ok(null)
    }

    const meetingType = this.standupGenerator.determineMeetingType(today)
    const generated = await this.tracing.withSpan(
      'standup.llm.generate',
      { 'standup.meeting_type': meetingType, 'standup.mode': 'generate' },
      () =>
        this.standupGenerator.generateStandup(
          {
            date: today,
            meetingType,
            gitActivity: gitActivity ?? undefined,
            boardActivity: boardActivity ?? undefined,
            extraContext: options.extraContext?.trim() || undefined,
          },
          async (stage) => {
            if (stage === 'enriching_data') {
              await this.reportStage(
                reportProgress,
                'enriching_data',
                'Enriquecendo contexto para o standup',
              )
              return
            }

            await this.reportStage(
              reportProgress,
              'generating_standup',
              'Gerando texto do standup',
            )
          },
        ),
    )

    if (generated.isErr()) {
      return generated
    }

    const sourceData = JSON.stringify({
      git: gitActivity,
      board: boardActivity,
    })

    return Result.ok<GeneratedContent>({
      content: generated.value.content,
      meetingType,
      sourceData,
    })
  }
}
```

Note: `ExecuteGenerateStrategy` is a provider in `WorkerModule`, which already imports `AzureDevopsModule`. Since Task 6 registered `AzureDevopsActivityCollectorService` as an exported provider in `AzureDevopsModule`, the injection will work without any additional module changes.

- [ ] **Step 2: Run typecheck**

Run: `bun run typecheck` in `apps/api`
Expected: May have errors in `StandupGeneratorService.generateStandup` because `gitActivity` is now optional. Fix in next task.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/contexts/standups/worker/standup/strategies/execute-generate-strategy.ts
git commit -m "feat: update ExecuteGenerateStrategy for dual git+board collection"
```

---

### Task 16: Update `StandupGeneratorService` for optional git, optional board

**Files:**
- Modify: `apps/api/src/contexts/standups/worker/standup-generator/standup-generator.service.ts`

- [ ] **Step 1: Make `enrichWithFallback` conditional on gitActivity presence**

In `generateStandup()`, change the enrichment call:

```ts
// BEFORE:
  await onStageChange?.('enriching_data')
  const enrichedActivity = await this.enrichWithFallback(input.gitActivity)

// AFTER:
  let enrichedActivity: EnrichedGitActivity | undefined
  if (input.gitActivity) {
    await onStageChange?.('enriching_data')
    enrichedActivity = await this.enrichWithFallback(input.gitActivity)
  }
```

Update `buildSystemPrompt` and `buildUserMessage` calls to pass source info:

```ts
// BEFORE:
  const systemPrompt = this.standupPrompt.buildSystemPrompt()
  // ...
  this.standupPrompt.buildUserMessage(input, enrichedActivity),

// AFTER:
  const systemPrompt = this.standupPrompt.buildSystemPrompt({
    hasGit: !!input.gitActivity,
    hasBoard: !!input.boardActivity,
  })
  // ...
  this.standupPrompt.buildUserMessage(input, enrichedActivity),
```

Also update `generateAdjustedStandup` which also calls `buildSystemPrompt()` — the adjust flow operates on existing text and doesn't know the original sources, so default to git-only (the existing prompt works fine for text rewriting):

```ts
// In generateAdjustedStandup(), change:
// BEFORE:
  const systemPrompt = this.standupPrompt.buildSystemPrompt()

// AFTER:
  const systemPrompt = this.standupPrompt.buildSystemPrompt({ hasGit: true, hasBoard: false })
```

- [ ] **Step 2: Run typecheck**

Run: `bun run typecheck` in `apps/api`
Expected: Errors in `StandupPromptService` — needs updating (next task)

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/contexts/standups/worker/standup-generator/standup-generator.service.ts
git commit -m "feat: make enrichment conditional on git activity presence"
```

---

### Task 17: Update `StandupPromptService` for source-aware prompts

**Files:**
- Modify: `apps/api/src/contexts/standups/worker/standup-generator/standup-prompt.service.ts`

- [ ] **Step 1: Update `buildSystemPrompt` signature and add board-aware prompt**

Change `buildSystemPrompt()` to accept sources parameter:

```ts
buildSystemPrompt(sources: { hasGit: boolean; hasBoard: boolean }): string {
  if (sources.hasGit && sources.hasBoard) {
    return this.buildHybridSystemPrompt()
  }
  if (sources.hasBoard) {
    return this.buildBoardOnlySystemPrompt()
  }
  return this.buildGitOnlySystemPrompt()
}
```

Move the existing system prompt into `buildGitOnlySystemPrompt()`. Add new methods:

```ts
private buildGitOnlySystemPrompt(): string {
  // ... existing system prompt content (unchanged)
}

private buildBoardOnlySystemPrompt(): string {
  return `Voce e um assistente especializado em gerar relatorios de standup diario.

Voce recebera dados de atividade no board do Azure DevOps (work items criados, movidos, comentados).
Sua tarefa e gerar um relatorio de standup em portugues, formatado conforme as regras abaixo.

## Regras de Formatacao

**Header:**
- Formato: \`**Standup (DD/MM/YYYY)**\`
- Se houver tipo de reuniao (meetingType), adicionar na linha seguinte

**Body — por projeto:**
\`\`\`
**📌 <nome-do-projeto>**

**✅ Done:**
➜ #<id-work-item> - <titulo-do-work-item>
\t➜ <acoes realizadas>

**🚧 (In Progress):**
➜ #<id-work-item> - <titulo-do-work-item>
\t➜ <acoes realizadas>

---
\`\`\`

**Regras importantes:**
- Use \`➜\` para bullets aninhados
- Agrupe work items pelo estado atual (Done / In Progress / outros)
- Descreva as acoes: moveu de estado, comentou, criou, atribuiu
- O relatorio deve ser conciso mas informativo
- O campo \`content\` final deve ter no maximo ${MAX_STANDUP_CONTENT_CHARS} caracteres

**summary:**
- Uma frase curta em portugues resumindo o que foi feito no dia`
}

private buildHybridSystemPrompt(): string {
  return `Voce e um assistente especializado em gerar relatorios de standup diario.

Voce recebera dados de duas fontes: commits git e atividade no board do Azure DevOps.
Sua tarefa e gerar um relatorio de standup UNIFICADO em portugues — nao separe por fonte de dados.

## Regras de Formatacao

**Header:**
- Formato: \`**Standup (DD/MM/YYYY)**\`
- Se houver tipo de reuniao (meetingType), adicionar na linha seguinte

**Body — por projeto/repositorio:**
\`\`\`
**📌 <nome>**

**✅ Done:**
➜ #<numero-card> - <titulo>
\t➜ **Correcoes:**
\t\t➜ <descricao>
\t➜ **Melhorias Tecnicas:**
\t\t➜ <descricao>

**🚧 (In Progress):**
➜ #<numero-card> - <titulo>
\t➜ <descricao do progresso>

---
\`\`\`

**Regras importantes:**
- Use \`➜\` para bullets aninhados
- Consolide informacoes do git e do board sobre o mesmo item (mesmo numero de card)
- Nao duplique itens que aparecam em ambas as fontes
- Titulos dos cards vem do Azure DevOps
- Inclua caminhos de arquivo quando relevante (dados git)
- O relatorio deve ser conciso mas informativo
- O campo \`content\` final deve ter no maximo ${MAX_STANDUP_CONTENT_CHARS} caracteres

**summary:**
- Uma frase curta em portugues resumindo o que foi feito no dia`
}
```

- [ ] **Step 2: Update `buildUserMessage` to handle optional git and board data**

```ts
buildUserMessage(
  input: GenerateStandupInput,
  enrichedActivity?: EnrichedGitActivity,
): string {
  const formattedDate = this.localDateService.formatIsoForTimezone(
    input.date,
    'America/Sao_Paulo',
  )
  const meetingType =
    input.meetingType || this.determineMeetingType(input.date)

  const sections: string[] = [
    `Data: ${formattedDate}`,
    `Tipo de reuniao: ${meetingType || '(nenhum)'}`,
    '',
  ]

  // Git activity section — existing logic, now guarded by enrichedActivity presence
  if (enrichedActivity) {
    for (const repo of enrichedActivity.repos) {
      sections.push(`## Repositorio: ${repo.repoName}`)
      sections.push('')

      if (repo.commits.length > 0) {
        sections.push(`### Commits (${repo.commits.length}):`)
        for (const commit of repo.commits) {
          const branchLabel = commit.sourceBranch
            ? ` (branch: ${commit.sourceBranch})`
            : ''
          sections.push(
            `- [${commit.hash.slice(0, 8)}] ${commit.subject}${branchLabel}`,
          )
          if (commit.body.trim()) {
            sections.push(`  Body: ${commit.body.trim()}`)
          }
          if (commit.files.length > 0) {
            sections.push(`  Arquivos alterados: ${commit.files.join(', ')}`)
          }
        }
        sections.push('')
      }

      if (repo.enrichedItems.length > 0) {
        sections.push('### Work Items enriquecidos:')
        for (const item of repo.enrichedItems) {
          const status = this.determineWorkItemStatus(item)
          const workItemTitle =
            item.workItem?.title ?? '(titulo nao encontrado)'
          const workItemState = item.workItem?.state ?? 'unknown'

          sections.push(`#### Card #${item.cardNumber}`)
          sections.push(`- Titulo: ${workItemTitle}`)
          sections.push(`- Estado Azure DevOps: ${workItemState}`)
          sections.push(
            `- Status calculado: ${status === 'done' ? 'Done ✅' : 'In Progress 🚧'}`,
          )

          if (item.pullRequests.length > 0) {
            sections.push(`- Pull Requests (${item.pullRequests.length}):`)
            for (const pullRequest of item.pullRequests) {
              sections.push(
                `  - PR #${pullRequest.id}: "${pullRequest.title}" [${pullRequest.status}]`,
              )
            }
          }
          sections.push('')
        }
      } else {
        sections.push('### Sem work items associados (commits diretos)')
        sections.push(
          '### Instrucao para commits sem card: gerar titulo e descricoes a partir dos commits/arquivos sem incluir numero de card ou prefixo #',
        )
        sections.push('')
      }
    }
  }

  // Board activity section (new)
  if (input.boardActivity) {
    sections.push('## Atividade no Board do Azure DevOps')
    sections.push('')
    for (const item of input.boardActivity.workItems) {
      sections.push(`### [${item.type}] #${item.id} — ${item.title} (Projeto: ${item.project})`)
      sections.push(`- Estado atual: ${item.state}`)
      sections.push(`- Atribuido para: ${item.assignedTo || '(ninguem)'}`)
      if (item.actions.length > 0) {
        sections.push('- Acoes:')
        for (const action of item.actions) {
          sections.push(`  - ${action.details} (${action.timestamp})`)
        }
      }
      sections.push('')
    }
  }

  // Deduplication note for hybrid mode
  if (enrichedActivity && input.boardActivity) {
    sections.push('## Nota sobre dados duplicados')
    sections.push('Alguns itens podem aparecer nos commits E no board (mesmo numero de card).')
    sections.push('Consolide as informacoes no standup final sem duplicar.')
    sections.push('')
  }

  if (input.extraContext) {
    sections.push('## Contexto adicional fornecido pelo usuario:')
    sections.push(input.extraContext)
    sections.push('')
  }

  sections.push('---')
  sections.push(
    'Gere o relatorio de standup seguindo EXATAMENTE o formato especificado no system prompt.',
  )
  sections.push(
    `Limite obrigatorio: "content" deve ter no maximo ${MAX_STANDUP_CONTENT_CHARS} caracteres.`,
  )
  sections.push(
    'Retorne um objeto JSON com "content" (relatorio completo em markdown) e "summary" (frase resumo).',
  )

  return sections.join('\n')
}
```

- [ ] **Step 3: Run typecheck**

Run: `bun run typecheck` in `apps/api`
Expected: PASS (or close — remaining issues in regenerate strategy)

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/contexts/standups/worker/standup-generator/standup-prompt.service.ts
git commit -m "feat: source-aware system prompts and user messages for git/board/hybrid"
```

---

### Task 18: Update `ExecuteRegenerateStrategy` to use `parseSourceData`

**Files:**
- Modify: `apps/api/src/contexts/standups/worker/standup/strategies/execute-regenerate-strategy.ts`

- [ ] **Step 1: Replace `parseStoredGitActivity` with `parseSourceData`**

```ts
// BEFORE (import):
import { GenerateStandupInputSchema, Result, ValidationError } from '../../../../../shared/domain'

// AFTER:
import { parseSourceData, Result } from '../../../../../shared/domain'
```

Remove the `parseStoredGitActivity` function entirely. Replace its usage:

```ts
// BEFORE:
    const gitActivityResult = parseStoredGitActivity(existingResult.value.sourceData)
    if (gitActivityResult.isErr()) {
      return gitActivityResult
    }

    const regenerated = await this.standupGenerator.generateStandup(
      {
        date: today,
        meetingType: existingResult.value.meetingType,
        gitActivity: gitActivityResult.value,
        extraContext: options.extraContext?.trim() || undefined,
      },

// AFTER:
    const sourceDataResult = parseSourceData(existingResult.value.sourceData)
    if (sourceDataResult.isErr()) {
      return sourceDataResult
    }

    const regenerated = await this.standupGenerator.generateStandup(
      {
        date: today,
        meetingType: existingResult.value.meetingType,
        gitActivity: sourceDataResult.value.git ?? undefined,
        boardActivity: sourceDataResult.value.board ?? undefined,
        extraContext: options.extraContext?.trim() || undefined,
      },
```

- [ ] **Step 2: Run typecheck**

Run: `bun run typecheck` in `apps/api`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/contexts/standups/worker/standup/strategies/execute-regenerate-strategy.ts
git commit -m "feat: use parseSourceData in regenerate strategy for dual-format support"
```

---

### Task 18b: Add prompt service tests for source-aware prompts

**Files:**
- Create: `apps/api/src/contexts/standups/worker/standup-generator/standup-prompt.service.spec.ts`

- [ ] **Step 1: Write tests for source-aware prompt generation**

```ts
// apps/api/src/contexts/standups/worker/standup-generator/standup-prompt.service.spec.ts
import { describe, expect, it, vi } from 'vitest'
import { StandupPromptService } from './standup-prompt.service'

function makeLocalDateService() {
  return {
    formatIsoForTimezone: vi.fn().mockReturnValue('16/03/2026'),
    getDayOfWeek: vi.fn().mockReturnValue(1),
  }
}

describe('StandupPromptService', () => {
  describe('buildSystemPrompt', () => {
    it('returns git-only prompt when only git is active', () => {
      const service = new StandupPromptService(makeLocalDateService() as never)
      const prompt = service.buildSystemPrompt({ hasGit: true, hasBoard: false })

      expect(prompt).toContain('commits git')
      expect(prompt).not.toContain('board')
    })

    it('returns board-only prompt when only board is active', () => {
      const service = new StandupPromptService(makeLocalDateService() as never)
      const prompt = service.buildSystemPrompt({ hasGit: false, hasBoard: true })

      expect(prompt).toContain('board')
      expect(prompt).not.toContain('commits git')
    })

    it('returns hybrid prompt when both are active', () => {
      const service = new StandupPromptService(makeLocalDateService() as never)
      const prompt = service.buildSystemPrompt({ hasGit: true, hasBoard: true })

      expect(prompt).toContain('duas fontes')
    })
  })

  describe('buildUserMessage', () => {
    it('includes board activity section when boardActivity is present', () => {
      const service = new StandupPromptService(makeLocalDateService() as never)
      const message = service.buildUserMessage({
        date: '2026-03-16',
        meetingType: '',
        boardActivity: {
          timestamp: '2026-03-16T17:00:00Z',
          workItems: [
            {
              id: 100,
              title: 'Fix login bug',
              type: 'Bug',
              state: 'Done',
              assignedTo: 'Bruno',
              project: 'AGROTRACE',
              actions: [
                { type: 'state_change', timestamp: '2026-03-16T14:00:00Z', details: 'State: To Do -> Done' },
              ],
            },
          ],
        },
      })

      expect(message).toContain('Atividade no Board')
      expect(message).toContain('#100')
      expect(message).toContain('Fix login bug')
    })

    it('includes deduplication note when both git and board are present', () => {
      const service = new StandupPromptService(makeLocalDateService() as never)
      const message = service.buildUserMessage(
        {
          date: '2026-03-16',
          meetingType: '',
          gitActivity: {
            timestamp: '2026-03-16T17:00:00Z',
            repos: [{ repoName: 'repo', repoPath: '/repo', commits: [], cardNumbers: [] }],
          },
          boardActivity: {
            timestamp: '2026-03-16T17:00:00Z',
            workItems: [
              { id: 100, title: 'Task', type: 'Task', state: 'Done', assignedTo: 'Bruno', project: 'AGROTRACE', actions: [] },
            ],
          },
        },
        {
          timestamp: '2026-03-16T17:00:00Z',
          repos: [{ repoName: 'repo', repoPath: '/repo', commits: [], cardNumbers: [], enrichedItems: [] }],
          userUuid: 'uuid',
        },
      )

      expect(message).toContain('dados duplicados')
    })
  })
})
```

- [ ] **Step 2: Run tests**

Run: `bun run test -- --reporter=verbose standup-prompt` in `apps/api`
Expected: ALL PASS

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/contexts/standups/worker/standup-generator/standup-prompt.service.spec.ts
git commit -m "test: add source-aware prompt service tests"
```

---

### Task 19: Update "no activity" DM message in pipeline

**Files:**
- Modify: `apps/api/src/contexts/standups/worker/standup/standup-pipeline.service.ts`

- [ ] **Step 1: Make the "no activity" message source-aware**

In `standup-pipeline.service.ts`, update the DM notification in the `generated === null` block (around line 77):

```ts
// BEFORE:
        this.notifications.notifyUserDm({
          discordUserId: options.discordUserId,
          title: '🔍 Nenhuma atividade encontrada',
          message:
            'Não encontrei commits hoje nos repositórios configurados. Verifique suas configurações.',
          color: 0xf39c12,
        })

// AFTER:
        const hasGit = options.selectedRepos.length > 0 && options.gitAuthor.trim().length > 0
        const hasBoard = !!options.azureDevopsUser?.trim()
        let noActivityMessage: string
        if (hasGit && hasBoard) {
          noActivityMessage = 'Não encontrei commits nem atividade no board hoje. Verifique suas configurações.'
        } else if (hasBoard) {
          noActivityMessage = 'Não encontrei atividade no board do Azure DevOps hoje. Verifique suas configurações.'
        } else {
          noActivityMessage = 'Não encontrei commits hoje nos repositórios configurados. Verifique suas configurações.'
        }

        this.notifications.notifyUserDm({
          discordUserId: options.discordUserId,
          title: '🔍 Nenhuma atividade encontrada',
          message: noActivityMessage,
          color: 0xf39c12,
        })
```

- [ ] **Step 2: Run typecheck**

Run: `bun run typecheck` in `apps/api`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/contexts/standups/worker/standup/standup-pipeline.service.ts
git commit -m "feat: source-aware no-activity DM messages"
```

---

### Task 20: Final typecheck, lint, and test run

- [ ] **Step 1: Run full typecheck**

Run: `bun run typecheck` in `apps/api`
Expected: PASS — fix any remaining errors

- [ ] **Step 2: Run lint**

Run: `bun run lint` in `apps/api`
Expected: PASS — fix any issues

- [ ] **Step 3: Run all tests**

Run: `bun run test` in `apps/api`
Expected: ALL PASS

- [ ] **Step 4: Run web typecheck**

Run: `bun run typecheck` in `apps/web`
Expected: PASS (we only added `collecting_board` to a union type)

- [ ] **Step 5: Commit any remaining fixes**

```bash
git add -A
git commit -m "fix: resolve remaining type and lint issues for board activity collector"
```

---

## Chunk 5: Web Settings UI

### Task 21: Add `azureDevopsUser` field to Angular settings page

**Files:**
- Modify: `apps/web/src/app/shared/models/standup-models.ts` (SettingsDto)
- Modify: `apps/web/src/app/features/settings/` (settings page component)
- Modify: `apps/web/src/app/api/model/putMeSettingsDto.ts` (generated API model)

- [ ] **Step 1: Add `azureDevopsUser` to `SettingsDto`**

In `apps/web/src/app/shared/models/standup-models.ts`, add to `SettingsDto`:

```ts
export interface SettingsDto {
  // ... existing fields
  azureDevopsUser?: string | null   // new
}
```

- [ ] **Step 2: Add input field to settings page template**

Add a new input field for "Nome de exibicao no Azure DevOps" in the settings form, below the `gitAuthor` field. Mark it as optional. Include help text: "Informe seu nome de exibicao exatamente como aparece no Azure DevOps."

- [ ] **Step 3: Update the settings service to send `azureDevopsUser` in PUT body**

Ensure the settings service includes `azureDevopsUser` when saving.

- [ ] **Step 4: Make `gitAuthor` and `selectedRepos` optional in the UI**

Remove "required" validation from `gitAuthor` and `selectedRepos` inputs. Add a cross-field validation message: "Configure pelo menos uma fonte de dados: repositorios git ou usuario do Azure DevOps."

- [ ] **Step 5: Run web typecheck and tests**

Run: `bun run typecheck` and `bun run test` in `apps/web`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/web/
git commit -m "feat: add azureDevopsUser to settings UI with relaxed validations"
```

---

### Task 22: Regenerate OpenAPI client (if applicable)

- [ ] **Step 1: Check if the project auto-generates the web API client from OpenAPI**

If there's an OpenAPI generator step, run it to update the web client models with the new `azureDevopsUser` field.

- [ ] **Step 2: Commit if changes**

```bash
git add apps/web/src/app/api/
git commit -m "chore: regenerate web API client for azureDevopsUser field"
```

---

### Task 23: Final full CI check

- [ ] **Step 1: Run the full CI pipeline**

Run from root: `turbo run lint typecheck test`
Expected: ALL PASS

- [ ] **Step 2: Final commit if any cleanup needed**

```bash
git add -A
git commit -m "chore: final cleanup for board activity collector feature"
```
