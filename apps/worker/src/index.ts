import { loadEnv } from '@standup/config'
import { Result } from '@standup/domain'
import { createServiceLogger } from '@standup/logger'
import { createInternalRouter } from './http/router.js'
import { runStandupJob } from './job/standup-job.js'
import { startScheduler } from './scheduler.js'

const logger = createServiceLogger({
  service: 'worker',
  component: 'bootstrap',
})

function bootstrap() {
  const envResult = loadEnv()
  if (Result.isError(envResult)) {
    throw new Error(`Invalid environment: ${envResult.error.message}`)
  }

  const env = envResult.value

  startScheduler(env)

  const internalApp = createInternalRouter({
    internalSecret: env.INTERNAL_SECRET,
    triggerStandupJob: async (opts) => runStandupJob(env, opts),
  })

  const server = Bun.serve({
    port: env.WORKER_INTERNAL_PORT,
    fetch: internalApp.fetch,
  })

  logger.info('Worker internal HTTP server started', {
    port: server.port,
    baseUrl: `http://localhost:${server.port}`,
  })
}

if (import.meta.main) {
  bootstrap()
}
