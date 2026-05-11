// apps/api/src/interfaces/discord/features/auth/logout.command.spec.ts
import { describe, expect, it, vi } from 'vitest'
import { asSlashContext } from '../../../../test/discord/make-context'
import { makeChatInputInteraction } from '../../../../test/discord/mock-interaction'
import { LogoutCommand } from './logout.command'

describe('LogoutCommand', () => {
  it('delegates to DiscordAuthService.handleLogoutCommand', async () => {
    const auth = { handleLogoutCommand: vi.fn().mockResolvedValue(undefined) }
    const cmd = new LogoutCommand(auth as never)
    const interaction = makeChatInputInteraction()

    await cmd.onLogout(asSlashContext(interaction))

    expect(auth.handleLogoutCommand).toHaveBeenCalledWith(interaction)
  })
})
