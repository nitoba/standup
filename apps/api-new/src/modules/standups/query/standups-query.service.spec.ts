import { InternalServerErrorException, NotFoundException } from '@nestjs/common'
import { DbError, NotFoundError, Result } from '@standup/domain'
import { describe, expect, it, vi } from 'vitest'
import { StandupsQueryService } from './standups-query.service'

describe('StandupsQueryService', () => {
  it('lists standups scoped by user', async () => {
    const standupRepository = {
      list: vi.fn().mockResolvedValue(
        Result.ok({
          items: [],
          page: 1,
          pageSize: 20,
          total: 0,
          totalPages: 0,
          summary: { total: 0, approved: 0, pending: 0, rejected: 0 },
        }),
      ),
      findByIdForUser: vi.fn(),
    }
    const service = new StandupsQueryService(standupRepository as never)

    await expect(service.list('user-1', { page: 1 })).resolves.toEqual({
      items: [],
      page: 1,
      pageSize: 20,
      total: 0,
      totalPages: 0,
      summary: { total: 0, approved: 0, pending: 0, rejected: 0 },
    })
    expect(standupRepository.list).toHaveBeenCalledWith({
      userId: 'user-1',
      page: 1,
    })
  })

  it('maps repository errors for list and getById', async () => {
    const service = new StandupsQueryService({
      list: vi
        .fn()
        .mockResolvedValue(
          Result.err(new DbError({ operation: 'list', message: 'disk full' })),
        ),
      findByIdForUser: vi
        .fn()
        .mockResolvedValue(
          Result.err(
            new NotFoundError({ resource: 'standup', id: 'standup-1' }),
          ),
        ),
    } as never)

    await expect(service.list('user-1', {})).rejects.toThrow(
      InternalServerErrorException,
    )
    await expect(service.getById('user-1', 'standup-1')).rejects.toThrow(
      NotFoundException,
    )
  })
})
