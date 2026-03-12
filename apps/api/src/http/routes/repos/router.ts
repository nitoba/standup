import type { Hono } from 'hono'
import type { WorkerClientDeps } from '../../../services/worker-client.js'
import { registerListReposRoute } from './list.js'

/**
 * Registra todas as rotas de repos no app Hono fornecido.
 */

export function registerReposRoutes(
  app: Hono<any>,
  opts: WorkerClientDeps,
): void {
  registerListReposRoute(app, opts)
}
