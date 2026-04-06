import type {
  AllProvidersUnavailableError,
  DbError,
  ExternalServiceError,
  NotFoundError,
  Result,
  ValidationError,
} from '../../../../shared/domain'

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
}

export interface StrategyExecutionInput {
  options: StandupJobOptions
  today: string
  reportProgress?: StrategyProgressReporter
}

export type StrategyError =
  | ValidationError
  | NotFoundError
  | DbError
  | ExternalServiceError
  | AllProvidersUnavailableError

export type StrategyResult = Result<GeneratedContent | null, StrategyError>

export type PipelineResult = Result<string | null, StrategyError>
