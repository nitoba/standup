import type { AzureMcpClient } from '@standup/azure-devops'
import type { WorkerEnv } from '@standup/config'
import type { StandupRepository } from '@standup/db'
import type { Result } from '@standup/domain'

export interface StandupJobOptions {
  userId: string
  discordUserId: string
  reposRootPath: string
  selectedRepos: string[]
  gitAuthor: string
  timezone: string
  gitSincePeriod?: string
  extraContext?: string
  forceRegenerate?: boolean
  rewriteFromStandupId?: string
  rewriteInstruction?: string
  replaceStandupId?: string
  reuseExistingSource?: boolean
}

export type StandupRunMode = 'generate' | 'regenerate' | 'adjust'

export type StrategyProgressStep =
  | 'collecting_git'
  | 'enriching_data'
  | 'generating_standup'

export interface StrategyProgressUpdate {
  step: StrategyProgressStep
  message: string
}

export type StrategyProgressReporter = (
  update: StrategyProgressUpdate,
) => Promise<void>

export interface GeneratedContent {
  content: string
  meetingType: string
  sourceData: string
  /** When replacing an existing standup (adjust / regenerate modes). */
  replaceStandupId?: string
}

export interface StrategyContext {
  env: WorkerEnv
  options: StandupJobOptions
  runMode: StandupRunMode
  today: string
  standupRepo: StandupRepository
  mcpClient?: AzureMcpClient
  reportProgress?: StrategyProgressReporter
}

export type StrategyResult = Result<GeneratedContent | null, Error>
