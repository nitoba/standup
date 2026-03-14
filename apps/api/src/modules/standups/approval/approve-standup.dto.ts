import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import {
  IsArray,
  IsOptional,
  IsString,
  MinLength,
  ValidateNested,
} from 'class-validator'
import type { CustomEntries } from '../../../shared/domain'

class CustomEntriesDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  @MinLength(1, { each: true })
  scheduledMeetings!: string[]

  @ApiProperty({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  @MinLength(1, { each: true })
  directCalls!: string[]
}

export class ApproveStandupDto {
  @ApiPropertyOptional({ type: () => CustomEntriesDto, nullable: true })
  @IsOptional()
  @ValidateNested()
  @Type(() => CustomEntriesDto)
  customEntries?: CustomEntries | null
}
