import { ExternalServiceError, Result } from '@standup/domain'
import { createServiceLogger } from '@standup/logger'
import type { Client } from 'discord.js'
import { EMBED_COLORS, buildUserDmEmbed } from '../embeds.js'

const logger = createServiceLogger({
  service: 'discord-bot',
  component: 'send-user-dm',
})

export interface SendUserDmOptions {
  client: Client
  discordUserId: string
  title: string
  message: string
  /** Cor do embed em decimal. Padrão: EMBED_COLORS.REVIEW (azul). */
  color?: number
}

/**
 * Envia uma DM direta ao usuário com um embed informativo.
 * Usado para notificações do worker: nenhuma atividade, job já em andamento, etc.
 * Non-fatal por design: falha aqui deve ser logada, nunca propagar.
 */
export async function sendUserDm(
  opts: SendUserDmOptions,
): Promise<Result<void, ExternalServiceError>> {
  const { client, discordUserId, title, message, color = EMBED_COLORS.REVIEW } =
    opts

  return Result.tryPromise({
    try: async () => {
      const user = await client.users.fetch(discordUserId)
      const embed = buildUserDmEmbed(title, message, color)
      await user.send({ embeds: [embed] })

      logger.info('User DM sent', { discordUserId, title })
    },
    catch: (err) =>
      new ExternalServiceError({
        service: 'discord',
        message: `Failed to send user DM: ${err instanceof Error ? err.message : String(err)}`,
      }),
  })
}
