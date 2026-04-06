import { DbError, Result } from '../../../shared/domain'
import type { AppLoggerFactory } from '../../logger'

export function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function createDbError(
  logger: ReturnType<AppLoggerFactory['create']>,
  operation: string,
  error: unknown,
): DbError {
  const message = getErrorMessage(error)
  logger.error('DB operation failed', { operation, error: message })
  return new DbError({ operation, message })
}

export function dbErrResult(
  logger: ReturnType<AppLoggerFactory['create']>,
  operation: string,
  error: unknown,
): Result<never, DbError> {
  return Result.err(createDbError(logger, operation, error))
}

export function dbMissingRowError(
  operation: string,
  resource: string,
  id: string,
): DbError {
  return new DbError({
    operation,
    message: `${resource} not found: ${id}`,
  })
}
