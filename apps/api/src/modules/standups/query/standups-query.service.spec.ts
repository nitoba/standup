import { InternalServerErrorException, NotFoundException } from '@nestjs/common'
import { describe, expect, it, vi } from 'vitest'
import { DbError, NotFoundError, Result } from '../../../shared/domain'
import { StandupsQueryService } from './standups-query.service'

describe('StandupsQueryService', () => {
  it('lists standups scoped by user', async () => {
    const standupRepository = {
      list: vi.fn().mockResolvedValue(
        Result.ok({
          items: [{ id: 'standup-1', date: '2026-03-13' }],
          page: 1,
          pageSize: 20,
          total: 0,
          totalPages: 0,
          summary: { total: 0, approved: 0, pending: 0, rejected: 0 },
        }),
      ),
      findByIdForUser: vi.fn(),
    }
    const service = new StandupsQueryService(
      standupRepository as never,
      {
        findByUserId: vi.fn().mockResolvedValue(
          Result.ok({ timezone: 'America/Fortaleza' }),
        ),
      } as never,
      {
        formatIsoForTimezone: vi.fn().mockReturnValue('13/03/2026'),
        normalizeDateInput: vi.fn((value: string) => value),
        today: vi.fn().mockReturnValue({
          iso: '2026-03-13',
          display: '13/03/2026',
        }),
        shiftIsoDate: vi.fn().mockReturnValue('2026-03-07'),
      } as never,
    )

    await expect(service.list('user-1', { page: 1 })).resolves.toEqual({
      items: [{ id: 'standup-1', date: '13/03/2026' }],
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
    const service = new StandupsQueryService(
      {
        list: vi
          .fn()
          .mockResolvedValue(
            Result.err(
              new DbError({ operation: 'list', message: 'disk full' }),
            ),
          ),
        findByIdForUser: vi
          .fn()
          .mockResolvedValue(
            Result.err(
              new NotFoundError({ resource: 'standup', id: 'standup-1' }),
            ),
          ),
      } as never,
      {
        findByUserId: vi.fn().mockResolvedValue(Result.ok(null)),
      } as never,
      {
        formatIsoForTimezone: vi.fn(),
        normalizeDateInput: vi.fn((value: string) => value),
        today: vi.fn().mockReturnValue({
          iso: '2026-03-13',
          display: '13/03/2026',
        }),
        shiftIsoDate: vi.fn().mockReturnValue('2026-03-07'),
      } as never,
    )

    await expect(service.list('user-1', {})).rejects.toThrow(
      InternalServerErrorException,
    )
    await expect(service.getById('user-1', 'standup-1')).rejects.toThrow(
      NotFoundException,
    )
  })
})
