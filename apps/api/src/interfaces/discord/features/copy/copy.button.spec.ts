// apps/api/src/interfaces/discord/features/copy/copy.button.spec.ts
import { describe, expect, it, vi } from 'vitest'
import { asButtonContext } from '../../../../test/discord/make-context'
import { makeButtonInteraction } from '../../../../test/discord/mock-interaction'
import { CopyButton } from './copy.button'

describe('CopyButton', () => {
  it('forwards copy content action to legacy copy service', async () => {
    const copy = { handle: vi.fn().mockResolvedValue(undefined) }
    const button = new CopyButton(copy as never)
    const interaction = Object.assign(makeButtonInteraction(), {
      customId: 'standup-copy:content:std-1',
    })

    await button.onCopy(asButtonContext(interaction), 'std-1')

    expect(copy.handle).toHaveBeenCalledWith(interaction, 'content', 'std-1')
  })
})
