import { ExternalServiceError, Result } from '@standup/domain'
import { createServiceLogger } from '@standup/logger'
import type { APIEmbed, Client } from 'discord.js'

const logger = createServiceLogger({
  service: 'discord-bot',
  component: 'send-channel-notification',
})

/**
 * Envia um embed num canal Discord (Padrão 8 do Akita — notificações de status).
 * Usado para notificar falhas de job e outros eventos operacionais no canal.
 *
 * Non-fatal por design: falha aqui nunca deve derrubar o processo.
 */
export async function sendChannelNotification(
  client: Client,
  channelId: string,
  embed: APIEmbed,
): Promise<Result<void, ExternalServiceError>> {
  return Result.tryPromise({
    try: async () => {
      const channel = await client.channels.fetch(channelId)

      if (!channel) {
        throw new ExternalServiceError({
          service: 'discord',
          message: `Channel not found: ${channelId}`,
        })
      }

      if (!channel.isTextBased() || !channel.isSendable()) {
        throw new ExternalServiceError({
          service: 'discord',
          message: `Channel ${channelId} is not a sendable text channel`,
        })
      }

      await channel.send({ embeds: [embed] })

      logger.info('Channel notification sent', { channelId })
    },
    catch: (err) => {
      if (err instanceof ExternalServiceError) return err
      return new ExternalServiceError({
        service: 'discord',
        message: `Failed to send channel notification: ${err instanceof Error ? err.message : String(err)}`,
      })
    },
  })
}
