import type { StandupRunMode } from '../../events/standup-events'
import type { StandupJobOptions } from './types'

export function resolveRunMode(options: StandupJobOptions): StandupRunMode {
  if (options.rewriteInstruction?.trim()) {
    return 'adjust'
  }

  if (options.reuseExistingSource) {
    return 'regenerate'
  }

  return 'generate'
}
