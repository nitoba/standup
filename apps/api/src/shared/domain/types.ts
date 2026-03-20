export type WeeklyDigestStatus =
  | 'pending'
  | 'sending'
  | 'sent'
  | 'unknown'
  | 'failed'
  | 'skipped'

export type EmailThemePreference = 'light' | 'dark'

export interface WeeklyDigestRecord {
  id: string
  userId: string
  weekStart: string
  weekEnd: string
  standupIds: string[]
  insights: string
  status: WeeklyDigestStatus
  error: string | null
  sentAt: number | null
  createdAt: number
  updatedAt: number
}

export type StandupStatus =
  | 'draft'
  | 'pending_review'
  | 'approved'
  | 'rejected'
  | 'published'

export interface CommitInfo {
  hash: string
  subject: string
  body: string
  sourceBranch: string
  filesChanged: number
  insertions: number
  deletions: number
  files: string[]
}

export interface RepoActivity {
  repoName: string
  repoPath: string
  commits: CommitInfo[]
  cardNumbers: string[]
}

export interface GatheredGitActivity {
  timestamp: string
  repos: RepoActivity[]
}

export type BoardActionType =
  | 'created'
  | 'state_change'
  | 'assigned'
  | 'commented'
  | 'field_changed'

export interface BoardAction {
  type: BoardActionType
  timestamp: string
  details: string
}

export interface BoardWorkItemActivity {
  id: number
  title: string
  type: string
  state: string
  assignedTo: string
  project: string
  actions: BoardAction[]
}

export interface GatheredBoardActivity {
  timestamp: string
  workItems: BoardWorkItemActivity[]
}

export interface StandupSourceData {
  git: GatheredGitActivity | null
  board: GatheredBoardActivity | null
}

export interface GenerateStandupInput {
  date: string
  meetingType: string
  gitActivity?: GatheredGitActivity
  boardActivity?: GatheredBoardActivity
  extraContext?: string
  azureDevopsUuid?: string
}

export interface GeneratedStandup {
  content: string
  summary: string
}

export interface CustomEntries {
  scheduledMeetings: string[]
  directCalls: string[]
}

export interface StandupRecord {
  id: string
  date: string
  meetingType: string
  content: string
  sourceData: string
  customEntries: CustomEntries | null
  status: StandupStatus
  userId: string | null
  dmMessageId: string | null
  createdAt: number
  updatedAt: number
  sentToDiscordAt: number | null
}
