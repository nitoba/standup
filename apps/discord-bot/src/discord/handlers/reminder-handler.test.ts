import type { ButtonInteraction } from 'discord.js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReminderAction } from './reminder-handler.js'
import { handleReminderInteraction } from './reminder-handler.js'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const WORKER_INTERNAL_URL = 'http://localhost:3335'
const API_BASE_URL = 'http://localhost:3333'
const INTERNAL_SECRET = 'test-secret'
const DISCORD_USER_ID = 'user-123'

const deps = {
  workerInternalUrl: WORKER_INTERNAL_URL,
  apiBaseUrl: API_BASE_URL,
  internalSecret: INTERNAL_SECRET,
  discordUserId: DISCORD_USER_ID,
}

function makeInteraction() {
  const deferUpdate = vi.fn().mockResolvedValue(undefined)
  const editReply = vi.fn().mockResolvedValue(undefined)
  return {
    interaction: { deferUpdate, editReply } as unknown as ButtonInteraction,
    deferUpdate,
    editReply,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('handleReminderInteraction', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('run-now', () => {
    it('chama POST na API /standups/trigger e edita reply com emoji ▶', async () => {
      const { interaction, deferUpdate, editReply } = makeInteraction()

      const fetchMock = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(new Response('{}', { status: 200 }))

      await handleReminderInteraction(interaction, 'run-now', deps)

      expect(deferUpdate).toHaveBeenCalledOnce()
      expect(fetchMock).toHaveBeenCalledWith(
        `${API_BASE_URL}/standups/trigger`,
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'x-internal-secret': INTERNAL_SECRET,
          }),
        }),
      )
      expect(editReply).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('▶'),
          components: [],
        }),
      )
    })

    it('edita reply com ❌ quando API falha', async () => {
      const { interaction, editReply } = makeInteraction()

      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response('{}', { status: 500 }),
      )

      await handleReminderInteraction(interaction, 'run-now', deps)

      expect(editReply).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('❌'),
          components: [],
        }),
      )
    })
  })

  describe('snooze', () => {
    it('chama POST no worker /internal/reminder/snooze e edita reply com emoji ⏰', async () => {
      const { interaction, deferUpdate, editReply } = makeInteraction()

      const fetchMock = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(new Response('{}', { status: 200 }))

      await handleReminderInteraction(interaction, 'snooze', deps)

      expect(deferUpdate).toHaveBeenCalledOnce()
      expect(fetchMock).toHaveBeenCalledWith(
        `${WORKER_INTERNAL_URL}/internal/reminder/snooze`,
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'x-internal-secret': INTERNAL_SECRET,
          }),
        }),
      )
      expect(editReply).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('⏰'),
          components: [],
        }),
      )
    })
  })

  describe('cancel-today', () => {
    it('chama POST no worker /internal/reminder/cancel e edita reply com emoji ❌', async () => {
      const { interaction, deferUpdate, editReply } = makeInteraction()

      const fetchMock = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(new Response('{}', { status: 200 }))

      await handleReminderInteraction(interaction, 'cancel-today', deps)

      expect(deferUpdate).toHaveBeenCalledOnce()
      expect(fetchMock).toHaveBeenCalledWith(
        `${WORKER_INTERNAL_URL}/internal/reminder/cancel`,
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'x-internal-secret': INTERNAL_SECRET,
          }),
        }),
      )
      expect(editReply).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('❌'),
          components: [],
        }),
      )
    })

    it('edita reply com ❌ quando worker retorna erro HTTP', async () => {
      const { interaction, editReply } = makeInteraction()

      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response('{}', { status: 503 }),
      )

      await handleReminderInteraction(
        interaction,
        'cancel-today' as ReminderAction,
        deps,
      )

      expect(editReply).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('❌'),
          components: [],
        }),
      )
    })
  })
})
