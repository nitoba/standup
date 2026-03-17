import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Result } from '../../../../shared/domain'
import { AzureDevopsActivityCollectorService } from './azure-devops-activity-collector.service'
import type { WorkItemResponse, WorkItemUpdate } from './types'

function makeLogger() {
  return {
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  }
}

function makeLoggerFactory() {
  const logger = makeLogger()
  return {
    factory: { create: vi.fn().mockReturnValue(logger) },
    logger,
  }
}

function makeRestClient(
  overrides: {
    queryWorkItems?: ReturnType<typeof vi.fn>
    getWorkItemsBatch?: ReturnType<typeof vi.fn>
    getWorkItemUpdates?: ReturnType<typeof vi.fn>
  } = {},
) {
  return {
    queryWorkItems:
      overrides.queryWorkItems ?? vi.fn().mockResolvedValue(Result.ok([])),
    getWorkItemsBatch:
      overrides.getWorkItemsBatch ?? vi.fn().mockResolvedValue(Result.ok([])),
    getWorkItemUpdates:
      overrides.getWorkItemUpdates ?? vi.fn().mockResolvedValue(Result.ok([])),
  }
}

function makeRuntimeConfig(projects: string[] = ['ProjectA']) {
  return {
    config: {
      AZURE_DEVOPS_ORG: 'my-org',
      AZURE_DEVOPS_PAT: 'my-pat',
      AZURE_DEVOPS_PROJECTS: projects,
    },
  }
}

function workItemResponse(
  id: number,
  title: string,
  type: string,
  state: string,
  assignedTo: string,
): WorkItemResponse {
  return {
    id,
    fields: {
      'System.Title': title,
      'System.WorkItemType': type,
      'System.State': state,
      'System.AssignedTo': assignedTo,
    },
  }
}

function stateChangeUpdate(
  rev: number,
  revisedDate: string,
  userName: string,
  oldState: string,
  newState: string,
): WorkItemUpdate {
  return {
    id: 1,
    rev,
    revisedDate,
    revisedBy: { displayName: userName },
    fields: {
      'System.State': { oldValue: oldState, newValue: newState },
    },
  }
}

