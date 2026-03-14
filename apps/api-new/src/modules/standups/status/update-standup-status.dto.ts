import type { StandupStatus } from '@standup/domain'
import { IsIn } from 'class-validator'

const ALLOWED_STATUSES = ['draft', 'pending_review', 'rejected', 'published']

export class UpdateStandupStatusDto {
  @IsIn(ALLOWED_STATUSES)
  status!: Extract<
    StandupStatus,
    'draft' | 'pending_review' | 'rejected' | 'published'
  >
}
