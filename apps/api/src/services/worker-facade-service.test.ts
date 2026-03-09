import { ExternalServiceError } from '@standup/domain'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  cancelReminderForToday,
  listRepos,
  runStandupNow,
  snoozeReminder,
} from './worker-facade-service.js'

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

const BASE_RUN_OPTIONS = {
  userId: 'user-1',
  discordUserId: 'discord-1',
  reposRootPath: '/repos',
  selectedRepos: ['repo-a', 'repo-b'],
  gitAuthor: 'dev@example.com',
}

describe('worker-facade-service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('listRepos retorna repos validos quando worker responde 200', async () => {
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
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:3335/internal/repos/list',
      {
        method: 'GET',
        headers: {
          'x-internal-secret': 'internal-secret',
        },
      },
    )
  })

  it('listRepos retorna ExternalServiceError quando worker responde nao-2xx', async () => {
    mockFetch.mockResolvedValue(response(503))

    const result = await listRepos(BASE_DEPS)

    expect(result.isErr()).toBe(true)
    if (result.isErr()) {
      expect(ExternalServiceError.is(result.error)).toBe(true)
      expect(result.error.service).toBe('worker')
      expect(result.error.message).toContain('HTTP 503')
    }
  })

  it('runStandupNow retorna Ok quando worker responde 202', async () => {
    mockFetch.mockResolvedValue(response(202))

    const result = await runStandupNow(BASE_DEPS, BASE_RUN_OPTIONS)

    expect(result.isOk()).toBe(true)
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:3335/internal/trigger/standup',
      {
        method: 'POST',
        headers: {
          'x-internal-secret': 'internal-secret',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          ...BASE_RUN_OPTIONS,
          extraContext: undefined,
          forceRegenerate: undefined,
          rewriteFromStandupId: undefined,
          rewriteInstruction: undefined,
        }),
      },
    )
  })

  it('runStandupNow retorna ExternalServiceError quando worker nao responde 202', async () => {
    mockFetch.mockResolvedValue(response(200))

    const result = await runStandupNow(BASE_DEPS, BASE_RUN_OPTIONS)

    expect(result.isErr()).toBe(true)
    if (result.isErr()) {
      expect(ExternalServiceError.is(result.error)).toBe(true)
      expect(result.error.service).toBe('worker')
      expect(result.error.message).toContain('HTTP 200')
    }
  })

  it('snoozeReminder retorna ack quando worker responde 200', async () => {
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
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:3335/internal/reminder/snooze',
      {
        method: 'POST',
        headers: {
          'x-internal-secret': 'internal-secret',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ userId: 'user-1' }),
      },
    )
  })

  it('cancelReminderForToday retorna ack quando worker responde 200', async () => {
    mockFetch.mockResolvedValue(
      response(200, {
        ok: true,
        cancelledDate: '2026-03-09',
      }),
    )

    const result = await cancelReminderForToday(BASE_DEPS, { userId: 'user-1' })

    expect(result.isOk()).toBe(true)
    if (result.isOk()) {
      expect(result.value).toEqual({
        ok: true,
        cancelledDate: '2026-03-09',
      })
    }
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:3335/internal/reminder/cancel',
      {
        method: 'POST',
        headers: {
          'x-internal-secret': 'internal-secret',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ userId: 'user-1' }),
      },
    )
  })

  it('reminder mutations retornam ExternalServiceError quando worker nao responde 200', async () => {
    mockFetch.mockResolvedValue(response(202))

    const result = await cancelReminderForToday(BASE_DEPS, { userId: 'user-1' })

    expect(result.isErr()).toBe(true)
    if (result.isErr()) {
      expect(ExternalServiceError.is(result.error)).toBe(true)
      expect(result.error.service).toBe('worker')
      expect(result.error.message).toContain('HTTP 202')
    }
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
