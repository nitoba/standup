import type { CommitInfo } from '../../../../shared/domain'

export interface WorkItemDetail {
  id: string
  title: string
  state: string
  assignedTo: string
}

export interface PullRequestDetail {
  id: number
  title: string
  status: 'active' | 'completed' | 'abandoned'
  repoId: string
  creatorId: string
}

export interface EnrichedWorkItem {
  cardNumber: string
  workItem: WorkItemDetail | null
  pullRequests: PullRequestDetail[]
}

export interface EnrichedRepo {
  repoName: string
  repoPath: string
  commits: CommitInfo[]
  cardNumbers: string[]
  enrichedItems: EnrichedWorkItem[]
}

export interface EnrichedGitActivity {
  timestamp: string
  repos: EnrichedRepo[]
  userUuid: string
}

export interface RepoInfo {
  name: string
  id: string
  project: string
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

export interface WorkItemResponse {
  id: number
  fields: Record<string, unknown>
}

export interface WorkItemUpdateFieldChange {
  oldValue?: unknown
  newValue?: unknown
}

export interface WorkItemUpdate {
  id: number
  rev: number
  revisedDate: string
  revisedBy: { displayName: string }
  fields?: Record<string, WorkItemUpdateFieldChange>
}
