import { createServiceLogger } from '@standup/logger'
import type { Hono } from 'hono'
import { getUserSettingsOrDefaults } from '../../../services/settings-service.js'

const logger = createServiceLogger({
  service: 'api',
  component: 'settings-get-me',
})

function getUserId(c: { get: (key: string) => unknown }): string | undefined {
  const user = c.get('user') as Record<string, unknown> | undefined
  return typeof user?.id === 'string' ? user.id : undefined
}

export interface GetMeSettingsDeps {
  databaseUrl: string
}

/**
 * GET /settings/me
 */

export function registerGetMeSettingsRoute(
  app: Hono<any>,
  opts: GetMeSettingsDeps,
): void {
  app.get('/settings/me', async (c) => {
    const userId = getUserId(c)

    if (!userId) {
      return c.json({ error: 'Unauthorized' }, 401)
    }

    const result = await getUserSettingsOrDefaults(userId, {
      databaseUrl: opts.databaseUrl,
    })

    if (result.isErr()) {
      logger.error('Failed to fetch user settings', {
        userId,
        operation: result.error.operation,
        message: result.error.message,
      })
      return c.json({ error: 'Internal server error' }, 500)
    }

    return c.json({ data: result.value })
  })
}
