import { httpInstrumentationMiddleware } from '@hono/otel'
import type { ApiEnv } from '@standup/config'
import { createServiceLogger, withContext } from '@standup/logger'
import { spanStatusMiddleware } from '@standup/observability'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { createInternalRouter } from './internal-router.js'
import { useRequestLogger } from './middlewares/request-logger.js'
import { createAuth } from './routes/auth/auth.js'
import { handleAuthCallback } from './routes/auth/callback-page.js'
import { handleDiscordLogin } from './routes/auth/login-redirect.js'
import { sessionAuthMiddleware } from './routes/auth/middleware.js'
import { registerDigestRoutes } from './routes/digests/router.js'
import { registerRemindersRoutes } from './routes/reminders/router.js'
import { registerReposRoutes } from './routes/repos/router.js'
import { registerSettingsRoutes } from './routes/settings/router.js'
import { registerStandupRoutes } from './routes/standups/router.js'
import type { EventBus } from './sse/event-bus.js'
import type { AppContext } from './types.js'

export interface ApiRouterOptions {
  env: ApiEnv
  eventBus: EventBus
}

/**
 * Assembles the full API Hono app.
 * Owns all middleware, auth, domain route mounting, and the error handler.
 * index.ts only does bootstrap: load env, create EventBus, call this, start server.
 */
export function createApiRouter({
  env,
  eventBus,
}: ApiRouterOptions): Hono<AppContext> {
  const logger = createServiceLogger({
    service: 'api',
    component: 'http-server',
  })

  // ---------------------------------------------------------------------------
  // Auth
  // ---------------------------------------------------------------------------

  const auth = createAuth({
    databaseUrl: env.DATABASE_URL,
    discordClientId: env.DISCORD_CLIENT_ID,
    discordClientSecret: env.DISCORD_CLIENT_SECRET,
    betterAuthSecret: env.BETTER_AUTH_SECRET,
    betterAuthUrl: env.BETTER_AUTH_URL,
    corsOrigin: env.CORS_ORIGIN,
    botInternalUrl: env.BOT_INTERNAL_URL,
    internalSecret: env.INTERNAL_SECRET,
  })

  const internalRouter = createInternalRouter({
    internalSecret: env.INTERNAL_SECRET,
    eventBus,
  })

  // ---------------------------------------------------------------------------
  // App assembly
  // ---------------------------------------------------------------------------

  const app = new Hono<AppContext>()

  app.use(
    httpInstrumentationMiddleware({
      serviceName: 'standup-api',
      captureRequestHeaders: ['x-request-id'],
    }),
  )
  app.use(useRequestLogger(logger))
  app.use(spanStatusMiddleware())
  app.use(
    cors({
      origin: env.CORS_ORIGIN,
      allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowHeaders: ['Content-Type', 'Authorization', 'x-internal-secret'],
      credentials: true,
    }),
  )

  // ---------------------------------------------------------------------------
  // Health / readiness (public, no auth)
  // ---------------------------------------------------------------------------

  app.get('/health', (c) =>
    c.json({
      status: 'ok',
      service: 'standup-api',
      uptimeSeconds: Math.floor(process.uptime()),
    }),
  )

  app.get('/ready', (c) => c.json({ status: 'ready' }))

  // ---------------------------------------------------------------------------
  // Better Auth routes (public, handles OAuth flow)
  // ---------------------------------------------------------------------------

  app.on(['POST', 'GET'], '/api/auth/*', (c) => auth.handler(c.req.raw))
  app.get('/auth/callback', handleAuthCallback)
  app.get('/auth/login/discord', handleDiscordLogin(auth))

  // ---------------------------------------------------------------------------
  // Protected domain routes
  // ---------------------------------------------------------------------------

  app.use('/standups/*', sessionAuthMiddleware(auth, env.INTERNAL_SECRET))
  app.use('/settings/*', sessionAuthMiddleware(auth, env.INTERNAL_SECRET))
  app.use('/repos', sessionAuthMiddleware(auth, env.INTERNAL_SECRET))
  app.use('/reminders/*', sessionAuthMiddleware(auth, env.INTERNAL_SECRET))
  app.use('/digests/*', sessionAuthMiddleware(auth, env.INTERNAL_SECRET))

  app.route('/', internalRouter)

  registerStandupRoutes(app, {
    databaseUrl: env.DATABASE_URL,
    reposRootPath: env.REPOS_ROOT_PATH,
    workerInternalUrl: env.WORKER_INTERNAL_URL,
    internalSecret: env.INTERNAL_SECRET,
    botInternalUrl: env.BOT_INTERNAL_URL,
    eventBus,
  })

  registerSettingsRoutes(app, {
    databaseUrl: env.DATABASE_URL,
  })

  registerReposRoutes(app, {
    workerInternalUrl: env.WORKER_INTERNAL_URL,
    internalSecret: env.INTERNAL_SECRET,
  })

  registerRemindersRoutes(app, {
    databaseUrl: env.DATABASE_URL,
    reposRootPath: env.REPOS_ROOT_PATH,
    workerInternalUrl: env.WORKER_INTERNAL_URL,
    internalSecret: env.INTERNAL_SECRET,
  })

  registerDigestRoutes(app, {
    workerInternalUrl: env.WORKER_INTERNAL_URL,
    internalSecret: env.INTERNAL_SECRET,
  })

  // ---------------------------------------------------------------------------
  // Error handler — catch-all para erros não tratados pelos handlers
  // ---------------------------------------------------------------------------

  app.onError((error, c) => {
    const requestId = c.get('requestId')
    withContext(logger, {
      requestId,
      method: c.req.method,
      path: c.req.path,
    }).error('Unhandled API error', { error })

    return c.json({ error: 'Internal server error', requestId }, 500)
  })

  return app
}
