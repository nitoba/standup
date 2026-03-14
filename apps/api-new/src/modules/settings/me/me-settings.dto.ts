import {
  ArrayMinSize,
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
  @IsString()
  @MinLength(1, { message: requiredField('standupCron') })
  standupCron!: string

  @IsString()
  @MinLength(1, { message: requiredField('reminderCron') })
  reminderCron!: string

  @IsString()
  @MinLength(1, { message: requiredField('recoveryCron') })
  recoveryCron!: string

  @IsString()
  @MinLength(1, { message: requiredField('timezone') })
  timezone!: string

  @IsString()
  @MinLength(1, { message: requiredField('gitAuthor') })
  gitAuthor!: string

  @IsOptional()
  @IsString()
  @MinLength(1, { message: requiredField('gitSincePeriod') })
  gitSincePeriod?: string

  @IsArray()
  @ArrayMinSize(1, { message: 'selectedRepos must include at least one repo' })
  @IsString({ each: true, message: 'selectedRepos entries must be non-empty' })
  @MinLength(1, {
    each: true,
    message: 'selectedRepos entries must be non-empty',
  })
  selectedRepos!: string[]

  @IsOptional()
  @IsBoolean()
  active?: boolean

  @IsOptional()
  @IsIn(['light', 'dark'])
  emailTheme?: 'light' | 'dark'
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
}
