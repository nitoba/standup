import {
  DbError,
  InvalidStateTransitionError,
  NotFoundError,
  Result,
  ValidationError,
} from '@standup/domain'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// ---------------------------------------------------------------------------
// vi.hoisted
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => ({
  repoFindByIdForUser: vi.fn(),
  repoUpdateStatus: vi.fn(),
  hasActiveSession: vi.fn(),
  getDb: vi.fn().mockReturnValue({}),
  publishStandup: vi.fn(),
}))

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@standup/db', () => {
  function StandupRepository() {
    return {
      findByIdForUser: mocks.repoFindByIdForUser,
      updateStatus: mocks.repoUpdateStatus,
      updateStatusForUser: mocks.repoUpdateStatus,
    }
  }
  function UserRepository() {
    return {
      hasActiveSession: mocks.hasActiveSession,
    }
  }
  return { getDb: mocks.getDb, StandupRepository, UserRepository }
})

vi.mock('../notifications/publish-standup.js', () => ({
  publishStandup: mocks.publishStandup,
}))

// ---------------------------------------------------------------------------
// Import após mocks
// ---------------------------------------------------------------------------

import { handleStandupInteraction } from './interaction-handler.js'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const DATABASE_URL = ':memory:'
const CHANNEL_ID = 'channel-123'

const pendingRecord = {
  id: 'standup-abc',
  date: '2026-03-04',
  meetingType: 'daily',
  content: '## Standup\n\n- feat: add feature',
  sourceData: '{}',
  status: 'pending_review' as const,
  createdAt: 1000,
  updatedAt: 1000,
}

const approvedRecord = { ...pendingRecord, status: 'approved' as const }
const rejectedRecord = { ...pendingRecord, status: 'rejected' as const }
const publishedRecord = { ...pendingRecord, status: 'published' as const }

const deps = {
  actorDiscordId: 'discord-user-123',
  databaseUrl: DATABASE_URL,
  discordChannelId: CHANNEL_ID,
}

