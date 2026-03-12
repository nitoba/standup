import { getDb, UserRepository } from '@standup/db'
import { Result } from '@standup/domain'
import { createServiceLogger } from '@standup/logger'
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type ChatInputCommandInteraction,
  MessageFlags,
} from 'discord.js'

const logger = createServiceLogger({
  service: 'discord-bot',
  component: 'login-command',
})

export interface LoginCommandDeps {
  databaseUrl: string
  apiBaseUrl: string
}

/**
 * Handler para /login.
 * Se o usuário já tem sessão ativa, informa que já está logado.
 * Caso contrário, mostra botão de link para OAuth.
 */
export async function handleLogin(
  interaction: ChatInputCommandInteraction,
  deps: LoginCommandDeps,
): Promise<void> {
  const discordId = interaction.user.id
  const db = getDb(deps.databaseUrl)
  const repo = new UserRepository(db)
  const result = await repo.hasActiveSession(discordId)

  if (Result.isError(result)) {
    logger.error('Failed to check session for login command', {
      discordId,
      error: result.error.message,
    })
    await interaction.reply({
      content: 'Erro interno ao verificar sessão. Tente novamente.',
      flags: MessageFlags.Ephemeral,
    })
    return
  }

  // User has active session — already logged in
  if (result.value?.hasSession) {
    await interaction.reply({
      content: 'Você já está logado! Use `/logout` para encerrar sua sessão.',
      flags: MessageFlags.Ephemeral,
    })
    return
  }

  // Show login link
  const loginUrl = `${deps.apiBaseUrl}/auth/login/discord`
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setLabel('Login com Discord')
      .setStyle(ButtonStyle.Link)
      .setURL(loginUrl),
  )

  const message =
    result.value === null
      ? 'Conecte sua conta para usar o Standup Bot.\nClique no botão abaixo para fazer login:'
      : 'Sua sessão expirou. Clique no botão abaixo para reconectar:'

  await interaction.reply({
    content: message,
    components: [row],
    flags: MessageFlags.Ephemeral,
  })

  logger.info('Login link shown to user', { discordId })
}
