export const STANDUP_PROGRESS_EVENT = 'standup.progress'
export const STANDUP_GENERATED_EVENT = 'standup.generated'
export const STANDUP_FAILED_EVENT = 'standup.failed'
export const STANDUP_READY_EVENT = 'standup.ready'
export const STANDUP_REMINDER_EVENT = 'standup.reminder'
export const STANDUP_STATUS_CHANGED_EVENT = 'standup.status-changed'
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
