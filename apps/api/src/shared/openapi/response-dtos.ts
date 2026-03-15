/**
 * Response DTOs for OpenAPI documentation.
 *
 * These classes exist solely so @nestjs/swagger can generate typed
 * response schemas in the OpenAPI spec. The actual data is built
 * inline in controllers/services — these DTOs mirror those shapes.
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import type { CustomEntries, StandupStatus } from '../domain'

// ─── Standup ────────────────────────────────────────────────

class CustomEntriesDto {
  @ApiProperty({ type: [String] })
  scheduledMeetings!: string[]

  @ApiProperty({ type: [String] })
  directCalls!: string[]
}

export class StandupRecordDto {
  @ApiProperty()
  id!: string

  @ApiProperty()
  date!: string

  @ApiProperty()
  meetingType!: string

  @ApiProperty()
  content!: string

  @ApiProperty()
  sourceData!: string

  @ApiPropertyOptional({ type: () => CustomEntriesDto, nullable: true })
  customEntries!: CustomEntries | null

  @ApiProperty({
    enum: ['draft', 'pending_review', 'approved', 'rejected', 'published'],
  })
  status!: StandupStatus

  @ApiPropertyOptional({ nullable: true })
  userId!: string | null

  @ApiPropertyOptional({ nullable: true })
  dmMessageId!: string | null

  @ApiProperty()
  createdAt!: number

  @ApiProperty()
  updatedAt!: number
}

class PaginationDto {
  @ApiProperty()
  page!: number

  @ApiProperty()
  pageSize!: number

  @ApiProperty()
  total!: number

  @ApiProperty()
  totalPages!: number
}

class SummaryDto {
  @ApiProperty()
  total!: number

  @ApiProperty()
  approved!: number

  @ApiProperty()
  pending!: number

  @ApiProperty()
  rejected!: number
}

export class StandupListResponseDto {
  @ApiProperty({ type: [StandupRecordDto] })
  data!: StandupRecordDto[]

  @ApiProperty({ type: () => PaginationDto })
  pagination!: PaginationDto

  @ApiProperty({ type: () => SummaryDto })
  summary!: SummaryDto
}

export class StandupDetailResponseDto {
  @ApiProperty({ type: () => StandupRecordDto })
  data!: StandupRecordDto
}

// ─── Trigger / Fire-and-forget ──────────────────────────────

export class TriggerAcceptedDto {
  @ApiProperty()
  ok!: boolean

  @ApiProperty()
  accepted!: boolean
}

export class TriggerConflictDto {
  @ApiProperty()
  ok!: boolean

  @ApiProperty()
  accepted!: boolean

  @ApiProperty()
  message!: string

  @ApiProperty({ enum: ['pending_review_exists', 'already_approved_today'] })
  reason!: string

  @ApiProperty()
  standupId!: string
}

// ─── Approve ────────────────────────────────────────────────

export class ApproveStandupResponseDto {
  @ApiProperty({ type: () => StandupRecordDto })
  data!: StandupRecordDto

  @ApiPropertyOptional({ nullable: true })
  warning?: string
}

// ─── Settings ───────────────────────────────────────────────

export class MeSettingsRecordDto {
  @ApiProperty()
  standupCron!: string

  @ApiProperty()
  reminderCron!: string

  @ApiProperty()
  recoveryCron!: string

  @ApiProperty()
  timezone!: string

  @ApiProperty()
  gitAuthor!: string

  @ApiProperty()
  gitSincePeriod!: string

  @ApiProperty({ type: [String] })
  selectedRepos!: string[]

  @ApiProperty()
  active!: boolean

  @ApiProperty({ enum: ['light', 'dark'] })
  emailTheme!: 'light' | 'dark'

  @ApiPropertyOptional({ nullable: true })
  snoozedUntil!: number | null

  @ApiPropertyOptional({ nullable: true })
  cancelledDate!: string | null
}

export class MeSettingsResponseDto {
  @ApiProperty({ type: () => MeSettingsRecordDto })
  data!: MeSettingsRecordDto
}

// ─── Repos ──────────────────────────────────────────────────

export class RepoInfoDto {
  @ApiProperty()
  id!: string

  @ApiProperty()
  name!: string

  @ApiProperty()
  project!: string
}

export class RepoListResponseDto {
  @ApiProperty({ type: [RepoInfoDto] })
  data!: RepoInfoDto[]
}

// ─── Reminders ──────────────────────────────────────────────

class SnoozeDataDto {
  @ApiProperty()
  ok!: boolean

  @ApiProperty()
  snoozedUntil!: string
}

export class SnoozeReminderResponseDto {
  @ApiProperty({ type: () => SnoozeDataDto })
  data!: SnoozeDataDto
}

class CancelTodayDataDto {
  @ApiProperty()
  ok!: boolean

  @ApiProperty()
  cancelledDate!: string
}

export class CancelTodayReminderResponseDto {
  @ApiProperty({ type: () => CancelTodayDataDto })
  data!: CancelTodayDataDto
}
