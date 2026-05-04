import { describe, expect, it, vi } from 'vitest'
import { asButtonContext } from '../../../../test/discord/make-context'
import { makeButtonInteraction } from '../../../../test/discord/mock-interaction'
import { SettingsButtons } from './settings.buttons'

describe('SettingsButtons', () => {
  it('forwards edit settings button to settings service', async () => {
    const settings = { handleButton: vi.fn().mockResolvedValue(undefined) }
    const buttons = new SettingsButtons(settings as never)
    const interaction = Object.assign(makeButtonInteraction(), {
      customId: 'settings:edit',
    })

    await buttons.onSettingsButton(asButtonContext(interaction), 'edit')

    expect(settings.handleButton).toHaveBeenCalledWith(interaction, 'edit')
  })

  it('ignores unknown settings button actions', async () => {
    const settings = { handleButton: vi.fn().mockResolvedValue(undefined) }
    const buttons = new SettingsButtons(settings as never)
    const interaction = Object.assign(makeButtonInteraction(), {
      customId: 'settings:unknown',
    })

    await buttons.onSettingsButton(asButtonContext(interaction), 'unknown')

    expect(settings.handleButton).not.toHaveBeenCalled()
  })
})
