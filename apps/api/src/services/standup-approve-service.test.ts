import {
  DbError,
  InvalidStateTransitionError,
  mergeCustomEntries,
  NotFoundError,
  Result,
} from '@standup/domain'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getDb: vi.fn().mockReturnValue({}),
  repoFindByIdForUser: vi.fn(),
  repoUpdateCustomEntriesForUser: vi.fn(),
  repoUpdateContentForUser: vi.fn(),
  repoUpdateStatusForUser: vi.fn(),
}))

vi.mock('@standup/db', () => {
  function StandupRepository() {
    return {
      findByIdForUser: mocks.repoFindByIdForUser,
      updateCustomEntriesForUser: mocks.repoUpdateCustomEntriesForUser,
      updateContentForUser: mocks.repoUpdateContentForUser,
      updateStatusForUser: mocks.repoUpdateStatusForUser,
    }
  }

  return {
    getDb: mocks.getDb,
    StandupRepository,
  }
})

import { approveStandup } from './standup-approve-service.js'

const DATABASE_URL = ':memory:'

const pendingRecord = {
  id: 'standup-abc',
  date: '2026-03-09',
  meetingType: '(Planning Web)',
  content: '**Standup (09/03/2026)**\n(Planning Web)\n\n- Item base',
  sourceData: '{}',
  customEntries: null,
  status: 'pending_review' as const,
  userId: 'user-123',
  dmMessageId: null,
  createdAt: 1000,
  updatedAt: 1000,
}

const customEntries = {
  scheduledMeetings: ['Retro mobile'],
  directCalls: ['Call com produto'],
}

describe('approveStandup', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('persiste customEntries, faz merge e aprova com sucesso', async () => {
    const recordWithEntries = {
      ...pendingRecord,
      customEntries,
      updatedAt: 1100,
    }
    const mergedContent = mergeCustomEntries(
      pendingRecord.content,
      pendingRecord.meetingType,
      customEntries,
    )
    const recordWithMergedContent = {
      ...recordWithEntries,
      content: mergedContent,
      updatedAt: 1200,
    }
    const approvedRecord = {
      ...recordWithMergedContent,
      status: 'approved' as const,
      updatedAt: 1300,
    }

    mocks.repoFindByIdForUser.mockResolvedValue(Result.ok(pendingRecord))
    mocks.repoUpdateCustomEntriesForUser.mockResolvedValue(
      Result.ok(recordWithEntries),
    )
    mocks.repoUpdateContentForUser.mockResolvedValue(
      Result.ok(recordWithMergedContent),
    )
    mocks.repoUpdateStatusForUser.mockResolvedValue(Result.ok(approvedRecord))

    const result = await approveStandup(
      'standup-abc',
      'user-123',
      { databaseUrl: DATABASE_URL },
      customEntries,
    )

    expect(result.isOk()).toBe(true)
    if (result.isOk()) {
      expect(result.value).toEqual(approvedRecord)
    }
    expect(mocks.getDb).toHaveBeenCalledWith(DATABASE_URL)
    expect(mocks.repoFindByIdForUser).toHaveBeenCalledWith(
      'standup-abc',
      'user-123',
    )
    expect(mocks.repoUpdateCustomEntriesForUser).toHaveBeenCalledWith(
      'standup-abc',
      'user-123',
      customEntries,
    )
    expect(mocks.repoUpdateContentForUser).toHaveBeenCalledWith(
      'standup-abc',
      'user-123',
      mergedContent,
    )
    expect(mocks.repoUpdateStatusForUser).toHaveBeenCalledWith(
      'standup-abc',
      'user-123',
      'approved',
    )
  })

  it('aprova sem customEntries e retorna success', async () => {
    const approvedRecord = {
      ...pendingRecord,
      status: 'approved' as const,
      updatedAt: 1300,
    }

    mocks.repoFindByIdForUser.mockResolvedValue(Result.ok(pendingRecord))
    mocks.repoUpdateStatusForUser.mockResolvedValue(Result.ok(approvedRecord))

    const result = await approveStandup('standup-abc', 'user-123', {
      databaseUrl: DATABASE_URL,
    })

    expect(result.isOk()).toBe(true)
    if (result.isOk()) {
      expect(result.value).toEqual(approvedRecord)
    }
    expect(mocks.repoUpdateCustomEntriesForUser).not.toHaveBeenCalled()
    expect(mocks.repoUpdateContentForUser).not.toHaveBeenCalled()
    expect(mocks.repoUpdateStatusForUser).toHaveBeenCalledTimes(1)
    expect(mocks.repoUpdateStatusForUser).toHaveBeenCalledWith(
      'standup-abc',
      'user-123',
      'approved',
    )
  })

  it('retorna Err(InvalidStateTransitionError) quando a transicao nao e permitida', async () => {
    const invalidTransition = new InvalidStateTransitionError({
      from: 'draft',
      to: 'approved',
    })

    mocks.repoFindByIdForUser.mockResolvedValue(
      Result.ok({ ...pendingRecord, status: 'draft' as const }),
    )
    mocks.repoUpdateStatusForUser.mockResolvedValue(
      Result.err(invalidTransition),
    )

    const result = await approveStandup('standup-abc', 'user-123', {
      databaseUrl: DATABASE_URL,
    })

    expect(result.isErr()).toBe(true)
    if (result.isErr()) {
      expect(InvalidStateTransitionError.is(result.error)).toBe(true)
      expect(result.error).toBe(invalidTransition)
    }
  })

  it('retorna Err(NotFoundError) quando o standup nao pertence ao usuario', async () => {
    const notFound = new NotFoundError({
      resource: 'standup',
      id: 'standup-abc',
    })

    mocks.repoFindByIdForUser.mockResolvedValue(Result.err(notFound))

    const result = await approveStandup('standup-abc', 'user-123', {
      databaseUrl: DATABASE_URL,
    })

    expect(result.isErr()).toBe(true)
    if (result.isErr()) {
      expect(NotFoundError.is(result.error)).toBe(true)
      expect(result.error).toBe(notFound)
    }
    expect(mocks.repoUpdateStatusForUser).not.toHaveBeenCalled()
  })

  it('retorna Err(DbError) quando salvar o merge falha no repositorio', async () => {
    const dbError = new DbError({
      operation: 'updateContentForUser',
      message: 'disk full',
    })

    mocks.repoFindByIdForUser.mockResolvedValue(Result.ok(pendingRecord))
    mocks.repoUpdateCustomEntriesForUser.mockResolvedValue(
      Result.ok({ ...pendingRecord, customEntries }),
    )
    mocks.repoUpdateContentForUser.mockResolvedValue(Result.err(dbError))

    const result = await approveStandup(
      'standup-abc',
      'user-123',
      { databaseUrl: DATABASE_URL },
      customEntries,
    )

    expect(result.isErr()).toBe(true)
    if (result.isErr()) {
      expect(result.error).toBe(dbError)
    }
    expect(mocks.repoUpdateStatusForUser).not.toHaveBeenCalled()
  })
})
