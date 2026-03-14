import type { CustomEntries } from '@standup/domain'
import { Type } from 'class-transformer'
import {
  IsArray,
  IsOptional,
  IsString,
  MinLength,
  ValidateNested,
} from 'class-validator'

class CustomEntriesDto {
  @IsArray()
  @IsString({ each: true })
  @MinLength(1, { each: true })
  scheduledMeetings!: string[]

  @IsArray()
  @IsString({ each: true })
  @MinLength(1, { each: true })
  directCalls!: string[]
}

export class ApproveStandupDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => CustomEntriesDto)
  customEntries?: CustomEntries | null
}
