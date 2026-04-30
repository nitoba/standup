// apps/api/src/interfaces/discord/features/auth/login.command.spec.ts
import { describe, expect, it, vi } from 'vitest'
import { makeChatInputInteraction } from '../../../../test/discord/mock-interaction'
import { asSlashContext } from '../../../../test/discord/make-context'
import { LoginCommand } from './login.command'

describe('LoginCommand', () => {
  it('replies with the login button via DiscordAuthService.replyWithLoginLink', async () => {
    const auth = { replyWithLoginLink: vi.fn().mockResolvedValue(undefined) }
    const cmd = new LoginCommand(auth as never)
    const interaction = makeChatInputInteraction()

    await cmd.onLogin(asSlashContext(interaction))

    expect(auth.replyWithLoginLink).toHaveBeenCalledWith(interaction)
  })
})
