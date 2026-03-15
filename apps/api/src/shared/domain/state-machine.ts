import { Result } from 'better-result'
import { InvalidStateTransitionError } from './errors'
import type { StandupStatus } from './types'

const ALLOWED_TRANSITIONS: Record<StandupStatus, StandupStatus[]> = {
  draft: ['pending_review'],
  pending_review: ['approved', 'rejected', 'draft'],
  approved: ['published'],
  rejected: ['draft'],
  published: [],
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
