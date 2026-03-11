import { createServiceLogger } from '@standup/logger'
import type { Context } from 'hono'
import { getUserSettingsOrDefaults } from '../services/settings-service.js'

const logger = createServiceLogger({
  service: 'api',
  component: 'settings-get-me',
})

function getAuthenticatedUserId(c: Context): string | undefined {
  const user = c.get('user') as Record<string, unknown> | undefined
  return typeof user?.id === 'string' ? user.id : undefined
}

export async function handleGetMeSettings(
  c: Context,
  databaseUrl: string,
): Promise<Response> {
  const userId = getAuthenticatedUserId(c)

  if (!userId) {
    return c.json({ error: 'Unauthorized' }, 401) as Response
  }

  const result = await getUserSettingsOrDefaults(userId, { databaseUrl })

  if (result.isErr()) {
    logger.error('Failed to fetch user settings', {
      userId,
      operation: result.error.operation,
      message: result.error.message,
    })
    return c.json({ error: 'Internal server error' }, 500) as Response
  }

  return c.json({ data: result.value })
}
