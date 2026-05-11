// apps/api/src/interfaces/discord/features/review/adjust.modal.spec.ts
import { describe, expect, it, vi } from 'vitest'
import { Result } from '../../../../shared/domain'
import { asModalContext } from '../../../../test/discord/make-context'
import { makeModalInteraction } from '../../../../test/discord/mock-interaction'
import { AdjustModal } from './adjust.modal'

describe('AdjustModal', () => {
  it('triggers standup adjustment from adjust modal submission', async () => {
    const auth = {
      resolveActiveSession: vi.fn().mockResolvedValue({
        hasSession: true,
        userId: 'user-1',
      }),
      replySessionExpired: vi.fn(),
    }
    const trigger = {
      trigger: vi.fn().mockResolvedValue(Result.ok({ accepted: true })),
    }
    const reviewActions = { handle: vi.fn() }
    const modal = new AdjustModal(
      auth as never,
      trigger as never,
      reviewActions as never,
    )
    const interaction = Object.assign(
      makeModalInteraction({ 'adjust-instruction': 'add detail' }),
      {
        customId: 'standup-adjust-modal:std-1',
        client: { user: { tag: 'standup#0001' } },
      },
    )

    await modal.onSubmit(asModalContext(interaction), 'std-1')

    expect(interaction.deferUpdate).toHaveBeenCalled()
    expect(trigger.trigger).toHaveBeenCalledWith('user-1', 'user-1', {
      forceRegenerate: true,
      rewriteFromStandupId: 'std-1',
      rewriteInstruction: 'add detail',
      replaceStandupId: 'std-1',
    })
    expect(interaction.editReply).toHaveBeenLastCalledWith({
      content:
        '🛠️ Ajuste solicitado com sucesso. Vou gerar uma nova versão baseada no texto anterior.',
      components: [],
    })
  })
})
