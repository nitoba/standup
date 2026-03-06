import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReminderState } from '../scheduler.js'
import { createInternalRouter } from './router.js'
import type { StandupJobOptions } from './trigger/standup.js'

const INTERNAL_SECRET = 'test-secret'

function makeReminderState(overrides?: Partial<ReminderState>): ReminderState {
  return { snoozedUntil: null, cancelledDate: null, ...overrides }
}

function makeRequest(
  path: string,
  secret: string | null = INTERNAL_SECRET,
  body?: Record<string, unknown>,
): Request {
  const headers: Record<string, string> = {}
  if (secret !== null) headers['x-internal-secret'] = secret
  if (body) headers['content-type'] = 'application/json'

  return new Request(`http://localhost${path}`, {
    method: 'POST',
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })
}

describe('createInternalRouter', () => {
  const triggerStandupJob =
    vi.fn<(options?: StandupJobOptions) => Promise<void>>()

  beforeEach(() => {
    vi.clearAllMocks()
    triggerStandupJob.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // ---------------------------------------------------------------------------
  // Auth middleware
  // ---------------------------------------------------------------------------

  it('retorna 401 quando secret esta ausente', async () => {
    const app = createInternalRouter({
      internalSecret: INTERNAL_SECRET,
      triggerStandupJob,
      reminderState: makeReminderState(),
    })

    const res = await app.fetch(makeRequest('/internal/trigger/standup', null))

    expect(res.status).toBe(401)
    expect(triggerStandupJob).not.toHaveBeenCalled()
  })

  it('retorna 401 quando secret esta incorreto', async () => {
    const app = createInternalRouter({
      internalSecret: INTERNAL_SECRET,
      triggerStandupJob,
      reminderState: makeReminderState(),
    })

    const res = await app.fetch(
      makeRequest('/internal/trigger/standup', 'wrong-secret'),
    )

    expect(res.status).toBe(401)
    expect(triggerStandupJob).not.toHaveBeenCalled()
  })

  // ---------------------------------------------------------------------------
  // POST /internal/trigger/standup
  // ---------------------------------------------------------------------------

  it('retorna 202 e dispara runStandupJob quando secret esta correto', async () => {
    const app = createInternalRouter({
      internalSecret: INTERNAL_SECRET,
      triggerStandupJob,
      reminderState: makeReminderState(),
    })

    const res = await app.fetch(makeRequest('/internal/trigger/standup'))

    expect(res.status).toBe(202)
    const body = (await res.json()) as { ok: boolean; accepted: boolean }
    expect(body.ok).toBe(true)
    expect(body.accepted).toBe(true)
    expect(triggerStandupJob).toHaveBeenCalledTimes(1)
  })

  it('retorna 500 quando dispatch do trigger falha antes de iniciar', async () => {
    triggerStandupJob.mockImplementationOnce(() => {
      throw new Error('dispatch failed')
    })

    const app = createInternalRouter({
      internalSecret: INTERNAL_SECRET,
      triggerStandupJob,
      reminderState: makeReminderState(),
    })

    const res = await app.fetch(makeRequest('/internal/trigger/standup'))

    expect(res.status).toBe(500)
  })

  it('passa extraContext e forceRegenerate ao triggerStandupJob quando body presente', async () => {
    const app = createInternalRouter({
      internalSecret: INTERNAL_SECRET,
      triggerStandupJob,
      reminderState: makeReminderState(),
    })

    const res = await app.fetch(
      makeRequest('/internal/trigger/standup', INTERNAL_SECRET, {
        extraContext: 'focar mais no card #123',
        forceRegenerate: true,
      }),
    )

    expect(res.status).toBe(202)
    expect(triggerStandupJob).toHaveBeenCalledWith({
      extraContext: 'focar mais no card #123',
      forceRegenerate: true,
    })
  })

  it('funciona sem body (backwards-compatible)', async () => {
    const app = createInternalRouter({
      internalSecret: INTERNAL_SECRET,
      triggerStandupJob,
      reminderState: makeReminderState(),
    })

    const res = await app.fetch(makeRequest('/internal/trigger/standup'))

    expect(res.status).toBe(202)
    expect(triggerStandupJob).toHaveBeenCalledWith(undefined)
  })

  // ---------------------------------------------------------------------------
  // POST /internal/reminder/snooze
  // ---------------------------------------------------------------------------

  it('snooze: retorna 200 e define snoozedUntil no estado', async () => {
    const reminderState = makeReminderState()
    const before = new Date()

    const app = createInternalRouter({
      internalSecret: INTERNAL_SECRET,
      triggerStandupJob,
      reminderState,
    })

    const res = await app.fetch(makeRequest('/internal/reminder/snooze'))

    expect(res.status).toBe(200)
    const body = (await res.json()) as { ok: boolean; snoozedUntil: string }
    expect(body.ok).toBe(true)
    expect(reminderState.snoozedUntil).not.toBeNull()

    // snoozedUntil deve ser ~15min no futuro
    const snoozedAt = reminderState.snoozedUntil as Date
    expect(snoozedAt.getTime()).toBeGreaterThan(
      before.getTime() + 14 * 60 * 1000,
    )
    expect(snoozedAt.getTime()).toBeLessThan(before.getTime() + 16 * 60 * 1000)
  })

  it('snooze: retorna 401 quando secret esta ausente', async () => {
    const reminderState = makeReminderState()
    const app = createInternalRouter({
      internalSecret: INTERNAL_SECRET,
      triggerStandupJob,
      reminderState,
    })

    const res = await app.fetch(makeRequest('/internal/reminder/snooze', null))

    expect(res.status).toBe(401)
    expect(reminderState.snoozedUntil).toBeNull()
  })

  // ---------------------------------------------------------------------------
  // POST /internal/reminder/cancel
  // ---------------------------------------------------------------------------

  it('cancel: retorna 200 e define cancelledDate como hoje', async () => {
    const reminderState = makeReminderState()
    const today = new Date().toISOString().slice(0, 10)

    const app = createInternalRouter({
      internalSecret: INTERNAL_SECRET,
      triggerStandupJob,
      reminderState,
    })

    const res = await app.fetch(makeRequest('/internal/reminder/cancel'))

    expect(res.status).toBe(200)
    const body = (await res.json()) as { ok: boolean; cancelledDate: string }
    expect(body.ok).toBe(true)
    expect(body.cancelledDate).toBe(today)
    expect(reminderState.cancelledDate).toBe(today)
  })

  it('cancel: retorna 401 quando secret esta ausente', async () => {
    const reminderState = makeReminderState()
    const app = createInternalRouter({
      internalSecret: INTERNAL_SECRET,
      triggerStandupJob,
      reminderState,
    })

    const res = await app.fetch(makeRequest('/internal/reminder/cancel', null))

    expect(res.status).toBe(401)
    expect(reminderState.cancelledDate).toBeNull()
  })
})
