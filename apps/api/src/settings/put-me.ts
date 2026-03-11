import { createServiceLogger } from '@standup/logger'
import type { Context } from 'hono'
import * as z from 'zod'
import { upsertUserSettings } from '../services/settings-service.js'

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

export async function handlePutMySettings(
  c: Context,
  deps: PutMySettingsDeps,
): Promise<Response> {
  const user = c.get('user') as Record<string, unknown> | undefined
  const userId = typeof user?.id === 'string' ? user.id : undefined

  if (!userId) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  const json = await c.req.json().catch(() => undefined)
  const bodyResult = putMySettingsBodySchema.safeParse(json)
  if (!bodyResult.success) {
    return c.json(
      {
        error: 'Invalid settings payload',
        errors: mapValidationErrors(bodyResult.error),
      },
      400,
    )
  }

  const result = upsertUserSettings(
    {
      userId,
      ...bodyResult.data,
    },
    { databaseUrl: deps.databaseUrl },
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
}
