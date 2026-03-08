import { loadApiEnv } from '@standup/config'
import { Result } from '@standup/domain'
import { createServiceLogger, withContext } from '@standup/logger'
import { Hono } from 'hono'
import { createAuth } from './auth/auth.js'
import { handleAuthCallback } from './auth/callback-page.js'
import { handleDiscordLogin } from './auth/login-redirect.js'
import { sessionAuthMiddleware } from './auth/middleware.js'
import { requestLogger } from './http/middleware.js'
import { createStandupRouter } from './standup/router.js'

type AppContext = {
  Variables: {
    requestId: string
    user: Record<string, unknown>
    session: Record<string, unknown>
  }
}

const envResult = loadApiEnv()
if (Result.isError(envResult)) {
  throw new Error(`Invalid environment: ${envResult.error.message}`)
}

const env = envResult.value
const logger = createServiceLogger({ service: 'api', component: 'http-server' })

// ---------------------------------------------------------------------------
// Better Auth
// ---------------------------------------------------------------------------

const auth = createAuth({
  databaseUrl: env.DATABASE_URL,
  discordClientId: env.DISCORD_CLIENT_ID,
  discordClientSecret: env.DISCORD_CLIENT_SECRET,
  betterAuthSecret: env.BETTER_AUTH_SECRET,
  betterAuthUrl: env.BETTER_AUTH_URL,
  botInternalUrl: env.BOT_INTERNAL_URL,
  internalSecret: env.INTERNAL_SECRET,
})

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

const app = new Hono<AppContext>()

app.use('*', requestLogger(logger))

// ---------------------------------------------------------------------------
// Health / readiness (public, no auth)
// ---------------------------------------------------------------------------

app.get('/health', (c) => {
  return c.json({
    status: 'ok',
    service: 'standup-api',
    uptimeSeconds: Math.floor(process.uptime()),
  })
})

app.get('/ready', (c) => {
  return c.json({ status: 'ready' })
})

// ---------------------------------------------------------------------------
// Better Auth routes (public, handles OAuth flow)
// ---------------------------------------------------------------------------

app.on(['POST', 'GET'], '/api/auth/*', (c) => {
  return auth.handler(c.req.raw)
})

app.get('/auth/callback', handleAuthCallback)
app.get('/auth/login/discord', handleDiscordLogin(auth))

// ---------------------------------------------------------------------------
// Protected domain routes
// ---------------------------------------------------------------------------

app.use('/standups/*', sessionAuthMiddleware(auth, env.INTERNAL_SECRET))

app.route(
  '/',
  createStandupRouter({
    databaseUrl: env.DATABASE_URL,
    reposRootPath: env.REPOS_ROOT_PATH,
    workerInternalUrl: env.WORKER_INTERNAL_URL,
    internalSecret: env.INTERNAL_SECRET,
  }),
)

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

// ---------------------------------------------------------------------------
// Start server
// ---------------------------------------------------------------------------

const server = Bun.serve({
  port: env.PORT,
  fetch: app.fetch,
})

logger.info('API server started', {
  port: server.port,
  baseUrl: `http://localhost:${server.port}`,
})
