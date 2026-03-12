import type { Hono } from 'hono'
import type { WorkerFacadeDeps } from '../../../services/worker-facade-service.js'
import type { AppContext } from '../../types.js'
import { registerListReposRoute } from './list.js'

/**
 * Registra todas as rotas de repos no app Hono fornecido.
 */

export function registerReposRoutes(
  app: Hono<AppContext>,
  opts: WorkerFacadeDeps,
): void {
  registerListReposRoute(app, opts)
}
