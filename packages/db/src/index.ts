import { createServiceLogger } from '@standup/logger'

export function dbCommandStatus(command?: string): string {
  const mode = command ?? 'status'
  return `[db] command '${mode}' is intentionally stubbed in phase 1 (no modeling yet).`
}

if (import.meta.main) {
  const command = process.argv[2]
  const logger = createServiceLogger({ service: 'db', component: 'cli' })
  logger.info(dbCommandStatus(command), {
    command: command ?? 'status',
  })
}
