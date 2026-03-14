import { UnauthorizedException } from '@nestjs/common'
import { describe, expect, it, vi } from 'vitest'
import { StandupsQueryController } from './standups-query.controller'

describe('StandupsQueryController', () => {
  it('returns 401 without session', async () => {
    const controller = new StandupsQueryController({
      list: vi.fn(),
      getById: vi.fn(),
    } as never)

    await expect(
      controller.list(
        null,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        1,
        20,
      ),
    ).rejects.toThrow(UnauthorizedException)
  })

  it('returns list and details for authenticated users', async () => {
    const service = {
      list: vi.fn().mockResolvedValue({
        items: [{ id: 'standup-1' }],
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
      }),
      getById: vi.fn().mockResolvedValue({ id: 'standup-1' }),
    }
    const controller = new StandupsQueryController(service as never)
    const session = { user: { id: 'user-1' } }

    await expect(
      controller.list(
        session,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        1,
        20,
      ),
    ).resolves.toEqual({
      data: [{ id: 'standup-1' }],
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

    await expect(controller.getById(session, 'standup-1')).resolves.toEqual({
      data: { id: 'standup-1' },
    })
    expect(service.list).toHaveBeenCalledWith('user-1', {
      page: 1,
      pageSize: 20,
    })
    expect(service.getById).toHaveBeenCalledWith('user-1', 'standup-1')
  })
})
