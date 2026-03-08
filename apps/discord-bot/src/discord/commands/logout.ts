import { getDb, UserRepository } from '@standup/db'
import { Result } from '@standup/domain'
import { createServiceLogger } from '@standup/logger'
import { type ChatInputCommandInteraction, MessageFlags } from 'discord.js'

const logger = createServiceLogger({
  service: 'discord-bot',
  component: 'logout-command',
})

export interface LogoutCommandDeps {
  databaseUrl: string
}

/**
 * Handler para /logout.
 * Deleta todas as sessões do usuário (hard delete, igual ao Better Auth signOut).
 * Se o usuário não está registrado, informa que não há sessão.
 */
export async function handleLogout(
  interaction: ChatInputCommandInteraction,
  deps: LogoutCommandDeps,
): Promise<void> {
  const discordId = interaction.user.id
  const db = getDb(deps.databaseUrl)
  const repo = new UserRepository(db)

  // Check if user has active session first
  const checkResult = repo.hasActiveSession(discordId)

  if (Result.isError(checkResult)) {
    logger.error('Failed to check session for logout command', {
      discordId,
      error: checkResult.error.message,
    })
    await interaction.reply({
      content: 'Erro interno ao verificar sessão. Tente novamente.',
      flags: MessageFlags.Ephemeral,
    })
    return
  }

  if (checkResult.value === null) {
    await interaction.reply({
      content:
        'Você não está registrado no sistema. Use `/login` para conectar sua conta.',
      flags: MessageFlags.Ephemeral,
    })
    return
  }

  if (!checkResult.value.hasSession) {
    await interaction.reply({
      content: 'Você não possui sessão ativa. Use `/login` para reconectar.',
      flags: MessageFlags.Ephemeral,
    })
    return
  }

  // Delete all sessions
  const deleteResult = repo.deleteSessionsByDiscordId(discordId)

  if (Result.isError(deleteResult)) {
    logger.error('Failed to delete sessions for logout command', {
      discordId,
      error: deleteResult.error.message,
    })
    await interaction.reply({
      content: 'Erro ao encerrar sessão. Tente novamente.',
      flags: MessageFlags.Ephemeral,
    })
    return
  }

  await interaction.reply({
    content:
      'Sessão encerrada com sucesso. Use `/login` quando quiser reconectar.',
    flags: MessageFlags.Ephemeral,
  })

  logger.info('User logged out', { discordId })
}
