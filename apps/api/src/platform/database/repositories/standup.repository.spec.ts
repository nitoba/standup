import { describe, expect, it, vi } from 'vitest'
import { NotFoundError } from '../../../shared/domain'
import { StandupRepository } from './standup.repository'

function makeStandupRecord(overrides?: Record<string, unknown>) {
  return {
    id: 'standup-1',
    date: '2026-03-20',
    meetingType: 'daily',
    content: 'standup content',
    sourceData: '{}',
    customEntries: null,
    status: 'approved',
    userId: 'user-1',
    dmMessageId: null,
    createdAt: 1000,
    updatedAt: 1000,
    sentToDiscordAt: null,
    ...overrides,
  }
}

function makeMockDb() {
  const setFn = vi.fn().mockReturnThis()
  const whereFn = vi.fn().mockReturnThis()
  const getFn = vi.fn()
  const updateFn = vi.fn().mockReturnValue({ set: setFn })
  setFn.mockReturnValue({ where: whereFn })

  return {
    db: {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({ get: getFn }),
        }),
      }),
      update: updateFn,
    },
    getFn,
    setFn,
    whereFn,
  }
}

describe('StandupRepository', () => {
  describe('updateSentToDiscordAt', () => {
    it('sets sentToDiscordAt and returns the updated record', async () => {
      const record = makeStandupRecord()
      const mockDb = makeMockDb()
      mockDb.getFn.mockResolvedValue(record)

      const repo = new StandupRepository(
        { create: () => ({ error: vi.fn(), info: vi.fn() }) } as never,
        { db: mockDb.db } as never,
      )

      const result = await repo.updateSentToDiscordAt('standup-1')

      expect(result.isOk()).toBe(true)
      if (result.isOk()) {
        expect(result.value.sentToDiscordAt).toBeTypeOf('number')
        expect(result.value.sentToDiscordAt).toBeGreaterThan(0)
        expect(result.value.updatedAt).toBe(result.value.sentToDiscordAt)
      }
    })

    it('returns NotFoundError when standup does not exist', async () => {
      const mockDb = makeMockDb()
      mockDb.getFn.mockResolvedValue(undefined)

      const repo = new StandupRepository(
        { create: () => ({ error: vi.fn(), info: vi.fn() }) } as never,
        { db: mockDb.db } as never,
      )

      const result = await repo.updateSentToDiscordAt('nonexistent-id')

      expect(result.isErr()).toBe(true)
      if (result.isErr()) {
        expect(result.error).toBeInstanceOf(NotFoundError)
      }
    })
  })
})