// Fake Discord client — apenas para satisfazer o tipo; publishStandup é mockado
const fakeClient = {} as unknown as import('discord.js').Client

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('handleStandupInteraction', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.hasActiveSession.mockReturnValue(
      Result.ok({ userId: 'user-123', hasSession: true }),
    )
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // -------------------------------------------------------------------------
  // approve
  // -------------------------------------------------------------------------

  describe('approve', () => {
    it('aprova standup, publica no canal e retorna mensagem de sucesso', async () => {
      mocks.repoFindByIdForUser.mockResolvedValue(Result.ok(pendingRecord))
      mocks.repoUpdateStatus
        .mockResolvedValueOnce(Result.ok(approvedRecord)) // pending_review → approved
        .mockResolvedValueOnce(Result.ok(publishedRecord)) // approved → published
      mocks.publishStandup.mockResolvedValue(Result.ok(undefined))

      const result = await handleStandupInteraction(
        'approve',
        'standup-abc',
        deps,
        fakeClient,
      )

      expect(result.status).toBe('ok')
      if (result.status === 'ok') {
        expect(result.value.action).toBe('approve')
        expect(result.value.standupId).toBe('standup-abc')
        expect(result.value.message).toMatch(/aprovado/i)
        expect(result.value.message).toMatch(/publicado/i)
      }
      expect(mocks.repoUpdateStatus).toHaveBeenCalledWith(
        'standup-abc',
        'user-123',
        'approved',
      )
      expect(mocks.publishStandup).toHaveBeenCalledWith(
        approvedRecord,
        fakeClient,
        CHANNEL_ID,
      )
      expect(mocks.repoUpdateStatus).toHaveBeenCalledWith(
        'standup-abc',
        'user-123',
        'published',
      )
    })

    it('aprova e retorna aviso quando publicação no canal falha (non-fatal)', async () => {
      mocks.repoFindByIdForUser.mockResolvedValue(Result.ok(pendingRecord))
      mocks.repoUpdateStatus.mockResolvedValue(Result.ok(approvedRecord))
      mocks.publishStandup.mockResolvedValue(
        Result.err(
          new DbError({ operation: 'publish', message: 'Channel not found' }),
        ),
      )

      const result = await handleStandupInteraction(
        'approve',
        'standup-abc',
        deps,
        fakeClient,
      )

      expect(result.status).toBe('ok')
      if (result.status === 'ok') {
        expect(result.value.message).toMatch(/aprovado/i)
        // Avisa que publicação falhou mas standup está aprovado
        expect(result.value.message).toMatch(/publicação falhou/i)
      }
      // Não deve tentar transicionar para published se publicação falhou
      expect(mocks.repoUpdateStatus).toHaveBeenCalledTimes(1)
      expect(mocks.repoUpdateStatus).toHaveBeenCalledWith(
        'standup-abc',
        'user-123',
        'approved',
      )
    })

    it('retorna NotFoundError quando standup não existe', async () => {
      mocks.repoFindByIdForUser.mockResolvedValue(
        Result.err(
          new NotFoundError({ resource: 'standup', id: 'standup-abc' }),
        ),
      )

      const result = await handleStandupInteraction(
        'approve',
        'standup-abc',
        deps,
        fakeClient,
      )

      expect(result.status).toBe('error')
      if (result.isErr()) {
        expect(NotFoundError.is(result.error)).toBe(true)
      }
      expect(mocks.repoUpdateStatus).not.toHaveBeenCalled()
      expect(mocks.publishStandup).not.toHaveBeenCalled()
    })

    it('retorna InvalidStateTransitionError quando transição é inválida', async () => {
      mocks.repoFindByIdForUser.mockResolvedValue(Result.ok(pendingRecord))
      mocks.repoUpdateStatus.mockResolvedValue(
        Result.err(
          new InvalidStateTransitionError({
            from: 'pending_review',
            to: 'approved',
          }),
        ),
      )

      const result = await handleStandupInteraction(
        'approve',
        'standup-abc',
        deps,
        fakeClient,
      )

      expect(result.status).toBe('error')
      if (result.isErr()) {
        expect(InvalidStateTransitionError.is(result.error)).toBe(true)
      }
      expect(mocks.publishStandup).not.toHaveBeenCalled()
    })
  })

  // -------------------------------------------------------------------------
  // reject
  // -------------------------------------------------------------------------

  describe('reject', () => {
    it('rejeita standup e retorna mensagem de sucesso', async () => {
      mocks.repoFindByIdForUser.mockResolvedValue(Result.ok(pendingRecord))
      mocks.repoUpdateStatus.mockResolvedValue(Result.ok(rejectedRecord))

      const result = await handleStandupInteraction(
        'reject',
        'standup-abc',
        deps,
      )

      expect(result.status).toBe('ok')
      if (result.status === 'ok') {
        expect(result.value.action).toBe('reject')
        expect(result.value.standupId).toBe('standup-abc')
        expect(result.value.message).toMatch(/rejeitado/i)
      }
      expect(mocks.repoUpdateStatus).toHaveBeenCalledWith(
        'standup-abc',
        'user-123',
        'rejected',
      )
      expect(mocks.publishStandup).not.toHaveBeenCalled()
    })

    it('retorna NotFoundError quando standup não existe', async () => {
      mocks.repoFindByIdForUser.mockResolvedValue(
        Result.err(
          new NotFoundError({ resource: 'standup', id: 'standup-abc' }),
        ),
      )

      const result = await handleStandupInteraction(
        'reject',
        'standup-abc',
        deps,
      )

      expect(result.status).toBe('error')
      if (result.isErr()) {
        expect(NotFoundError.is(result.error)).toBe(true)
      }
    })
  })

  // -------------------------------------------------------------------------
  // regenerate
  // -------------------------------------------------------------------------

  describe('regenerate', () => {
    it('rejeita standup e retorna mensagem indicando regeneração', async () => {
      mocks.repoFindByIdForUser.mockResolvedValue(Result.ok(pendingRecord))
      mocks.repoUpdateStatus.mockResolvedValue(Result.ok(rejectedRecord))

      const result = await handleStandupInteraction(
        'regenerate',
        'standup-abc',
        deps,
      )

      expect(result.status).toBe('ok')
      if (result.status === 'ok') {
        expect(result.value.action).toBe('regenerate')
        expect(result.value.standupId).toBe('standup-abc')
        expect(result.value.message).toMatch(/rejeitado/i)
        expect(result.value.message).toMatch(/regenera/i)
      }
      expect(mocks.repoUpdateStatus).toHaveBeenCalledWith(
        'standup-abc',
        'user-123',
        'rejected',
      )
      expect(mocks.publishStandup).not.toHaveBeenCalled()
    })

    it('retorna NotFoundError quando standup não existe', async () => {
      mocks.repoFindByIdForUser.mockResolvedValue(
        Result.err(
          new NotFoundError({ resource: 'standup', id: 'standup-abc' }),
        ),
      )

      const result = await handleStandupInteraction(
        'regenerate',
        'standup-abc',
        deps,
      )

      expect(result.status).toBe('error')
      if (result.isErr()) {
        expect(NotFoundError.is(result.error)).toBe(true)
      }
    })
  })

  // -------------------------------------------------------------------------
  // ação desconhecida
  // -------------------------------------------------------------------------

  describe('ação desconhecida', () => {
    it('retorna ValidationError para ação não reconhecida', async () => {
      const result = await handleStandupInteraction(
        'unknown' as never,
        'standup-abc',
        deps,
      )

      expect(result.status).toBe('error')
      if (result.isErr()) {
        expect(ValidationError.is(result.error)).toBe(true)
      }
      expect(mocks.repoFindByIdForUser).not.toHaveBeenCalled()
    })

    it('retorna NotFoundError quando actorDiscordId não pode ser resolvido', async () => {
      mocks.hasActiveSession.mockReturnValue(Result.ok(null))

      const result = await handleStandupInteraction(
        'approve',
        'standup-abc',
        deps,
        fakeClient,
      )

      expect(result.status).toBe('error')
      if (result.isErr()) {
        expect(NotFoundError.is(result.error)).toBe(true)
      }
      expect(mocks.repoFindByIdForUser).not.toHaveBeenCalled()
    })
  })
})
