import { loadEnv } from '@standup/config'
import { Result } from '@standup/domain'
import { createServiceLogger, withContext } from '@standup/logger'
import { Hono } from 'hono'

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
const app = new Hono<AppContext>()
const logger = createServiceLogger({ service: 'api', component: 'http-server' })

app.use('*', async (c, next) => {
  const requestId = c.req.header('x-request-id') ?? crypto.randomUUID()
  const startedAt = Date.now()

  c.set('requestId', requestId)
  c.header('x-request-id', requestId)

  const requestLogger = withContext(logger, {
    requestId,
    method: c.req.method,
    path: c.req.path,
  })

  requestLogger.info('Request started')

  try {
    await next()
    requestLogger.info('Request completed', {
      statusCode: c.res.status,
      durationMs: Date.now() - startedAt,
    })
  } catch (error) {
    requestLogger.error('Request failed before response', {
      durationMs: Date.now() - startedAt,
      error,
    })
    throw error
  }
})

app.get('/health', (c) => {
  return c.json({
    status: 'ok',
    service: 'standup-api',
    phase: 'foundation',
    uptimeSeconds: Math.floor(process.uptime()),
  })
})

app.get('/ready', (c) => {
  return c.json({
    status: 'ready',
    nextStep: 'phase-1-contracts',
  })
})

app.onError((error, c) => {
  const requestId = c.get('requestId')
  const errorLogger = withContext(logger, {
    requestId,
    method: c.req.method,
    path: c.req.path,
  })

  errorLogger.error('Unhandled API error', {
    error,
  })

  return c.json(
    {
      error: 'Internal server error',
      requestId,
    },
    500,
  )
})

const server = Bun.serve({
  port: env.PORT,
  fetch: app.fetch,
})

logger.info('API server started', {
  port: server.port,
  baseUrl: `http://localhost:${server.port}`,
})
