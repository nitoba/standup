import { sValidator } from '@hono/standard-validator'
import { StandupStatusSchema } from '@standup/domain'
import { createServiceLogger } from '@standup/logger'
import type { Hono } from 'hono'
import * as z from 'zod'
import { listStandups } from '../../../services/standup-service.js'
import { getUserId } from '../../utils/get-user-id.js'
import { mapDomainErrorToResponse } from '../../utils/map-domain-error.js'

const logger = createServiceLogger({
  service: 'api',
  component: 'standup-list',
})

const PAGINATION_DEFAULTS = {
  page: 1,
  pageSize: 20,
} as const

export const listQuerySchema = z.object({
  status: StandupStatusSchema.optional(),
  date: z
    .union([
      z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD'),
      z.literal('this_week'),
    ])
    .optional(),
  from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'from must be YYYY-MM-DD')
    .optional(),
  to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'to must be YYYY-MM-DD')
    .optional(),
  search: z.string().trim().min(1).optional(),
  page: z.coerce.number().int().min(1).default(PAGINATION_DEFAULTS.page),
  pageSize: z.coerce
    .number()
    .int()
    .min(1)
    .max(100)
    .default(PAGINATION_DEFAULTS.pageSize),
})

export type ListQuery = z.infer<typeof listQuerySchema>

/**
 * GET /standups
 * Lista standups com filtros opcionais ?status= e ?date=YYYY-MM-DD.
 */
export function registerListStandupsRoute(
  app: Hono<any>,
  opts: { databaseUrl: string },
): void {
  app.get('/standups', sValidator('query', listQuerySchema), async (c) => {
    const userId = getUserId(c)
    if (!userId) {
      return c.json({ error: 'Unauthorized' }, 401)
    }

    const query = c.req.valid('query')
    const result = await listStandups(
      {
        status: query.status,
        date: query.date,
        from: query.from,
        to: query.to,
        search: query.search,
        page: query.page,
        pageSize: query.pageSize,
        userId,
      },
      { databaseUrl: opts.databaseUrl },
    )

    if (result.isErr()) {
      logger.error('Failed to list standups', {
        message: result.error.message,
      })
      return mapDomainErrorToResponse(result.error, c)
    }

    return c.json({
      data: result.value.items,
      pagination: {
        page: result.value.page,
        pageSize: result.value.pageSize,
        total: result.value.total,
        totalPages: result.value.totalPages,
      },
      summary: result.value.summary,
    })
  })
}
