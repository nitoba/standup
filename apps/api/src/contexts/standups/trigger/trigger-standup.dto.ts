import { ApiPropertyOptional } from '@nestjs/swagger'
import { IsBoolean, IsOptional, IsString, MinLength } from 'class-validator'

export class TriggerStandupDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  userId?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  discordUserId?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  extraContext?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  forceRegenerate?: boolean

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  rewriteFromStandupId?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  rewriteInstruction?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  replaceStandupId?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  reuseExistingSource?: boolean
}
