import type { Result } from '../../../../shared/domain'

export interface StandupJobOptions {
  userId: string
  discordUserId: string
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
  replaceStandupId?: string
}

export interface StrategyExecutionInput {
  options: StandupJobOptions
  today: string
  reportProgress?: StrategyProgressReporter
}

export type StrategyResult = Result<GeneratedContent | null, Error>
