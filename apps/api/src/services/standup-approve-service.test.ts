import {
  DbError,
  ExternalServiceError,
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
  meetingType: '📆 (Planning Web)',
  content: '**Standup (09/03/2026)**\n📆 (Planning Web)\n\n- Item base',
  sourceData: '{}',
  customEntries: null,
  status: 'pending_review' as const,
  userId: 'user-123',
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

  it('persiste customEntries, faz merge, aprova, publica e marca como published', async () => {
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
    const publishedRecord = {
      ...approvedRecord,
      status: 'published' as const,
      updatedAt: 1400,
    }
    const publishApprovedStandup = vi
      .fn()
      .mockResolvedValue(Result.ok(undefined))

    mocks.repoFindByIdForUser.mockResolvedValue(Result.ok(pendingRecord))
    mocks.repoUpdateCustomEntriesForUser.mockResolvedValue(
      Result.ok(recordWithEntries),
    )
    mocks.repoUpdateContentForUser.mockResolvedValue(
      Result.ok(recordWithMergedContent),
    )
    mocks.repoUpdateStatusForUser
      .mockResolvedValueOnce(Result.ok(approvedRecord))
      .mockResolvedValueOnce(Result.ok(publishedRecord))

    const result = await approveStandup(
      'standup-abc',
      'user-123',
      {
        databaseUrl: DATABASE_URL,
        publishApprovedStandup,
      },
      customEntries,
    )

    expect(result.isOk()).toBe(true)
    if (result.isOk()) {
      expect(result.value.kind).toBe('success')
      expect(result.value.standup).toEqual(publishedRecord)
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
    expect(mocks.repoUpdateStatusForUser).toHaveBeenNthCalledWith(
      1,
      'standup-abc',
      'user-123',
      'approved',
    )
    expect(publishApprovedStandup).toHaveBeenCalledWith(approvedRecord)
    expect(mocks.repoUpdateStatusForUser).toHaveBeenNthCalledWith(
      2,
      'standup-abc',
      'user-123',
      'published',
    )
  })

  it('retorna publish_failed quando a publicacao falha depois da aprovacao', async () => {
    const approvedRecord = {
      ...pendingRecord,
      status: 'approved' as const,
      updatedAt: 1300,
    }
    const publishApprovedStandup = vi.fn().mockResolvedValue(
      Result.err(
        new ExternalServiceError({
          service: 'discord',
          message: 'Channel not found',
        }),
      ),
    )

    mocks.repoFindByIdForUser.mockResolvedValue(Result.ok(pendingRecord))
    mocks.repoUpdateStatusForUser.mockResolvedValue(Result.ok(approvedRecord))

    const result = await approveStandup('standup-abc', 'user-123', {
      databaseUrl: DATABASE_URL,
      publishApprovedStandup,
    })

    expect(result.isOk()).toBe(true)
    if (result.isOk()) {
      expect(result.value.kind).toBe('publish_failed')
      expect(result.value.standup).toEqual(approvedRecord)
      expect(result.value.error.service).toBe('discord')
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

  it('retorna success com standup aprovado quando publicar funciona mas persistir published falha', async () => {
    const approvedRecord = {
      ...pendingRecord,
      status: 'approved' as const,
      updatedAt: 1300,
    }
    const publishApprovedStandup = vi
      .fn()
      .mockResolvedValue(Result.ok(undefined))
    const dbError = new DbError({
      operation: 'updateStatusForUser',
      message: 'database locked',
    })

    mocks.repoFindByIdForUser.mockResolvedValue(Result.ok(pendingRecord))
    mocks.repoUpdateStatusForUser
      .mockResolvedValueOnce(Result.ok(approvedRecord))
      .mockResolvedValueOnce(Result.err(dbError))

    const result = await approveStandup('standup-abc', 'user-123', {
      databaseUrl: DATABASE_URL,
      publishApprovedStandup,
    })

    expect(result.isOk()).toBe(true)
    if (result.isOk()) {
      expect(result.value.kind).toBe('success')
      expect(result.value.standup).toEqual(approvedRecord)
    }
    expect(publishApprovedStandup).toHaveBeenCalledWith(approvedRecord)
    expect(mocks.repoUpdateStatusForUser).toHaveBeenNthCalledWith(
      1,
      'standup-abc',
      'user-123',
      'approved',
    )
    expect(mocks.repoUpdateStatusForUser).toHaveBeenNthCalledWith(
      2,
      'standup-abc',
      'user-123',
      'published',
    )
  })

  it('retorna invalid_transition quando pending_review -> approved nao e permitido', async () => {
    const invalidTransition = new InvalidStateTransitionError({
      from: 'draft',
      to: 'approved',
    })
    const publishApprovedStandup = vi.fn()

    mocks.repoFindByIdForUser.mockResolvedValue(
      Result.ok({ ...pendingRecord, status: 'draft' as const }),
    )
    mocks.repoUpdateStatusForUser.mockResolvedValue(
      Result.err(invalidTransition),
    )

    const result = await approveStandup('standup-abc', 'user-123', {
      databaseUrl: DATABASE_URL,
      publishApprovedStandup,
    })

    expect(result.isOk()).toBe(true)
    if (result.isOk()) {
      expect(result.value.kind).toBe('invalid_transition')
      expect(result.value.error).toBe(invalidTransition)
    }
    expect(publishApprovedStandup).not.toHaveBeenCalled()
  })

  it('retorna not_found quando o standup nao pertence ao usuario', async () => {
    const notFound = new NotFoundError({
      resource: 'standup',
      id: 'standup-abc',
    })
    const publishApprovedStandup = vi.fn()

    mocks.repoFindByIdForUser.mockResolvedValue(Result.err(notFound))

    const result = await approveStandup('standup-abc', 'user-123', {
      databaseUrl: DATABASE_URL,
      publishApprovedStandup,
    })

    expect(result.isOk()).toBe(true)
    if (result.isOk()) {
      expect(result.value.kind).toBe('not_found')
      expect(result.value.error).toBe(notFound)
    }
    expect(mocks.repoUpdateStatusForUser).not.toHaveBeenCalled()
    expect(publishApprovedStandup).not.toHaveBeenCalled()
  })

  it('retorna Err(DbError) quando salvar o merge falha no repositorio', async () => {
    const publishApprovedStandup = vi.fn()
    const dbError = new DbError({
      operation: 'updateContentForUser',
      message: 'disk full',
    })

    mocks.repoFindByIdForUser.mockResolvedValue(Result.ok(pendingRecord))
    mocks.repoUpdateCustomEntriesForUser.mockResolvedValue(
      Result.ok({
        ...pendingRecord,
        customEntries,
      }),
    )
    mocks.repoUpdateContentForUser.mockResolvedValue(Result.err(dbError))

    const result = await approveStandup(
      'standup-abc',
      'user-123',
      {
        databaseUrl: DATABASE_URL,
        publishApprovedStandup,
      },
      customEntries,
    )

    expect(result.isErr()).toBe(true)
    if (result.isErr()) {
      expect(result.error).toBe(dbError)
    }
    expect(mocks.repoUpdateStatusForUser).not.toHaveBeenCalled()
    expect(publishApprovedStandup).not.toHaveBeenCalled()
  })
})
