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
  component: 'auth-guard',
})

export interface AuthGuardDeps {
  databaseUrl: string
  apiBaseUrl: string
}

/**
 * Verifica se o usuário do Discord está registrado no sistema.
 * Se não estiver, envia mensagem ephemeral com link de login e retorna false.
 * Se estiver, retorna true e o comando pode prosseguir.
 */
export async function requireAuth(
  interaction: ChatInputCommandInteraction,
  deps: AuthGuardDeps,
): Promise<boolean> {
  const discordId = interaction.user.id
  const db = getDb(deps.databaseUrl)
  const repo = new UserRepository(db)
  const result = repo.findByDiscordId(discordId)

  if (Result.isError(result)) {
    logger.error('Failed to check user auth', {
      discordId,
      error: result.error.message,
    })
    await interaction.reply({
      content: 'Erro interno ao verificar autenticacao. Tente novamente.',
      flags: MessageFlags.Ephemeral,
    })
    return false
  }

  if (result.value !== null) {
    return true
  }

  // User not registered — show login link (GET endpoint that initiates OAuth)
  const loginUrl = `${deps.apiBaseUrl}/auth/login/discord`
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setLabel('Login com Discord')
      .setStyle(ButtonStyle.Link)
      .setURL(loginUrl)
      .setEmoji('🔗'),
  )

  await interaction.reply({
    content:
      'Voce precisa conectar sua conta antes de usar este comando.\nClique no botao abaixo para fazer login:',
    components: [row],
    flags: MessageFlags.Ephemeral,
  })

  logger.info('Auth guard blocked unregistered user', { discordId })
  return false
}
