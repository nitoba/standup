import { Result } from 'better-result'
import { InvalidStateTransitionError } from './errors'
import type { StandupStatus } from './types'

const ALLOWED_TRANSITIONS: Record<StandupStatus, StandupStatus[]> = {
  draft: ['delivery_pending'],
  delivery_pending: ['pending_review', 'draft'],
  pending_review: ['approved', 'rejected', 'draft'],
  approved: [],
  rejected: ['draft'],
}

export function transitionStandupStatus(
  current: StandupStatus,
  next: StandupStatus,
) {
  if (current === next) {
    return Result.ok(current)
  }

  if (ALLOWED_TRANSITIONS[current].includes(next)) {
    return Result.ok(next)
  }

  return Result.err(
    new InvalidStateTransitionError({ from: current, to: next }),
  )
}
