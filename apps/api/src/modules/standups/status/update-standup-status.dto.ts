import { ApiProperty } from '@nestjs/swagger'
import { IsIn } from 'class-validator'
import type { StandupStatus } from '../../../shared/domain'

const ALLOWED_STATUSES = [
  'draft',
  'pending_review',
  'rejected',
  'published',
] as const

export class UpdateStandupStatusDto {
  @ApiProperty({ enum: ALLOWED_STATUSES })
  @IsIn(ALLOWED_STATUSES)
  status!: Extract<
    StandupStatus,
    'draft' | 'pending_review' | 'rejected' | 'published'
  >
}