describe('AzureDevopsActivityCollectorService', () => {
  let loggerFactory: ReturnType<typeof makeLoggerFactory>

  beforeEach(() => {
    loggerFactory = makeLoggerFactory()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2024-06-15T17:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  function createService(
    restClientOverrides: Parameters<typeof makeRestClient>[0] = {},
    projects: string[] = ['ProjectA'],
  ) {
    const restClient = makeRestClient(restClientOverrides)
    const runtimeConfig = makeRuntimeConfig(projects)
    const service = new AzureDevopsActivityCollectorService(
      loggerFactory.factory as never,
      restClient as never,
      runtimeConfig as never,
    )
    return { service, restClient, logger: loggerFactory.logger }
  }

  it('returns null when no work items found', async () => {
    const { service } = createService({
      queryWorkItems: vi.fn().mockResolvedValue(Result.ok([])),
    })

    const result = await service.collect('John Doe', '8 hours ago')
    expect(result).toBeNull()
  })

  it('collects work items with state change actions', async () => {
    const queryWorkItems = vi.fn().mockResolvedValue(Result.ok([101]))
    const getWorkItemsBatch = vi
      .fn()
      .mockResolvedValue(
        Result.ok([
          workItemResponse(101, 'Fix login bug', 'Bug', 'Active', 'John Doe'),
        ]),
      )
    const getWorkItemUpdates = vi
      .fn()
      .mockResolvedValue(
        Result.ok([
          stateChangeUpdate(
            1,
            '2024-06-15T14:00:00Z',
            'John Doe',
            'New',
            'Active',
          ),
        ]),
      )

    const { service } = createService({
      queryWorkItems,
      getWorkItemsBatch,
      getWorkItemUpdates,
    })

    const result = await service.collect('John Doe', '8 hours ago')

    expect(result).not.toBeNull()
    expect(result!.workItems).toHaveLength(1)
    expect(result!.workItems[0]!.id).toBe(101)
    expect(result!.workItems[0]!.title).toBe('Fix login bug')
    expect(result!.workItems[0]!.actions).toHaveLength(1)
    expect(result!.workItems[0]!.actions[0]!.type).toBe('state_change')
    expect(result!.workItems[0]!.actions[0]!.details).toContain('New')
    expect(result!.workItems[0]!.actions[0]!.details).toContain('Active')
  })

  it('filters updates to only those by the configured user', async () => {
    const queryWorkItems = vi.fn().mockResolvedValue(Result.ok([101]))
    const getWorkItemsBatch = vi
      .fn()
      .mockResolvedValue(
        Result.ok([
          workItemResponse(101, 'My task', 'Task', 'Active', 'John Doe'),
        ]),
      )
    const getWorkItemUpdates = vi
      .fn()
      .mockResolvedValue(
        Result.ok([
          stateChangeUpdate(
            1,
            '2024-06-15T14:00:00Z',
            'John Doe',
            'New',
            'Active',
          ),
          stateChangeUpdate(
            2,
            '2024-06-15T15:00:00Z',
            'Someone Else',
            'Active',
            'Resolved',
          ),
        ]),
      )

    const { service } = createService({
      queryWorkItems,
      getWorkItemsBatch,
      getWorkItemUpdates,
    })

    const result = await service.collect('John Doe', '8 hours ago')

    expect(result).not.toBeNull()
    expect(result!.workItems).toHaveLength(1)
    // Only John Doe's update should be included
    expect(result!.workItems[0]!.actions).toHaveLength(1)
    expect(result!.workItems[0]!.actions[0]!.type).toBe('state_change')
  })

  it('continues to next project when one project query fails', async () => {
    let callCount = 0
    const queryWorkItems = vi.fn().mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        return Promise.resolve(
          Result.err({
            _tag: 'ExternalServiceError',
            service: 'azure-devops',
            message: 'Query failed',
          }),
        )
      }
      return Promise.resolve(Result.ok([201]))
    })
    const getWorkItemsBatch = vi
      .fn()
      .mockResolvedValue(
        Result.ok([
          workItemResponse(
            201,
            'Second project task',
            'Task',
            'Active',
            'John Doe',
          ),
        ]),
      )
    const getWorkItemUpdates = vi
      .fn()
      .mockResolvedValue(
        Result.ok([
          stateChangeUpdate(
            1,
            '2024-06-15T14:00:00Z',
            'John Doe',
            'New',
            'Active',
          ),
        ]),
      )

    const { service, logger } = createService(
      { queryWorkItems, getWorkItemsBatch, getWorkItemUpdates },
      ['FailProject', 'OkProject'],
    )

    const result = await service.collect('John Doe', '8 hours ago')

    expect(result).not.toBeNull()
    expect(result!.workItems).toHaveLength(1)
    expect(result!.workItems[0]!.id).toBe(201)
    expect(logger.warn).toHaveBeenCalled()
  })

  it('skips work items with no user actions and returns null', async () => {
    const queryWorkItems = vi.fn().mockResolvedValue(Result.ok([101]))
    const getWorkItemsBatch = vi
      .fn()
      .mockResolvedValue(
        Result.ok([
          workItemResponse(101, 'Other task', 'Task', 'Active', 'Someone'),
        ]),
      )
    // Updates are by a different user, so no actions for our user
    const getWorkItemUpdates = vi
      .fn()
      .mockResolvedValue(
        Result.ok([
          stateChangeUpdate(
            1,
            '2024-06-15T14:00:00Z',
            'Someone Else',
            'New',
            'Active',
          ),
        ]),
      )

    const { service } = createService({
      queryWorkItems,
      getWorkItemsBatch,
      getWorkItemUpdates,
    })

    const result = await service.collect('John Doe', '8 hours ago')

    // No work items have actions by John Doe, so result is null
    expect(result).toBeNull()
  })
})
