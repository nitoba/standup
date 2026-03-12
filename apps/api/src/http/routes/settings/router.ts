import type { Hono } from 'hono'
import type { AppContext } from '../../types.js'
import { registerGetMeSettingsRoute } from './get-me.js'
import { registerPutMySettingsRoute } from './put-me.js'

export interface SettingsRoutesDeps {
  databaseUrl: string
}

/**
 * Registra todas as rotas de settings no app Hono fornecido.
 */
export function registerSettingsRoutes(
  app: Hono<AppContext>,
  opts: SettingsRoutesDeps,
): void {
  registerGetMeSettingsRoute(app, { databaseUrl: opts.databaseUrl })
  registerPutMySettingsRoute(app, { databaseUrl: opts.databaseUrl })
}
