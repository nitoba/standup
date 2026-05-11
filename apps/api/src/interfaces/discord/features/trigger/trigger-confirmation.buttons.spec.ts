// apps/api/src/interfaces/discord/features/trigger/trigger-confirmation.buttons.spec.ts
import { describe, expect, it, vi } from 'vitest'
import { asButtonContext } from '../../../../test/discord/make-context'
import { makeButtonInteraction } from '../../../../test/discord/mock-interaction'
import { TriggerConfirmationButtons } from './trigger-confirmation.buttons'

function makeInteraction(customId: string) {
  return Object.assign(makeButtonInteraction(), { customId })
}

describe('TriggerConfirmationButtons', () => {
  it('forwards confirm action to TriggerConfirmationService', async () => {
    const trigger = { handleButton: vi.fn().mockResolvedValue(undefined) }
    const buttons = new TriggerConfirmationButtons(trigger as never)
    const interaction = makeInteraction('standup-trigger:confirm:req-1')

    await buttons.onConfirm(asButtonContext(interaction), 'req-1')

    expect(trigger.handleButton).toHaveBeenCalledWith(
      interaction,
      'confirm',
      'req-1',
    )
  })

  it('forwards cancel action to TriggerConfirmationService', async () => {
    const trigger = { handleButton: vi.fn().mockResolvedValue(undefined) }
    const buttons = new TriggerConfirmationButtons(trigger as never)
    const interaction = makeInteraction('standup-trigger:cancel:req-1')

    await buttons.onCancel(asButtonContext(interaction), 'req-1')

    expect(trigger.handleButton).toHaveBeenCalledWith(
      interaction,
      'cancel',
      'req-1',
    )
  })
})
