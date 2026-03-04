import { getDb, StandupRepository } from '@standup/db'
import { NotFoundError } from '@standup/domain'
import { createServiceLogger } from '@standup/logger'
import { Hono } from 'hono'
import { sendReviewDm } from '../discord/send-review-dm.js'

const logger = createServiceLogger({
  service: 'discord-bot',
  component: 'internal-routes',
})

export interface InternalRouterOptions {
  internalSecret: string
  databaseUrl: string
}

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
   */
  app.post('/internal/notify/standup-ready', async (c) => {
    let body: unknown
    try {
      body = await c.req.json()
    } catch {
      return c.json({ error: 'Invalid JSON body' }, 400)
    }

    const { standupId } = (body ?? {}) as Record<string, unknown>

    if (!standupId || typeof standupId !== 'string') {
      return c.json({ error: 'standupId is required' }, 400)
    }

    const db = getDb(opts.databaseUrl)
    const repo = new StandupRepository(db)

    const found = await repo.findById(standupId)
    if (found.status === 'error') {
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
    const dmResult = await sendReviewDm(record)
    if (dmResult.status === 'error') {
      logger.warn(
        'Failed to send review DM — standup saved, approve manually',
        {
          standupId,
          error: dmResult.error.message,
        },
      )
    } else {
      logger.info('Review DM sent successfully', { standupId })
    }

    return c.json({ ok: true, standupId })
  })

  return app
}
