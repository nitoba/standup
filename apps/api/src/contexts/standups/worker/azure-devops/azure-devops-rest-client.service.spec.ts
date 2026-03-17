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
