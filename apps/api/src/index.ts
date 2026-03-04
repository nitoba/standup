import { loadEnv } from '@standup/config'
import { Result } from '@standup/domain'
import { Hono } from 'hono'

const envResult = loadEnv()
if (Result.isError(envResult)) {
  throw new Error(`Invalid environment: ${envResult.error.message}`)
}

const env = envResult.value
const app = new Hono()

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

const server = Bun.serve({
  port: env.PORT,
  fetch: app.fetch,
})

console.log(`[api] listening on http://localhost:${server.port}`)
