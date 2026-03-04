import { Result } from 'better-result'
import { describe, expect, it } from 'vitest'
import { InvalidStateTransitionError } from './errors'
import { transitionStandupStatus } from './state-machine'

describe('transitionStandupStatus', () => {
  it('returns Ok for allowed transition', () => {
    const result = transitionStandupStatus('draft', 'pending_review')
    expect(Result.isOk(result)).toBe(true)
    if (Result.isOk(result)) {
      expect(result.value).toBe('pending_review')
    }
  })

  it('returns Ok for idempotent transition', () => {
    const result = transitionStandupStatus('approved', 'approved')
    expect(Result.isOk(result)).toBe(true)
    if (Result.isOk(result)) {
      expect(result.value).toBe('approved')
    }
  })

  it('returns InvalidStateTransitionError for invalid transition', () => {
    const result = transitionStandupStatus('draft', 'published')
    expect(Result.isError(result)).toBe(true)
    if (Result.isError(result)) {
      expect(InvalidStateTransitionError.is(result.error)).toBe(true)
      expect(result.error._tag).toBe('InvalidStateTransitionError')
    }
  })
})
