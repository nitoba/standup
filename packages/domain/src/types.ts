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
  filesChanged: number
  insertions: number
  deletions: number
  files: string[]
}

export interface RepoActivity {
  repoName: string
  repoPath: string
  currentBranch: string
  commits: CommitInfo[]
  cardNumbers: string[]
  branchCardNumber: string | null
}

export interface GatheredGitActivity {
  timestamp: string
  repos: RepoActivity[]
}

export interface GenerateStandupInput {
  date: string
  meetingType: string
  gitActivity: GatheredGitActivity
  extraContext?: string
}

export interface GeneratedStandup {
  content: string
  summary: string
}

export interface CustomEntries {
  scheduledMeetings: string[] // 📆 extras (e.g. "Planning Backend", "Refinamento mobile")
  directCalls: string[] // ☎️ calls (e.g. "Call com João sobre deploy")
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
}
