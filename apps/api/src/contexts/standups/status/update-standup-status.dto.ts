import { ApiProperty } from '@nestjs/swagger'
import { IsIn } from 'class-validator'
import type { StandupStatus } from '../../../shared/domain'

const ALLOWED_STATUSES = [
  'draft',
  'delivery_pending',
  'pending_review',
  'rejected',
] as const

export class UpdateStandupStatusDto {
  @ApiProperty({ enum: ALLOWED_STATUSES })
  @IsIn(ALLOWED_STATUSES)
  status!: Extract<
    StandupStatus,
    'draft' | 'delivery_pending' | 'pending_review' | 'rejected'
  >
}
