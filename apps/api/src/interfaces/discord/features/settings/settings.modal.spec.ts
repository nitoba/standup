// apps/api/src/interfaces/discord/features/settings/settings.modal.spec.ts
import { describe, expect, it, vi } from 'vitest'
import { asModalContext } from '../../../../test/discord/make-context'
import { makeModalInteraction } from '../../../../test/discord/mock-interaction'
import { SettingsModal } from './settings.modal'

describe('SettingsModal', () => {
  it('delegates settings modal submission to SettingsInteractionService.handleModal', async () => {
    const settings = { handleModal: vi.fn().mockResolvedValue(undefined) }
    const modal = new SettingsModal(settings as never)
    const interaction = makeModalInteraction()

    await modal.onSubmit(asModalContext(interaction))

    expect(settings.handleModal).toHaveBeenCalledWith(interaction)
  })
})
