// apps/api/src/interfaces/discord/features/reminder/reminder.buttons.spec.ts
import { describe, expect, it, vi } from 'vitest'
import { asButtonContext } from '../../../../test/discord/make-context'
import { makeButtonInteraction } from '../../../../test/discord/mock-interaction'
import { ReminderButtons } from './reminder.buttons'

function makeInteraction(customId: string) {
  return Object.assign(makeButtonInteraction(), { customId })
}

describe('ReminderButtons', () => {
  it('forwards snooze to legacy reminder service', async () => {
    const svc = { handle: vi.fn().mockResolvedValue(undefined) }
    const buttons = new ReminderButtons(svc as never)
    const interaction = makeInteraction('standup-reminder:snooze')

    await buttons.onSnooze(asButtonContext(interaction))

    expect(svc.handle).toHaveBeenCalledWith(interaction, 'snooze')
  })

  it('forwards cancel-today to legacy reminder service', async () => {
    const svc = { handle: vi.fn().mockResolvedValue(undefined) }
    const buttons = new ReminderButtons(svc as never)
    const interaction = makeInteraction('standup-reminder:cancel-today')

    await buttons.onCancelToday(asButtonContext(interaction))

    expect(svc.handle).toHaveBeenCalledWith(interaction, 'cancel-today')
  })
})
