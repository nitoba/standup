import { sValidator } from '@hono/standard-validator'
import { createServiceLogger } from '@standup/logger'
import type { Hono } from 'hono'
import * as z from 'zod'
import { upsertUserSettings } from '../../../services/settings-service.js'
import { getUserId } from '../../utils/get-user-id.js'

const logger = createServiceLogger({
  service: 'api',
  component: 'settings-put-me',
})

function requiredString(field: string) {
  return z.string().trim().min(1, `${field} is required`)
}

export const putMySettingsBodySchema = z.object({
  standupCron: requiredString('standupCron'),
  reminderCron: requiredString('reminderCron'),
  recoveryCron: requiredString('recoveryCron'),
  timezone: requiredString('timezone'),
  gitAuthor: requiredString('gitAuthor'),
  gitSincePeriod: z
    .string()
    .trim()
    .min(1, 'gitSincePeriod is required')
    .optional(),
  selectedRepos: z
    .array(z.string().trim().min(1, 'selectedRepos entries must be non-empty'))
    .min(1, 'selectedRepos must include at least one repo'),
  active: z.boolean().optional(),
  emailTheme: z.enum(['light', 'dark']).optional(),
})

export type PutMySettingsBody = z.infer<typeof putMySettingsBodySchema>

export interface PutMySettingsDeps {
  databaseUrl: string
}

interface ValidationErrorItem {
  field: string
  message: string
}

function mapValidationErrors(error: z.ZodError): ValidationErrorItem[] {
  return error.issues.map((issue) => ({
    field: issue.path.length > 0 ? issue.path.join('.') : 'body',
    message: issue.message,
  }))
}

/**
 * PUT /settings/me
 */

export function registerPutMySettingsRoute(
  app: Hono<any>,
  opts: PutMySettingsDeps,
): void {
  app.put(
    '/settings/me',
    sValidator('json', putMySettingsBodySchema),
    async (c) => {
      const userId = getUserId(c)

      if (!userId) {
        return c.json({ error: 'Unauthorized' }, 401)
      }

      const body = c.req.valid('json')

      const result = await upsertUserSettings(
        {
          userId,
          ...body,
        },
        { databaseUrl: opts.databaseUrl },
      )

      if (result.isErr()) {
        logger.error('Failed to persist user settings', {
          operation: result.error.operation,
          message: result.error.message,
          userId,
        })
        return c.json({ error: 'Internal server error' }, 500)
      }

      return c.json({ data: result.value })
    },
  )
}
