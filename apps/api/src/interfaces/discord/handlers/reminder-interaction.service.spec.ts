import { describe, expect, it, vi } from 'vitest'
import { ReminderInteractionService } from './reminder-interaction.service'

describe('ReminderInteractionService', () => {
  function makeInteraction() {
    return {
      deferUpdate: vi.fn().mockResolvedValue(undefined),
      editReply: vi.fn().mockResolvedValue(undefined),
      user: { id: 'discord-user-1' },
    }
  }

  it('calls ReminderActionsService directly for snooze', async () => {
    const interaction = makeInteraction()
    const snoozeReminder = vi
      .fn()
      .mockResolvedValue({ ok: true, snoozedUntil: '2026-03-15T10:15:00.000Z' })
    const service = new ReminderInteractionService(
      {
        resolveActiveSession: vi
          .fn()
          .mockResolvedValue({ hasSession: true, userId: 'user-1' }),
        replySessionExpired: vi.fn(),
      } as never,
      { trigger: vi.fn() } as never,
      { snoozeReminder, cancelReminderForToday: vi.fn() } as never,
    )

    await service.handle(interaction as never, 'snooze')

    expect(snoozeReminder).toHaveBeenCalledWith('user-1')
    expect(interaction.editReply).toHaveBeenCalledWith({
      content: '⏰ Standup adiado por 15 minutos.',
      components: [],
    })
  })
})
