import { describe, expect, it } from 'vitest'
import { isCronDueNow } from './cron-matcher.js'

describe('isCronDueNow', () => {
  it('returns true when the cron expression matches the current minute', () => {
    const now = new Date('2026-03-04T17:30:15Z')
    expect(isCronDueNow('30 17 * * 1-5', 'UTC', now)).toBe(true)
  })

  it('returns false when the cron expression does not match the current minute', () => {
    const now = new Date('2026-03-04T17:31:15Z')
    expect(isCronDueNow('30 17 * * 1-5', 'UTC', now)).toBe(false)
  })

  it('returns false on weekends when cron is weekdays only', () => {
    const now = new Date('2026-03-07T17:30:15Z')
    expect(isCronDueNow('30 17 * * 1-5', 'UTC', now)).toBe(false)
  })

  it('respects timezone — does not match when UTC time differs from local', () => {
    // 17:30 UTC = 14:30 Sao Paulo (UTC-3) — cron targets 17:30 SP time
    const now = new Date('2026-03-04T17:30:15Z')
    expect(isCronDueNow('30 17 * * 1-5', 'America/Sao_Paulo', now)).toBe(
      false,
    )
  })

  it('matches when timezone-adjusted time is correct', () => {
    // 20:30 UTC = 17:30 Sao Paulo (UTC-3)
    const now = new Date('2026-03-04T20:30:15Z')
    expect(isCronDueNow('30 17 * * 1-5', 'America/Sao_Paulo', now)).toBe(true)
  })

  it('handles every-minute cron', () => {
    const now = new Date('2026-03-04T12:00:30Z')
    expect(isCronDueNow('* * * * *', 'UTC', now)).toBe(true)
  })

  it('returns false when more than 60s past the match', () => {
    const now = new Date('2026-03-04T17:31:05Z')
    expect(isCronDueNow('30 17 * * 1-5', 'UTC', now)).toBe(false)
  })
})
