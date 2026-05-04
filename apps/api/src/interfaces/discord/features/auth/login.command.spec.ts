// apps/api/src/interfaces/discord/features/auth/login.command.spec.ts
import { describe, expect, it, vi } from 'vitest'
import { asSlashContext } from '../../../../test/discord/make-context'
import { makeChatInputInteraction } from '../../../../test/discord/mock-interaction'
import { LoginCommand } from './login.command'

describe('LoginCommand', () => {
  it('delegates to DiscordAuthService.handleLoginCommand', async () => {
    const auth = { handleLoginCommand: vi.fn().mockResolvedValue(undefined) }
    const cmd = new LoginCommand(auth as never)
    const interaction = makeChatInputInteraction()

    await cmd.onLogin(asSlashContext(interaction))

    expect(auth.handleLoginCommand).toHaveBeenCalledWith(interaction)
  })
})
