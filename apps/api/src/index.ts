import { loadEnv } from '@standup/config'
import { Result } from '@standup/domain'
import { createServiceLogger, withContext } from '@standup/logger'
import { Hono } from 'hono'
import { requestLogger } from './http/middleware.js'
import { createStandupRouter } from './standup/router.js'

type AppContext = {
  Variables: {
    requestId: string
  }
}

const envResult = loadEnv()
if (Result.isError(envResult)) {
  throw new Error(`Invalid environment: ${envResult.error.message}`)
}

const env = envResult.value
const logger = createServiceLogger({ service: 'api', component: 'http-server' })

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

const app = new Hono<AppContext>()

app.use('*', requestLogger(logger))

// ---------------------------------------------------------------------------
// Health / readiness
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
// Domain routes
// ---------------------------------------------------------------------------

app.route('/', createStandupRouter({ databaseUrl: env.DATABASE_URL }))

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
