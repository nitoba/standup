import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator'

function requiredField(field: string) {
  return `${field} is required`
}

export class PutMeSettingsDto {
  @ApiProperty()
  @IsString()
  @MinLength(1, { message: requiredField('standupCron') })
  standupCron!: string

  @ApiProperty()
  @IsString()
  @MinLength(1, { message: requiredField('reminderCron') })
  reminderCron!: string

  @ApiProperty()
  @IsString()
  @MinLength(1, { message: requiredField('recoveryCron') })
  recoveryCron!: string

  @ApiProperty()
  @IsString()
  @MinLength(1, { message: requiredField('timezone') })
  timezone!: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  gitAuthor?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1, { message: requiredField('gitSincePeriod') })
  gitSincePeriod?: string

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true, message: 'selectedRepos entries must be non-empty' })
  selectedRepos?: string[]

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  active?: boolean

  @ApiPropertyOptional({ enum: ['light', 'dark'] })
  @IsOptional()
  @IsIn(['light', 'dark'])
  emailTheme?: 'light' | 'dark'

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  azureDevopsUser?: string
}

export type MeSettingsRecord = {
  standupCron: string
  reminderCron: string
  recoveryCron: string
  timezone: string
  gitAuthor: string
  gitSincePeriod: string
  selectedRepos: string[]
  active: boolean
  emailTheme: 'light' | 'dark'
  snoozedUntil: number | null
  cancelledDate: string | null
  azureDevopsUser: string | null
  azureDevopsUuid: string | null
}
