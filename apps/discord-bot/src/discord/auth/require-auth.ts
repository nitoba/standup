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
 * Verifica se o usuário do Discord possui sessão ativa no sistema.
 * - Se não está registrado: mostra link de login.
 * - Se está registrado mas sem sessão ativa: informa que a sessão expirou e mostra link de login.
 * - Se está registrado e com sessão ativa: retorna true e o comando pode prosseguir.
 */
export async function requireAuth(
  interaction: ChatInputCommandInteraction,
  deps: AuthGuardDeps,
): Promise<boolean> {
  const discordId = interaction.user.id
  const db = getDb(deps.databaseUrl)
  const repo = new UserRepository(db)
  const result = repo.hasActiveSession(discordId)

  if (Result.isError(result)) {
    logger.error('Failed to check user auth', {
      discordId,
      error: result.error.message,
    })
    await interaction.reply({
      content: 'Erro interno ao verificar autenticação. Tente novamente.',
      flags: MessageFlags.Ephemeral,
    })
    return false
  }

  // User has active session — authorized
  if (result.value?.hasSession) {
    return true
  }

  // Build login link button
  const loginUrl = `${deps.apiBaseUrl}/auth/login/discord`
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setLabel('Login com Discord')
      .setStyle(ButtonStyle.Link)
      .setURL(loginUrl),
  )

  const content =
    result.value === null
      ? 'Você precisa conectar sua conta antes de usar este comando.\nUse `/login` ou clique no botão abaixo:'
      : 'Sua sessão expirou. Use `/login` ou clique no botão abaixo para reconectar:'

  await interaction.reply({
    content,
    components: [row],
    flags: MessageFlags.Ephemeral,
  })

  logger.info('Auth guard blocked user', {
    discordId,
    reason: result.value === null ? 'not_registered' : 'session_expired',
  })
  return false
}
