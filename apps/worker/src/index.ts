import { initTracing } from '@standup/observability'

initTracing('standup-worker')

import { createAzureMcpClient } from '@standup/azure-devops'
import { loadWorkerEnv } from '@standup/config'
import { Result } from '@standup/domain'
import { createServiceLogger } from '@standup/logger'
import { createInternalRouter } from './http/router.js'
import { runStandupJob } from './job/standup-job.js'
import { runWeeklyDigestJob } from './job/weekly-digest-job.js'
import { startScheduler } from './scheduler.js'

const logger = createServiceLogger({
  service: 'worker',
  component: 'bootstrap',
})

async function bootstrap() {
  const envResult = loadWorkerEnv()
  if (Result.isError(envResult)) {
    throw new Error(`Invalid environment: ${envResult.error.message}`)
  }

  const env = envResult.value

  // ---------------------------------------------------------------------------
  // MCP singleton — connect once at startup, reuse across all requests/jobs.
  // ---------------------------------------------------------------------------

  const mcpClient = createAzureMcpClient({
    orgUrl: `https://dev.azure.com/${env.AZURE_DEVOPS_ORG}`,
    pat: env.AZURE_DEVOPS_PAT,
    defaultProject: env.AZURE_DEVOPS_DEFAULT_PROJECT,
  })

  const connectResult = await mcpClient.connect()
  if (connectResult.isErr()) {
    logger.error('Failed to connect MCP client at startup', {
      error: connectResult.error.message,
    })
    // Non-fatal: the worker can still run; individual requests will fail gracefully.
    // The generator has its own fallback for when MCP is unavailable.
  } else {
    logger.info('MCP client connected (singleton)')
  }

  // ---------------------------------------------------------------------------
  // Scheduler + HTTP server
  // ---------------------------------------------------------------------------

  startScheduler(env, mcpClient)

  const internalApp = createInternalRouter({
    internalSecret: env.INTERNAL_SECRET,
    databaseUrl: env.DATABASE_URL,
    triggerStandupJob: async (opts) => runStandupJob(env, opts, mcpClient),
    triggerWeeklyDigestJob: async (opts) => runWeeklyDigestJob(env, opts),
    mcpClient,
    azureProjects: ['AGROTRACE', 'CHECKMILK'],
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
