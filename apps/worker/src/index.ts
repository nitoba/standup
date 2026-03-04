import { loadEnv } from '@standup/config'
import { Result } from '@standup/domain'
import { startScheduler } from './scheduler.js'

function bootstrap() {
  const envResult = loadEnv()
  if (Result.isError(envResult)) {
    throw new Error(`Invalid environment: ${envResult.error.message}`)
  }

  startScheduler(envResult.value)
}

if (import.meta.main) {
  bootstrap()
}
