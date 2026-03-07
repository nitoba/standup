import { StandupStatusSchema } from '@standup/domain'
import { createServiceLogger } from '@standup/logger'
import type { Context } from 'hono'
import * as z from 'zod'
import { listStandups } from '../services/standup-service.js'

const logger = createServiceLogger({
  service: 'api',
  component: 'standup-list',
})

export const listQuerySchema = z.object({
  status: StandupStatusSchema.optional(),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD')
    .optional(),
})

export type ListQuery = z.infer<typeof listQuerySchema>

/**
 * GET /standups
 * Lista standups com filtros opcionais ?status= e ?date=YYYY-MM-DD.
 * Filtros são aplicados como OR (apenas um por vez).
 */
export async function handleListStandups(
  c: Context,
  query: ListQuery,
  databaseUrl: string,
  userId: string,
): Promise<Response> {
  const result = await listStandups(
    { status: query.status, date: query.date, userId },
    { databaseUrl },
  )

  if (result.isErr()) {
    logger.error('Failed to list standups', {
      operation: result.error.operation,
      message: result.error.message,
    })
    return c.json({ error: 'Internal server error' }, 500) as Response
  }

  return c.json({ data: result.value })
}
