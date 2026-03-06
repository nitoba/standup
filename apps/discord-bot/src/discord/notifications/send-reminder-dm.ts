import { ExternalServiceError, Result } from '@standup/domain'
import { createServiceLogger } from '@standup/logger'
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type Client,
} from 'discord.js'
import { buildReminderEmbed } from '../embeds.js'

const logger = createServiceLogger({
  service: 'discord-bot',
  component: 'send-reminder-dm',
})

export interface SendReminderDmDeps {
  client: Client
  discordUserId: string
  workerInternalUrl: string
  internalSecret: string
}

/**
 * Envia uma DM ao usuário com o lembrete de standup (embed âmbar)
 * e botões para gerenciar o agendamento:
 *   - Executar Agora  → standup-reminder:run-now
 *   - Adiar 15min     → standup-reminder:snooze
 *   - Cancelar Hoje   → standup-reminder:cancel-today
 *
 * As URLs do worker são embeds nos customIds codificados em base64 para que o
 * reminder-handler possa chamar de volta sem estado global.
 */
export async function sendReminderDm(
  nextRunAt: string,
  deps: SendReminderDmDeps,
): Promise<Result<{ messageId: string }, ExternalServiceError>> {
  const { client, discordUserId } = deps

  return Result.tryPromise({
    try: async () => {
      const user = await client.users.fetch(discordUserId)

      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId('standup-reminder:run-now')
          .setLabel('Executar Agora')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('standup-reminder:snooze')
          .setLabel('Adiar 15min')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId('standup-reminder:cancel-today')
          .setLabel('Cancelar Hoje')
          .setStyle(ButtonStyle.Danger),
      )

      const embed = buildReminderEmbed(nextRunAt)

      const message = await user.send({
        embeds: [embed],
        components: [row],
      })

      logger.info('Reminder DM sent', {
        userId: discordUserId,
        messageId: message.id,
        nextRunAt,
      })

      return { messageId: message.id }
    },
    catch: (err) =>
      new ExternalServiceError({
        service: 'discord',
        message: `Failed to send reminder DM: ${err instanceof Error ? err.message : String(err)}`,
      }),
  })
}
