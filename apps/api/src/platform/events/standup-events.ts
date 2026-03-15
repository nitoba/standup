export const STANDUP_PROGRESS_EVENT = 'standup.progress'
export const STANDUP_GENERATED_EVENT = 'standup.generated'
export const STANDUP_FAILED_EVENT = 'standup.failed'
export const STANDUP_READY_EVENT = 'standup.ready'
export const STANDUP_REMINDER_EVENT = 'standup.reminder'
export const STANDUP_STATUS_CHANGED_EVENT = 'standup.status-changed'
export const STANDUP_TRIGGER_REQUESTED_EVENT = 'standup.trigger.requested'
export const STANDUP_JOB_DISPATCH_REQUESTED_EVENT =
  'standup.job-dispatch.requested'
export const WORKER_REPOS_REQUESTED_EVENT = 'worker.repos.requested'
export const WORKER_REMINDER_ACTION_REQUESTED_EVENT =
  'worker.reminder-action.requested'
export const DISCORD_LOGIN_SUCCESS_REQUESTED_EVENT =
  'discord.login-success.requested'
export const USER_DM_REQUESTED_EVENT = 'notification.user-dm.requested'
export const JOB_FAILED_NOTIFICATION_EVENT = 'notification.job-failed.requested'

export type StandupRunMode = 'generate' | 'regenerate' | 'adjust'

export type StandupProgressStep =
  | 'queued'
  | 'collecting_git'
  | 'enriching_data'
  | 'generating_standup'
  | 'saving_draft'
  | 'notifying_review'
  | 'completed'
  | 'no_activity'

export type StandupProgressEvent = {
  userId: string
  runId: string
  date: string
  mode: StandupRunMode
  step: StandupProgressStep
  message: string
  standupId?: string
}

export type StandupGeneratedEvent = {
  userId: string
  runId: string
  standupId: string
  date: string
  mode: StandupRunMode
}

export type StandupFailedEvent = {
  userId: string
  runId: string
  date: string
  mode: StandupRunMode
  message: string
}

export type StandupReadyEvent = {
  standupId: string
  discordUserId: string
}

export type StandupReminderEvent = {
  discordUserId: string
  nextRunAt: string
}

export type StandupStatusChangedEvent = {
  userId: string
  standupId: string
  newStatus: string
  source?: 'discord' | 'web' | 'worker' | 'system'
}

export type StandupTriggerRequestEvent = {
  userId: string
  discordUserId: string
  extraContext?: string
  forceRegenerate?: boolean
  rewriteFromStandupId?: string
  rewriteInstruction?: string
  replaceStandupId?: string
  reuseExistingSource?: boolean
}

export type StandupTriggerRequestOutcome =
  | { accepted: true }
  | {
      accepted: false
      reason: 'pending_review_exists' | 'already_approved_today'
      standupId?: string
    }

export type StandupJobDispatchRequestedEvent = {
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

export type WorkerReposRequestedEvent = Record<string, never>

export type WorkerReminderActionRequestedEvent = {
  action: 'snooze' | 'cancel-today'
  userId: string
}

export type DiscordLoginSuccessRequestedEvent = {
  discordUserId: string
}

export type UserDmRequestedEvent = {
  discordUserId: string
  title: string
  message: string
  color?: number
}

export type JobFailedNotificationEvent = {
  error: string
  context?: string
  discordUserId?: string
}
