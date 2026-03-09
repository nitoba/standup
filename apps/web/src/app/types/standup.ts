export type StandupStatus = 'approved' | 'pending_review' | 'rejected'

export type StandupSectionTone = 'default' | 'cyan' | 'muted'

export interface StandupSection {
  title: string
  tone: StandupSectionTone
  items: string[]
}

export interface StandupSourceCommit {
  hash: string
  message: string
}

export interface StandupSourceRepo {
  name: string
  commits: StandupSourceCommit[]
}

export interface Standup {
  id: string
  date: string
  status: StandupStatus
  createdAt: string
  contentPreview: string
  sections: StandupSection[]
  sources: StandupSourceRepo[]
}

export interface DashboardMetric {
  count: number
  change: string
}

export interface DashboardMetrics {
  total: DashboardMetric
  approved: DashboardMetric
  pending: DashboardMetric
  rejected: DashboardMetric
}
