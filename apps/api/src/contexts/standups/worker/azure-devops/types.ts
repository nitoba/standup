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
  currentBranch: string
  commits: CommitInfo[]
  cardNumbers: string[]
  branchCardNumber: string | null
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
