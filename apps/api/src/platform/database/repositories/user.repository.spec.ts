import { describe, expect, it, vi } from 'vitest'
import { DbError, Result } from '../../../shared/domain'
import { UserRepository } from './user.repository'

describe('UserRepository', () => {
  it('returns DbError when findDiscordIdByUserId fails', async () => {
    const repository = new UserRepository(
      {
        create: vi.fn().mockReturnValue({
          error: vi.fn(),
          info: vi.fn(),
        }),
      } as never,
      {
        db: {
          select: vi.fn(() => ({
            from: vi.fn(() => ({
              where: vi.fn(() => ({
                limit: vi.fn(() => ({
                  get: vi.fn().mockRejectedValue(new Error('db exploded')),
                })),
              })),
            })),
          })),
        },
      } as never,
    )

    const result = await repository.findDiscordIdByUserId('user-1')

    expect(Result.isError(result)).toBe(true)
    if (Result.isError(result)) {
      expect(DbError.is(result.error)).toBe(true)
      expect(result.error.message).toContain('db exploded')
      expect(result.error.operation).toBe('findDiscordIdByUserId')
    }
  })
})
