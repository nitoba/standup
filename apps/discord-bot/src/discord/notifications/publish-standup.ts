import type {
  ExternalServiceError,
  Result,
  StandupRecord,
} from '@standup/domain'
import { createServiceLogger } from '@standup/logger'
import type { Client } from 'discord.js'
import { buildPublishedEmbed } from '../embeds.js'
import { sendChannelNotification } from './send-channel-notification.js'

const logger = createServiceLogger({
  service: 'discord-bot',
  component: 'publish-standup',
})

/**
 * Publica o standup aprovado no canal Discord como embed rico verde (Padrão 3 do Akita).
 * Não altera o status do standup — quem chama é responsável por isso.
 */
export async function publishStandup(
  record: StandupRecord,
  client: Client,
  channelId: string,
): Promise<Result<void, ExternalServiceError>> {
  const embed = buildPublishedEmbed(record)

  const result = await sendChannelNotification(client, channelId, embed)

  if (result.isOk()) {
    logger.info('Standup published to channel', {
      standupId: record.id,
      channelId,
    })
  }

  return result
}
