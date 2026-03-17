import { Result } from 'better-result'
import { ValidationError } from './errors'
import { GitActivitySchema, StandupSourceDataSchema } from './schemas'
import type { StandupSourceData } from './types'

export function parseSourceData(
  raw: string,
): Result<StandupSourceData, ValidationError> {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return Result.err(
      new ValidationError({
        field: 'sourceData',
        message: 'Stored sourceData is not valid JSON (invalid JSON)',
      }),
    )
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return Result.err(
      new ValidationError({
        field: 'sourceData',
        message: 'sourceData must be a JSON object',
      }),
    )
  }

  const record = parsed as Record<string, unknown>

  if ('git' in record || 'board' in record) {
    const validated = StandupSourceDataSchema.safeParse(record)
    if (!validated.success) {
      return Result.err(
        new ValidationError({
          field: 'sourceData',
          message: `Invalid source data: ${validated.error.message}`,
        }),
      )
    }
    return Result.ok(validated.data)
  }

  const gitValidated = GitActivitySchema.safeParse(parsed)
  if (!gitValidated.success) {
    return Result.err(
      new ValidationError({
        field: 'sourceData',
        message: `sourceData does not match git activity or source data format: ${gitValidated.error.message}`,
      }),
    )
  }

  return Result.ok({ git: gitValidated.data, board: null })
}
