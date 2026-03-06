import type { StandupRecord } from '@standup/domain'
import { ExternalServiceError, Result } from '@standup/domain'
import { createServiceLogger } from '@standup/logger'
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type Client,
} from 'discord.js'
import { buildReviewEmbed } from '../embeds.js'

const logger = createServiceLogger({
  service: 'discord-bot',
  component: 'send-review-dm',
})

export interface SendReviewDmDeps {
  client: Client
  discordUserId: string
}

/**
 * Envia uma DM ao usuário configurado com o preview do standup (embed rico azul)
 * e botões de Aprovar / Rejeitar / Ajustar texto / Regenerar do zero.
 *
 * O Client Discord é injetado pelo caller (index.ts), garantindo
 * uma única conexão WebSocket ativa no processo.
 */
export async function sendReviewDm(
  record: StandupRecord,
  deps: SendReviewDmDeps,
): Promise<Result<{ messageId: string }, ExternalServiceError>> {
  const { client, discordUserId } = deps

  return Result.tryPromise({
    try: async () => {
      const user = await client.users.fetch(discordUserId)

      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`standup:approve:${record.id}`)
          .setLabel('Aprovar')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`standup:reject:${record.id}`)
          .setLabel('Rejeitar')
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId(`standup:adjust:${record.id}`)
          .setLabel('Ajustar texto')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId(`standup:regenerate:${record.id}`)
          .setLabel('Regenerar do zero')
          .setStyle(ButtonStyle.Secondary),
      )

      // Padrão 3 do Akita: embed rico azul com campos formatados
      const embed = buildReviewEmbed(record)

      const message = await user.send({
        embeds: [embed],
        components: [row],
      })

      logger.info('Review DM sent', {
        standupId: record.id,
        userId: discordUserId,
        messageId: message.id,
      })

      return { messageId: message.id }
    },
    catch: (err) =>
      new ExternalServiceError({
        service: 'discord',
        message: `Failed to send review DM: ${err instanceof Error ? err.message : String(err)}`,
      }),
  })
}
