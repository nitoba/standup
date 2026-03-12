import { initTracing } from '@standup/observability'

initTracing('standup-api')

import { loadApiEnv } from '@standup/config'
import { Result } from '@standup/domain'
import { createServiceLogger } from '@standup/logger'
import { createApiRouter } from './http/router.js'
import { EventBus } from './http/sse/event-bus.js'

const envResult = loadApiEnv()
if (Result.isError(envResult)) {
  throw new Error(`Invalid environment: ${envResult.error.message}`)
}

const env = envResult.value
const logger = createServiceLogger({ service: 'api', component: 'bootstrap' })
const eventBus = new EventBus()

const app = createApiRouter({ env, eventBus })

const server = Bun.serve({
  port: env.PORT,
  fetch: app.fetch,
})

logger.info('API server started', {
  port: server.port,
  baseUrl: `http://localhost:${server.port}`,
})
