import { IsBoolean, IsOptional, IsString, MinLength } from 'class-validator'

export class TriggerStandupDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  userId?: string

  @IsOptional()
  @IsString()
  @MinLength(1)
  discordUserId?: string

  @IsOptional()
  @IsString()
  extraContext?: string

  @IsOptional()
  @IsBoolean()
  forceRegenerate?: boolean

  @IsOptional()
  @IsString()
  @MinLength(1)
  rewriteFromStandupId?: string

  @IsOptional()
  @IsString()
  @MinLength(1)
  rewriteInstruction?: string

  @IsOptional()
  @IsString()
  @MinLength(1)
  replaceStandupId?: string

  @IsOptional()
  @IsBoolean()
  reuseExistingSource?: boolean
}
