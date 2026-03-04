import type { StandupRecord } from '@standup/domain'
import { ExternalServiceError, Result } from '@standup/domain'
import { createServiceLogger } from '@standup/logger'
import type { Client } from 'discord.js'

const logger = createServiceLogger({
  service: 'discord-bot',
  component: 'publish-standup',
})

/**
 * Publica o standup aprovado no canal Discord configurado.
 * Retorna Result.ok(undefined) em caso de sucesso.
 * Retorna ExternalServiceError se o canal não for encontrado ou o envio falhar.
 *
 * Não altera o status do standup — quem chama é responsável por isso.
 */
export async function publishStandup(
  record: StandupRecord,
  client: Client,
  channelId: string,
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

      const content = `**Standup — ${record.date}**\n\n${record.content}`

      await channel.send({ content })

      logger.info('Standup published to channel', {
        standupId: record.id,
        channelId,
      })
    },
    catch: (err) => {
      if (err instanceof ExternalServiceError) return err
      return new ExternalServiceError({
        service: 'discord',
        message: `Failed to publish standup: ${err instanceof Error ? err.message : String(err)}`,
      })
    },
  })
}
