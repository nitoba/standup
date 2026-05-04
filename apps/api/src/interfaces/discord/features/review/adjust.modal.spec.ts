// apps/api/src/interfaces/discord/features/review/adjust.modal.spec.ts
import { describe, expect, it, vi } from 'vitest'
import { asModalContext } from '../../../../test/discord/make-context'
import { makeModalInteraction } from '../../../../test/discord/mock-interaction'
import { AdjustModal } from './adjust.modal'

describe('AdjustModal', () => {
  it('forwards adjust modal submission to legacy modal dispatcher', async () => {
    const modals = { handle: vi.fn().mockResolvedValue(undefined) }
    const modal = new AdjustModal(modals as never)
    const interaction = Object.assign(
      makeModalInteraction({ 'adjust-instruction': 'add detail' }),
      {
        customId: 'standup-adjust-modal:std-1',
        client: { user: { tag: 'standup#0001' } },
      },
    )

    await modal.onSubmit(asModalContext(interaction))

    expect(modals.handle).toHaveBeenCalledWith(interaction, interaction.client)
  })
})
