import { Controller, Inject } from '@nestjs/common'
import { describe, expect, it, vi } from 'vitest'
import { createControllerHttpTestApp } from '../../../test/http/create-controller-http-test-app'
import { StandupsQueryController } from './standups-query.controller'
import { StandupsQueryService } from './standups-query.service'

const STANDUP_ID = '123e4567-e89b-12d3-a456-426614174000'

@Controller('standups')
class TestStandupsQueryController extends StandupsQueryController {
  constructor(
    @Inject(StandupsQueryService) standupsQuery: StandupsQueryService,
  ) {
    super(standupsQuery)
  }
}

describe('StandupsQueryController', () => {
  it('returns 401 without session', async () => {
    const service = {
      async list() {
        return {
          items: [],
          page: 1,
          pageSize: 20,
          total: 0,
          totalPages: 0,
          summary: {
            total: 0,
            approved: 0,
            pending: 0,
            rejected: 0,
          },
        }
      },
      async getById() {
        return { id: STANDUP_ID }
      },
    }
    const testApp = await createControllerHttpTestApp({
      controllers: [TestStandupsQueryController],
      providers: [
        {
          provide: StandupsQueryService,
          useValue: service,
        },
      ],
    })

    const response = await testApp.request.get('/standups')

    expect(response.status).toBe(401)

    await testApp.close()
  })

  it('returns 400 for an invalid status query', async () => {
    const service = {
      list: vi.fn(),
      getById: vi.fn(),
    }
    const testApp = await createControllerHttpTestApp({
      controllers: [TestStandupsQueryController],
      providers: [
        {
          provide: StandupsQueryService,
          useValue: service,
        },
      ],
    })

    const response = await testApp
      .withSession({ user: { id: 'user-1' } })
      .get('/standups?status=invalid')

    expect(response.status).toBe(400)
    expect(service.list).not.toHaveBeenCalled()

    await testApp.close()
  })

  it('returns list and details for authenticated users', async () => {
    const listCalls: Array<
      [
        string,
        {
          date?: string
          from?: string
          page: number
          pageSize: number
          search?: string
          status?: string
          to?: string
        },
      ]
    > = []
    const detailCalls: Array<[string, string]> = []
    const service = {
      async list(
        userId: string,
        filters: {
          date?: string
          from?: string
          page: number
          pageSize: number
          search?: string
          status?: string
          to?: string
        },
      ) {
        listCalls.push([userId, filters])

        return {
          items: [{ id: STANDUP_ID }],
          page: 1,
          pageSize: 20,
          total: 1,
          totalPages: 1,
          summary: {
            total: 1,
            approved: 0,
            pending: 1,
            rejected: 0,
          },
        }
      },
      async getById(userId: string, standupId: string) {
        detailCalls.push([userId, standupId])

        return { id: STANDUP_ID }
      },
    }

    const testApp = await createControllerHttpTestApp({
      controllers: [TestStandupsQueryController],
      providers: [
        {
          provide: StandupsQueryService,
          useValue: service,
        },
      ],
    })

    const listResponse = await testApp
      .withSession({ user: { id: 'user-1' } })
      .get('/standups')
    const detailResponse = await testApp
      .withSession({ user: { id: 'user-1' } })
      .get(`/standups/${STANDUP_ID}`)

    expect(listResponse.status).toBe(200)
    expect(listResponse.body).toEqual({
      data: [{ id: STANDUP_ID }],
      pagination: {
        page: 1,
        pageSize: 20,
        total: 1,
        totalPages: 1,
      },
      summary: {
        total: 1,
        approved: 0,
        pending: 1,
        rejected: 0,
      },
    })
    expect(detailResponse.status).toBe(200)
    expect(detailResponse.body).toEqual({
      data: { id: STANDUP_ID },
    })
    expect(listCalls).toEqual([
      [
        'user-1',
        {
          page: 1,
          pageSize: 20,
        },
      ],
    ])
    expect(detailCalls).toEqual([['user-1', STANDUP_ID]])

    await testApp.close()
  })

  it('returns 400 for an invalid standup id', async () => {
    const service = {
      list: vi.fn(),
      getById: vi.fn(),
    }
    const testApp = await createControllerHttpTestApp({
      controllers: [TestStandupsQueryController],
      providers: [
        {
          provide: StandupsQueryService,
          useValue: service,
        },
      ],
    })

    const response = await testApp
      .withSession({ user: { id: 'user-1' } })
      .get('/standups/not-a-uuid')

    expect(response.status).toBe(400)
    expect(service.getById).not.toHaveBeenCalled()

    await testApp.close()
  })
})
