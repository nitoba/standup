import type { StandupRecord } from '@standup/domain'
import { ExternalServiceError, Result } from '@standup/domain'
import { createServiceLogger } from '@standup/logger'
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Client,
  Events,
  GatewayIntentBits,
} from 'discord.js'

const logger = createServiceLogger({
  service: 'discord-bot',
  component: 'send-review-dm',
})

let _client: Client | null = null

/**
 * Retorna (e cacheia) um cliente Discord autenticado.
 * Em testes, o módulo inteiro é mockado portanto este código não é executado.
 */
async function getClient(token: string): Promise<Client> {
  if (_client) return _client

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.DirectMessages,
      GatewayIntentBits.MessageContent,
    ],
  })

  await new Promise<void>((resolve, reject) => {
    client.once(Events.ClientReady, () => resolve())
    client.once(Events.Error, reject)
    client.login(token).catch(reject)
  })

  _client = client
  return client
}

export interface SendReviewDmDeps {
  discordBotToken: string
  discordUserId: string
}

/**
 * Envia uma DM ao usuário configurado com o preview do standup e
 * botões de Aprovar / Rejeitar / Regenerar.
 *
 * Recebe um StandupRecord já persistido no DB.
 * Quem chama isso (internal-routes) não sabe nada sobre Discord.
 */
export async function sendReviewDm(
  record: StandupRecord,
  deps?: SendReviewDmDeps,
): Promise<Result<void, ExternalServiceError>> {
  // deps pode ser injetado em testes; em produção lê do process.env
  const token = deps?.discordBotToken ?? process.env.DISCORD_BOT_TOKEN
  const userId = deps?.discordUserId ?? process.env.DISCORD_USER_ID

  if (!token || !userId) {
    logger.warn(
      'sendReviewDm skipped — DISCORD_BOT_TOKEN or DISCORD_USER_ID not set',
      {
        standupId: record.id,
      },
    )
    return Result.ok(undefined)
  }

  return Result.tryPromise({
    try: async () => {
      const client = await getClient(token)
      const user = await client.users.fetch(userId)

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
          .setCustomId(`standup:regenerate:${record.id}`)
          .setLabel('Regenerar')
          .setStyle(ButtonStyle.Secondary),
      )

      await user.send({
        content: `**Standup de ${record.date}** — por favor revise:\n\n${record.content}`,
        components: [row],
      })

      logger.info('Review DM sent', { standupId: record.id, userId })
    },
    catch: (err) =>
      new ExternalServiceError({
        service: 'discord',
        message: `Failed to send review DM: ${err instanceof Error ? err.message : String(err)}`,
      }),
  })
}
