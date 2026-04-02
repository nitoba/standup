import type { Agent } from '@mariozechner/pi-agent-core'
import type { Result } from '../../../../shared/domain'

export interface StandupJobOptions {
  userId: string
  discordUserId: string
  selectedRepos: string[]
  gitAuthor: string
  azureDevopsUser?: string
  azureDevopsUuid?: string
  timezone: string
  gitSincePeriod?: string
  extraContext?: string
  forceRegenerate?: boolean
  rewriteFromStandupId?: string
  rewriteInstruction?: string
  replaceStandupId?: string
  reuseExistingSource?: boolean
}

export type StrategyProgressStep =
  | 'collecting_git'
  | 'collecting_board'
  | 'enriching_data'
  | 'generating_standup'
  | 'streaming_content'

export interface StrategyProgressUpdate {
  step: StrategyProgressStep
  message: string
  partialContent?: string
}

export type StrategyProgressReporter = (
  update: StrategyProgressUpdate,
) => Promise<void>

export interface GeneratedContent {
  content: string
  meetingType: string
  sourceData: string
  replaceStandupId?: string
  /** Transient — used to create session after persistence, not serialized to DB */
  agent?: Agent
}

export interface StrategyExecutionInput {
  options: StandupJobOptions
  today: string
  reportProgress?: StrategyProgressReporter
}

export type StrategyResult = Result<GeneratedContent | null, Error>
