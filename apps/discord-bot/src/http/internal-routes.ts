import { sValidator } from '@hono/standard-validator'
import { getDb, StandupRepository } from '@standup/db'
import { NotFoundError } from '@standup/domain'
import { createServiceLogger } from '@standup/logger'
import type { Client } from 'discord.js'
import { Hono } from 'hono'
import * as z from 'zod'
import { buildJobFailedEmbed } from '../discord/embeds.js'
import { sendChannelNotification } from '../discord/send-channel-notification.js'
import { sendReviewDm } from '../discord/send-review-dm.js'

const logger = createServiceLogger({
  service: 'discord-bot',
  component: 'internal-routes',
})

export interface InternalRouterOptions {
  internalSecret: string
  databaseUrl: string
  /** Cliente Discord unificado — mesmo Client do gateway (index.ts). */
  client: Client
  /** Discord User ID para DMs de revisão. */
  discordUserId: string
  /** Canal Discord onde publicar standups e notificações de falha. */
  discordChannelId: string
}

const notifyBodySchema = z.object({
  standupId: z.string().min(1),
})

const jobFailedBodySchema = z.object({
  error: z.string().min(1),
  context: z.string().optional(),
})

/**
 * Cria o roteador Hono com as rotas internas do discord-bot.
 * Estas rotas só devem ser acessíveis internamente (header x-internal-secret).
 */
export function createInternalRouter(opts: InternalRouterOptions): Hono {
  const app = new Hono()

  // Auth middleware — todas as rotas /internal/* exigem o secret
  app.use('/internal/*', async (c, next) => {
    const secret = c.req.header('x-internal-secret')
    if (!secret || secret !== opts.internalSecret) {
      return c.json({ error: 'Unauthorized' }, 401)
    }
    return next()
  })

  /**
   * POST /internal/notify/standup-ready
   * Body: { standupId: string }
   *
   * Disparado pelo worker quando um standup draft foi salvo.
   * O bot busca o standup no DB e envia DM ao usuário com botões de revisão.
   * Se DM enviada com sucesso, transiciona draft → pending_review.
   */
  app.post(
    '/internal/notify/standup-ready',
    sValidator('json', notifyBodySchema),
    async (c) => {
      const { standupId } = c.req.valid('json')

      const db = getDb(opts.databaseUrl)
      const repo = new StandupRepository(db)

      const found = await repo.findById(standupId)
      if (found.isErr()) {
        if (NotFoundError.is(found.error)) {
          return c.json({ error: `Standup not found: ${standupId}` }, 404)
        }
        logger.error('DB error fetching standup', {
          standupId,
          error: found.error.message,
        })
        return c.json({ error: 'Internal server error' }, 500)
      }

      const record = found.value

      // Send DM — non-fatal: standup is already persisted
      const dmResult = await sendReviewDm(record, {
        client: opts.client,
        discordUserId: opts.discordUserId,
      })
      if (dmResult.isErr()) {
        logger.warn(
          'Failed to send review DM — standup saved, approve manually',
          {
            standupId,
            error: dmResult.error.message,
          },
        )
        return c.json({ ok: true, standupId })
      }

      logger.info('Review DM sent successfully', {
        standupId,
        messageId: dmResult.value.messageId,
      })

      // Transition draft → pending_review now that the user has received the DM
      const transitionResult = await repo.updateStatus(
        standupId,
        'pending_review',
      )
      if (transitionResult.isErr()) {
        logger.warn('Failed to transition standup to pending_review', {
          standupId,
          error: transitionResult.error.message,
        })
      } else {
        logger.info('Standup transitioned to pending_review', { standupId })
      }

      return c.json({ ok: true, standupId })
    },
  )

  /**
   * POST /internal/notify/job-failed
   * Body: { error: string, context?: string }
   *
   * Padrão 8 do Akita — Notificações de Status Em Produção.
   * Disparado pelo worker quando o standup job falha.
   * Publica embed vermelho no canal Discord para visibilidade imediata.
   * Non-fatal: falha aqui retorna 200 com ok: false (standup-bot não deve derrubar worker).
   */
  app.post(
    '/internal/notify/job-failed',
    sValidator('json', jobFailedBodySchema),
    async (c) => {
      const { error, context } = c.req.valid('json')

      logger.warn('Received job failure notification', { error, context })

      const embed = buildJobFailedEmbed(error, context)
      const notifyResult = await sendChannelNotification(
        opts.client,
        opts.discordChannelId,
        embed,
      )

      if (notifyResult.isErr()) {
        logger.error('Failed to send job-failed notification to channel', {
          error: notifyResult.error.message,
          originalError: error,
        })
        // Ainda retorna 200: o worker não deve re-tentar por causa de falha do Discord
        return c.json({ ok: false, reason: 'channel notification failed' })
      }

      logger.info('Job failure notification sent to channel', { context })
      return c.json({ ok: true })
    },
  )

  return app
}
