import {
  DbError,
  ExternalServiceError,
  InvalidStateTransitionError,
  NotFoundError,
} from '@standup/domain'
import type { Context } from 'hono'

type DomainError =
  | NotFoundError
  | InvalidStateTransitionError
  | ExternalServiceError
  | DbError

/**
 * Maps a domain-layer tagged error to the appropriate HTTP response.
 *
 * Strategy pattern: centralises the error-to-status mapping so every
 * route handler delegates to a single source of truth instead of
 * repeating the same if/else chain.
 */
export function mapDomainErrorToResponse(
  error: DomainError,
  c: Context,
): Response {
  if (NotFoundError.is(error)) {
    return c.json({ error: error.message }, 404) as Response
  }

  if (InvalidStateTransitionError.is(error)) {
    return c.json({ error: error.message }, 409) as Response
  }

  if (ExternalServiceError.is(error)) {
    return c.json({ error: 'Service unavailable' }, 503) as Response
  }

  // DbError or unknown — always 500
  return c.json({ error: 'Internal server error' }, 500) as Response
}
