// apps/api/src/interfaces/discord/features/settings/settings.subcommand.spec.ts
import { describe, expect, it, vi } from 'vitest'
import { asSlashContext } from '../../../../test/discord/make-context'
import { makeChatInputInteraction } from '../../../../test/discord/mock-interaction'
import { SettingsSubcommand } from './settings.subcommand'

describe('SettingsSubcommand', () => {
  it('delegates to SettingsInteractionService.handleCommand', async () => {
    const settings = { handleCommand: vi.fn().mockResolvedValue(undefined) }
    const cmd = new SettingsSubcommand(settings as never)
    const interaction = makeChatInputInteraction()

    await cmd.onSettings(asSlashContext(interaction))

    expect(settings.handleCommand).toHaveBeenCalledWith(interaction)
  })
})
