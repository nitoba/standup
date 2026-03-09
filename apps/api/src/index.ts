import { loadApiEnv } from '@standup/config'
import { Result } from '@standup/domain'
import { createServiceLogger, withContext } from '@standup/logger'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { createAuth } from './auth/auth.js'
import { handleAuthCallback } from './auth/callback-page.js'
import { handleDiscordLogin } from './auth/login-redirect.js'
import { sessionAuthMiddleware } from './auth/middleware.js'
import { requestLogger } from './http/middleware.js'
import { handleCancelTodayReminder } from './reminders/cancel-today.js'
import { handleRunNowReminder } from './reminders/run-now.js'
import { handleSnoozeReminder } from './reminders/snooze.js'
import { handleListRepos } from './repos/list.js'
import { handleGetMeSettings } from './settings/get-me.js'
import { handlePutMySettings } from './settings/put-me.js'
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
  corsOrigin: env.CORS_ORIGIN,
  botInternalUrl: env.BOT_INTERNAL_URL,
  internalSecret: env.INTERNAL_SECRET,
})

const sessionMiddleware = sessionAuthMiddleware(auth, env.INTERNAL_SECRET)

const standupRouter = createStandupRouter({
  databaseUrl: env.DATABASE_URL,
  reposRootPath: env.REPOS_ROOT_PATH,
  workerInternalUrl: env.WORKER_INTERNAL_URL,
  internalSecret: env.INTERNAL_SECRET,
})

const settingsRouter = new Hono<AppContext>()
settingsRouter.get('/me', (c) => handleGetMeSettings(c, env.DATABASE_URL))
settingsRouter.put('/me', (c) =>
  handlePutMySettings(c, { databaseUrl: env.DATABASE_URL }),
)

const remindersRouter = new Hono<AppContext>()
remindersRouter.post('/run-now', (c) =>
  handleRunNowReminder(c, {
    databaseUrl: env.DATABASE_URL,
    reposRootPath: env.REPOS_ROOT_PATH,
    workerInternalUrl: env.WORKER_INTERNAL_URL,
    internalSecret: env.INTERNAL_SECRET,
  }),
)
remindersRouter.post('/snooze', (c) =>
  handleSnoozeReminder(c, {
    workerInternalUrl: env.WORKER_INTERNAL_URL,
    internalSecret: env.INTERNAL_SECRET,
  }),
)
remindersRouter.post('/cancel-today', (c) =>
  handleCancelTodayReminder(c, {
    workerInternalUrl: env.WORKER_INTERNAL_URL,
    internalSecret: env.INTERNAL_SECRET,
  }),
)

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

const app = new Hono<AppContext>()

app.use('*', requestLogger(logger))
app.use(
  '*',
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

app.use('/standups/*', sessionMiddleware)
app.use('/settings/*', sessionMiddleware)
app.use('/repos', sessionMiddleware)
app.use('/reminders/*', sessionMiddleware)

app.route('/', standupRouter)
app.route('/settings', settingsRouter)
app.get('/repos', (c) =>
  handleListRepos(c, {
    workerInternalUrl: env.WORKER_INTERNAL_URL,
    internalSecret: env.INTERNAL_SECRET,
  }),
)
app.route('/reminders', remindersRouter)

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
