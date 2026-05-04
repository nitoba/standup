// apps/api/src/interfaces/discord/features/review/review.buttons.spec.ts
import { describe, expect, it, vi } from 'vitest'
import { asButtonContext } from '../../../../test/discord/make-context'
import { makeButtonInteraction } from '../../../../test/discord/mock-interaction'
import { ReviewButtons } from './review.buttons'

function makeInteraction(customId: string) {
  return Object.assign(makeButtonInteraction(), { customId })
}

describe('ReviewButtons', () => {
  it('forwards approve button to legacy button dispatcher', async () => {
    const dispatcher = { handle: vi.fn().mockResolvedValue(undefined) }
    const buttons = new ReviewButtons(dispatcher as never)
    const interaction = makeInteraction('standup:approve:std-1')

    await buttons.onApprove(asButtonContext(interaction))

    expect(dispatcher.handle).toHaveBeenCalledWith(interaction)
  })

  it('forwards reject button to legacy button dispatcher', async () => {
    const dispatcher = { handle: vi.fn().mockResolvedValue(undefined) }
    const buttons = new ReviewButtons(dispatcher as never)
    const interaction = makeInteraction('standup:reject:std-1')

    await buttons.onReject(asButtonContext(interaction))

    expect(dispatcher.handle).toHaveBeenCalledWith(interaction)
  })

  it('forwards adjust button to legacy button dispatcher', async () => {
    const dispatcher = { handle: vi.fn().mockResolvedValue(undefined) }
    const buttons = new ReviewButtons(dispatcher as never)
    const interaction = makeInteraction('standup:adjust:std-1')

    await buttons.onAdjust(asButtonContext(interaction))

    expect(dispatcher.handle).toHaveBeenCalledWith(interaction)
  })

  it('forwards regenerate button to legacy button dispatcher', async () => {
    const dispatcher = { handle: vi.fn().mockResolvedValue(undefined) }
    const buttons = new ReviewButtons(dispatcher as never)
    const interaction = makeInteraction('standup:regenerate:std-1')

    await buttons.onRegenerate(asButtonContext(interaction))

    expect(dispatcher.handle).toHaveBeenCalledWith(interaction)
  })
})
