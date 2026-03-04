import { ExternalServiceError, Result } from '@standup/domain'
import { createServiceLogger } from '@standup/logger'
import type { Client } from 'discord.js'
import { buildJobFailedEmbed } from '../discord/embeds.js'
import { sendChannelNotification } from '../discord/notifications/send-channel-notification.js'

const logger = createServiceLogger({
  service: 'discord-bot',
  component: 'job-notification-service',
})

export interface JobFailedNotificationDeps {
  client: Client
  discordChannelId: string
}

export interface JobFailedResult {
  notified: boolean
  reason?: string
}

/**
 * Constrói o embed de falha de job e publica no canal Discord.
 * Non-fatal por design: falha aqui nunca deve derrubar o worker.
 *
 * Padrão 8 do Akita — Notificações de Status em Produção.
 */
export async function notifyJobFailed(
  error: string,
  context: string | undefined,
  deps: JobFailedNotificationDeps,
): Promise<Result<JobFailedResult, ExternalServiceError>> {
  logger.warn('Processing job failure notification', { error, context })

  const embed = buildJobFailedEmbed(error, context)
  const notifyResult = await sendChannelNotification(
    deps.client,
    deps.discordChannelId,
    embed,
  )

  if (notifyResult.isErr()) {
    logger.error('Failed to send job-failed notification to channel', {
      error: notifyResult.error.message,
      originalError: error,
    })
    return Result.ok({ notified: false, reason: 'channel notification failed' })
  }

  logger.info('Job failure notification sent to channel', { context })
  return Result.ok({ notified: true })
}
