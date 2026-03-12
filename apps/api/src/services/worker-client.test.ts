import { ExternalServiceError } from '@standup/domain'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  cancelReminderForToday,
  listRepos,
  snoozeReminder,
  triggerStandupJob,
  triggerWeeklyDigestJob,
} from './worker-client.js'

// tracedFetch delegates to fetch internally, so stubbing fetch is sufficient
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

function response(status: number, body?: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(body),
  } as unknown as Response
}

const BASE_DEPS = {
  workerInternalUrl: 'http://localhost:3335',
  internalSecret: 'internal-secret',
}

const BASE_TRIGGER_OPTIONS = {
  userId: 'user-1',
  discordUserId: 'discord-1',
  reposRootPath: '/repos',
  selectedRepos: ['repo-a', 'repo-b'],
  gitAuthor: 'dev@example.com',
  timezone: 'America/Sao_Paulo',
}

describe('worker-client', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // ---------------------------------------------------------------------------
  // triggerStandupJob
  // ---------------------------------------------------------------------------

  describe('triggerStandupJob', () => {
    it('retorna Ok quando worker responde 202 (sem opcoes extras)', async () => {
      mockFetch.mockResolvedValue(response(202))

      const result = await triggerStandupJob(BASE_DEPS, BASE_TRIGGER_OPTIONS)

      expect(result.isOk()).toBe(true)
    })

    it('envia body com extraContext e forceRegenerate quando opcoes presentes', async () => {
      mockFetch.mockResolvedValue(response(202))

      const result = await triggerStandupJob(BASE_DEPS, {
        ...BASE_TRIGGER_OPTIONS,
        extraContext: 'focar no card #123',
        forceRegenerate: true,
      })

      expect(result.isOk()).toBe(true)
    })

    it('envia opcoes de rewrite para o worker quando fornecidas', async () => {
      mockFetch.mockResolvedValue(response(202))

      const result = await triggerStandupJob(BASE_DEPS, {
        ...BASE_TRIGGER_OPTIONS,
        forceRegenerate: true,
        rewriteFromStandupId: 'standup-abc',
        rewriteInstruction: 'Ajustar para remover secao antiga',
      })

      expect(result.isOk()).toBe(true)
    })

    it('envia replaceStandupId para o worker quando fornecido', async () => {
      mockFetch.mockResolvedValue(response(202))

      const result = await triggerStandupJob(BASE_DEPS, {
        ...BASE_TRIGGER_OPTIONS,
        forceRegenerate: true,
        replaceStandupId: 'standup-abc',
      })

      expect(result.isOk()).toBe(true)
    })

    it('envia reuseExistingSource para o worker quando fornecido', async () => {
      mockFetch.mockResolvedValue(response(202))

      const result = await triggerStandupJob(BASE_DEPS, {
        ...BASE_TRIGGER_OPTIONS,
        forceRegenerate: true,
        replaceStandupId: 'standup-abc',
        reuseExistingSource: true,
      })

      expect(result.isOk()).toBe(true)
    })

    it('retorna ExternalServiceError quando worker responde status diferente de 202', async () => {
      mockFetch.mockResolvedValue(response(503))

      const result = await triggerStandupJob(BASE_DEPS, BASE_TRIGGER_OPTIONS)

      expect(result.isErr()).toBe(true)
      if (result.isErr()) {
        expect(ExternalServiceError.is(result.error)).toBe(true)
        expect(result.error.service).toBe('worker')
        expect(result.error.message).toContain('HTTP 503')
      }
    })

    it('retorna ExternalServiceError quando fetch falha', async () => {
      mockFetch.mockRejectedValue(new Error('ECONNREFUSED'))

      const result = await triggerStandupJob(BASE_DEPS, BASE_TRIGGER_OPTIONS)

      expect(result.isErr()).toBe(true)
      if (result.isErr()) {
        expect(ExternalServiceError.is(result.error)).toBe(true)
        expect(result.error.service).toBe('worker')
        expect(result.error.message).toContain('ECONNREFUSED')
      }
    })
  })

  // ---------------------------------------------------------------------------
  // triggerWeeklyDigestJob
  // ---------------------------------------------------------------------------

  describe('triggerWeeklyDigestJob', () => {
    it('retorna Ok quando worker responde 202', async () => {
      mockFetch.mockResolvedValue(response(202))

      const result = await triggerWeeklyDigestJob(BASE_DEPS, 'user-1')

      expect(result.isOk()).toBe(true)
    })

    it('retorna ExternalServiceError quando worker nao responde 202', async () => {
      mockFetch.mockResolvedValue(response(500))

      const result = await triggerWeeklyDigestJob(BASE_DEPS, 'user-1')

      expect(result.isErr()).toBe(true)
      if (result.isErr()) {
        expect(ExternalServiceError.is(result.error)).toBe(true)
        expect(result.error.service).toBe('worker')
      }
    })
  })

  // ---------------------------------------------------------------------------
  // listRepos
  // ---------------------------------------------------------------------------

  describe('listRepos', () => {
    it('retorna repos validos quando worker responde 200', async () => {
      mockFetch.mockResolvedValue(
        response(200, {
          repos: [
            { id: '1', name: 'repo-a', project: 'proj-a' },
            { id: '2', name: 'repo-b', project: 'proj-b' },
            { id: 3, name: 'invalid', project: 'proj-c' },
          ],
        }),
      )

      const result = await listRepos(BASE_DEPS)

      expect(result.isOk()).toBe(true)
      if (result.isOk()) {
        expect(result.value).toEqual([
          { id: '1', name: 'repo-a', project: 'proj-a' },
          { id: '2', name: 'repo-b', project: 'proj-b' },
        ])
      }
    })

    it('retorna ExternalServiceError quando worker responde nao-2xx', async () => {
      mockFetch.mockResolvedValue(response(503))

      const result = await listRepos(BASE_DEPS)

      expect(result.isErr()).toBe(true)
      if (result.isErr()) {
        expect(ExternalServiceError.is(result.error)).toBe(true)
        expect(result.error.service).toBe('worker')
        expect(result.error.message).toContain('HTTP 503')
      }
    })
  })

  // ---------------------------------------------------------------------------
  // Reminders
  // ---------------------------------------------------------------------------

  describe('snoozeReminder', () => {
    it('retorna ack quando worker responde 200', async () => {
      mockFetch.mockResolvedValue(
        response(200, {
          ok: true,
          snoozedUntil: '2026-03-09T18:00:00.000Z',
        }),
      )

      const result = await snoozeReminder(BASE_DEPS, { userId: 'user-1' })

      expect(result.isOk()).toBe(true)
      if (result.isOk()) {
        expect(result.value).toEqual({
          ok: true,
          snoozedUntil: '2026-03-09T18:00:00.000Z',
        })
      }
    })
  })

  describe('cancelReminderForToday', () => {
    it('retorna ack quando worker responde 200', async () => {
      mockFetch.mockResolvedValue(
        response(200, {
          ok: true,
          cancelledDate: '2026-03-09',
        }),
      )

      const result = await cancelReminderForToday(BASE_DEPS, {
        userId: 'user-1',
      })

      expect(result.isOk()).toBe(true)
      if (result.isOk()) {
        expect(result.value).toEqual({
          ok: true,
          cancelledDate: '2026-03-09',
        })
      }
    })

    it('retorna ExternalServiceError quando worker nao responde 200', async () => {
      mockFetch.mockResolvedValue(response(202))

      const result = await cancelReminderForToday(BASE_DEPS, {
        userId: 'user-1',
      })

      expect(result.isErr()).toBe(true)
      if (result.isErr()) {
        expect(ExternalServiceError.is(result.error)).toBe(true)
        expect(result.error.service).toBe('worker')
        expect(result.error.message).toContain('HTTP 202')
      }
    })
  })

  it('retorna ExternalServiceError quando fetch falha', async () => {
    mockFetch.mockRejectedValue(new Error('ECONNREFUSED'))

    const result = await snoozeReminder(BASE_DEPS, { userId: 'user-1' })

    expect(result.isErr()).toBe(true)
    if (result.isErr()) {
      expect(ExternalServiceError.is(result.error)).toBe(true)
      expect(result.error.service).toBe('worker')
      expect(result.error.message).toContain('ECONNREFUSED')
    }
  })
})
