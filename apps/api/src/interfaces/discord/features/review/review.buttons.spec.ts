// apps/api/src/interfaces/discord/features/review/review.buttons.spec.ts
import { describe, expect, it, vi } from 'vitest'
import { Result } from '../../../../shared/domain'
import { asButtonContext } from '../../../../test/discord/make-context'
import { makeButtonInteraction } from '../../../../test/discord/mock-interaction'
import { ReviewButtons } from './review.buttons'

function makeInteraction(customId: string) {
  return Object.assign(makeButtonInteraction(), { customId })
}

describe('ReviewButtons', () => {
  it('shows approve modal', async () => {
    const reviewActions = { handle: vi.fn() }
    const buttons = new ReviewButtons(reviewActions as never)
    const interaction = makeInteraction('standup:approve:std-1')

    await buttons.onApprove(asButtonContext(interaction), 'std-1')

    expect(interaction.showModal).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          custom_id: 'standup-approve-modal:std-1',
        }),
      }),
    )
  })

  it('rejects standup via ReviewActionService', async () => {
    const reviewActions = {
      handle: vi.fn().mockResolvedValue(
        Result.ok({
          action: 'reject',
          standupId: 'std-1',
          userId: 'user-1',
          newStatus: 'rejected',
          message: 'Standup rejeitado.',
        }),
      ),
    }
    const buttons = new ReviewButtons(reviewActions as never)
    const interaction = makeInteraction('standup:reject:std-1')

    await buttons.onReject(asButtonContext(interaction), 'std-1')

    expect(interaction.deferUpdate).toHaveBeenCalled()
    expect(reviewActions.handle).toHaveBeenCalledWith(
      'reject',
      'std-1',
      'user-1',
    )
    expect(interaction.editReply).toHaveBeenLastCalledWith({
      content: '❌ Standup rejeitado.',
      components: [],
    })
  })

  it('shows adjust modal', async () => {
    const reviewActions = { handle: vi.fn() }
    const buttons = new ReviewButtons(reviewActions as never)
    const interaction = makeInteraction('standup:adjust:std-1')

    await buttons.onAdjust(asButtonContext(interaction), 'std-1')

    expect(interaction.showModal).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          custom_id: 'standup-adjust-modal:std-1',
        }),
      }),
    )
  })

  it('shows regenerate modal', async () => {
    const reviewActions = { handle: vi.fn() }
    const buttons = new ReviewButtons(reviewActions as never)
    const interaction = makeInteraction('standup:regenerate:std-1')

    await buttons.onRegenerate(asButtonContext(interaction), 'std-1')

    expect(interaction.showModal).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          custom_id: 'standup-regenerate-modal:std-1',
        }),
      }),
    )
  })
})
