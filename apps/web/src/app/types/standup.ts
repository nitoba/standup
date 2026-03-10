export type StandupStatus =
  | 'draft'
  | 'pending_review'
  | 'approved'
  | 'rejected'
  | 'published'

export interface ApiDataResponseDto<T> {
  data: T
}

export interface PaginationDto {
  page: number
  pageSize: number
  total: number
  totalPages: number
}

export interface StandupSummaryDto {
  total: number
  approved: number
  pending: number
  rejected: number
}

export interface StandupCustomEntriesDto {
  scheduledMeetings: string[]
  directCalls: string[]
}

export interface StandupDto {
  id: string
  date: string
  meetingType: string
  content: string
  sourceData: string
  customEntries: StandupCustomEntriesDto | null
  status: StandupStatus
  userId: string | null
  createdAt: number
  updatedAt: number
}

export interface StandupListResponseDto
  extends ApiDataResponseDto<StandupDto[]> {
  pagination: PaginationDto
  summary: StandupSummaryDto
}

export type StandupDetailResponseDto = ApiDataResponseDto<StandupDto>

export interface ApproveStandupResponseDto
  extends ApiDataResponseDto<StandupDto> {
  warning?: string
}

export interface SettingsDto {
  standupCron: string
  reminderCron: string
  recoveryCron: string
  timezone: string
  gitAuthor: string
  gitSincePeriod: string
  selectedRepos: string[]
  active: boolean
  snoozedUntil: number | null
  cancelledDate: string | null
}

export type GetSettingsResponseDto = ApiDataResponseDto<SettingsDto>

export type UpdateSettingsResponseDto = ApiDataResponseDto<SettingsDto>

export interface SessionUserDto {
  id: string
  email?: string | null
  name?: string | null
  image?: string | null
  [key: string]: unknown
}

export interface SessionRecordDto {
  id: string
  userId: string
  expiresAt: string
  [key: string]: unknown
}

export interface SessionDto {
  session: SessionRecordDto
  user: SessionUserDto
}

export interface SnoozeReminderAckDto {
  ok: boolean
  snoozedUntil: string
}

export interface CancelTodayReminderAckDto {
  ok: boolean
  cancelledDate: string
}

export interface ReminderAcceptedDto {
  ok: true
  accepted: true
}

export type SnoozeReminderResponseDto = ApiDataResponseDto<SnoozeReminderAckDto>

export type CancelTodayReminderResponseDto =
  ApiDataResponseDto<CancelTodayReminderAckDto>

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
  updatedAt?: string
  meetingType?: string
  content?: string
  sourceData?: string
  contentPreview: string
  customEntries?: StandupCustomEntriesDto | null
  userId?: string | null
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

export interface StandupPagination {
  page: number
  pageSize: number
  total: number
  totalPages: number
}

export interface StandupSummary {
  total: number
  approved: number
  pending: number
  rejected: number
}

export interface StandupPage {
  items: Standup[]
  pagination: StandupPagination
  summary: StandupSummary
}
