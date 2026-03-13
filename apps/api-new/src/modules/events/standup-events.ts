export const STANDUP_TRIGGER_REQUESTED_EVENT = 'standup.trigger.requested'
export const STANDUP_APPROVAL_REQUESTED_EVENT = 'standup.approval.requested'

export type StandupTriggerRequestedEvent = {
  userId: string
  discordUserId?: string
  source: 'http' | 'scheduler' | 'discord'
}

export type StandupApprovalRequestedEvent = {
  standupId: string
  userId: string
  source: 'http' | 'discord'
}
