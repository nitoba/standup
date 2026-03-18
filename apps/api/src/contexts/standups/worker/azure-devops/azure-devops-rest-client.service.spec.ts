import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AzureDevopsRestClientService } from './azure-devops-rest-client.service'

function makeRuntimeConfig(org = 'my-org', pat = 'my-pat') {
  return {
    config: {
      AZURE_DEVOPS_ORG: org,
      AZURE_DEVOPS_PAT: pat,
    },
  }
}

function createService(org = 'my-org', pat = 'my-pat') {
  const runtimeConfig = makeRuntimeConfig(org, pat)
  return new AzureDevopsRestClientService(runtimeConfig as never)
}

describe('AzureDevopsRestClientService', () => {
  const mockFetch = vi.fn()

  beforeEach(() => {
    mockFetch.mockReset()
    vi.stubGlobal('fetch', mockFetch)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  describe('queryWorkItems', () => {
    it('returns work item IDs from a WIQL query', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          workItems: [{ id: 100 }, { id: 200 }, { id: 300 }],
        }),
      })

      const service = createService()
      const result = await service.queryWorkItems(
        'MyProject',
        'SELECT [System.Id] FROM WorkItems',
      )

      expect(result.isOk()).toBe(true)
      if (result.isOk()) {
        expect(result.value).toEqual([100, 200, 300])
      }

      expect(mockFetch).toHaveBeenCalledWith(
        'https://dev.azure.com/my-org/MyProject/_apis/wit/wiql?api-version=7.1',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
          body: JSON.stringify({ query: 'SELECT [System.Id] FROM WorkItems' }),
        }),
      )
    })

    it('returns empty array when no work items match', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ workItems: [] }),
      })

      const service = createService()
      const result = await service.queryWorkItems('MyProject', 'SELECT ...')

      expect(result.isOk()).toBe(true)
      if (result.isOk()) {
        expect(result.value).toEqual([])
      }
    })

    it('returns ExternalServiceError on non-ok response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        text: async () => 'Bad credentials',
      })

      const service = createService()
      const result = await service.queryWorkItems('MyProject', 'SELECT ...')

      expect(result.isErr()).toBe(true)
      if (result.isErr()) {
        expect(result.error._tag).toBe('ExternalServiceError')
        expect(result.error.service).toBe('azure-devops')
      }
    })

    it('returns ExternalServiceError on fetch failure', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'))

      const service = createService()
      const result = await service.queryWorkItems('MyProject', 'SELECT ...')

      expect(result.isErr()).toBe(true)
      if (result.isErr()) {
        expect(result.error._tag).toBe('ExternalServiceError')
      }
    })
  })

  describe('getWorkItemsBatch', () => {
    it('returns work items for given IDs', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          value: [
            { id: 1, fields: { 'System.Title': 'Item 1' } },
            { id: 2, fields: { 'System.Title': 'Item 2' } },
          ],
        }),
      })

      const service = createService()
      const result = await service.getWorkItemsBatch([1, 2], ['System.Title'])

      expect(result.isOk()).toBe(true)
      if (result.isOk()) {
        expect(result.value).toHaveLength(2)
        expect(result.value[0]?.id).toBe(1)
      }
    })

    it('returns empty array for empty IDs', async () => {
      const service = createService()
      const result = await service.getWorkItemsBatch([], ['System.Title'])

      expect(result.isOk()).toBe(true)
      if (result.isOk()) {
        expect(result.value).toEqual([])
      }

      expect(mockFetch).not.toHaveBeenCalled()
    })

    it('batches requests when more than 200 IDs', async () => {
      const ids = Array.from({ length: 250 }, (_, i) => i + 1)
      const batch1Items = ids.slice(0, 200).map((id) => ({
        id,
        fields: { 'System.Title': `Item ${id}` },
      }))
      const batch2Items = ids.slice(200).map((id) => ({
        id,
        fields: { 'System.Title': `Item ${id}` },
      }))

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ value: batch1Items }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ value: batch2Items }),
        })

      const service = createService()
      const result = await service.getWorkItemsBatch(ids, ['System.Title'])

      expect(result.isOk()).toBe(true)
      if (result.isOk()) {
        expect(result.value).toHaveLength(250)
      }
      expect(mockFetch).toHaveBeenCalledTimes(2)
    })

    it('returns ExternalServiceError on non-ok response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: async () => 'Server error',
      })

      const service = createService()
      const result = await service.getWorkItemsBatch([1], ['System.Title'])

      expect(result.isErr()).toBe(true)
      if (result.isErr()) {
        expect(result.error._tag).toBe('ExternalServiceError')
      }
    })
  })

  describe('resolveIdentity', () => {
    it('should return id and displayName when exactly one active non-group user matches', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          count: 1,
          value: [
            {
              id: 'abc-123-uuid',
              providerDisplayName: 'John Doe',
              isActive: true,
              isContainer: false,
            },
          ],
        }),
      })

      const service = createService()
      const result = await service.resolveIdentity('john@company.com')

      expect(result.isOk()).toBe(true)
      expect(result.value).toEqual({
        id: 'abc-123-uuid',
        displayName: 'John Doe',
      })
    })

    it('should filter out inactive users and groups', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          count: 3,
          value: [
            {
              id: 'active-user',
              providerDisplayName: 'John Doe',
              isActive: true,
              isContainer: false,
            },
            {
              id: 'inactive-user',
              providerDisplayName: 'Jane Inactive',
              isActive: false,
              isContainer: false,
            },
            {
              id: 'group-id',
              providerDisplayName: 'Some Group',
              isActive: true,
              isContainer: true,
            },
          ],
        }),
      })

      const service = createService()
      const result = await service.resolveIdentity('john@company.com')

      expect(result.isOk()).toBe(true)
      expect(result.value).toEqual({
        id: 'active-user',
        displayName: 'John Doe',
      })
    })

    it('should return error when no active users match', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ count: 0, value: [] }),
      })

      const service = createService()
      const result = await service.resolveIdentity('nobody@company.com')

      expect(result.isErr()).toBe(true)
      expect(result.error.message).toContain('nobody@company.com')
    })

    it('should return error when multiple active users match', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          count: 2,
          value: [
            {
              id: 'user-1',
              providerDisplayName: 'John A',
              isActive: true,
              isContainer: false,
            },
            {
              id: 'user-2',
              providerDisplayName: 'John B',
              isActive: true,
              isContainer: false,
            },
          ],
        }),
      })

      const service = createService()
      const result = await service.resolveIdentity('John')

      expect(result.isErr()).toBe(true)
      expect(result.error.message).toContain('Multiple')
    })

    it('should return error on HTTP failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        text: async () => 'Invalid PAT',
      })

      const service = createService()
      const result = await service.resolveIdentity('john@company.com')

      expect(result.isErr()).toBe(true)
      expect(result.error.message).toContain('resolveIdentity failed')
    })

    it('should call vssps.dev.azure.com with correct parameters', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          count: 1,
          value: [
            {
              id: 'x',
              providerDisplayName: 'X',
              isActive: true,
              isContainer: false,
            },
          ],
        }),
      })

      const service = createService()
      await service.resolveIdentity('test user')

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('vssps.dev.azure.com'),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: expect.any(String),
          }),
        }),
      )
      const calledUrl = (mockFetch as ReturnType<typeof vi.fn>).mock
        .calls[0][0] as string
      expect(calledUrl).toContain('searchFilter=General')
      expect(calledUrl).toContain('filterValue=test%20user')
    })
  })

  describe('getWorkItemUpdates', () => {
    it('returns updates for a work item', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          value: [
            {
              id: 1,
              rev: 1,
              revisedDate: '2024-01-01T10:00:00Z',
              revisedBy: { displayName: 'John' },
              fields: {
                'System.State': {
                  oldValue: 'New',
                  newValue: 'Active',
                },
              },
            },
          ],
        }),
      })

      const service = createService()
      const result = await service.getWorkItemUpdates(42)

      expect(result.isOk()).toBe(true)
      if (result.isOk()) {
        expect(result.value).toHaveLength(1)
        expect(result.value[0]?.rev).toBe(1)
        expect(result.value[0]?.revisedBy.displayName).toBe('John')
      }

      expect(mockFetch).toHaveBeenCalledWith(
        'https://dev.azure.com/my-org/_apis/wit/workitems/42/updates?api-version=7.1',
        expect.objectContaining({
          method: 'GET',
        }),
      )
    })

    it('returns ExternalServiceError on fetch error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Connection refused'))

      const service = createService()
      const result = await service.getWorkItemUpdates(42)

      expect(result.isErr()).toBe(true)
      if (result.isErr()) {
        expect(result.error._tag).toBe('ExternalServiceError')
        expect(result.error.message).toContain('getWorkItemUpdates')
      }
    })

    it('returns ExternalServiceError on non-ok response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        text: async () => 'Work item not found',
      })

      const service = createService()
      const result = await service.getWorkItemUpdates(999)

      expect(result.isErr()).toBe(true)
      if (result.isErr()) {
        expect(result.error._tag).toBe('ExternalServiceError')
      }
    })
  })
})
