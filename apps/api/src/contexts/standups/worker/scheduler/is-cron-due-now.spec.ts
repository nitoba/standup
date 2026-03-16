import { describe, expect, it } from 'vitest'
import { isCronDueNow } from './is-cron-due-now'

describe('isCronDueNow', () => {
  it('returns true at the exact scheduled minute', () => {
    expect(
      isCronDueNow(
        '50 17 * * 1-5',
        'America/Fortaleza',
        new Date('2026-03-13T20:50:00.000Z'),
      ),
    ).toBe(true)
  })

  it('returns true later in the same scheduled minute', () => {
    expect(
      isCronDueNow(
        '50 17 * * 1-5',
        'America/Fortaleza',
        new Date('2026-03-13T20:50:30.000Z'),
      ),
    ).toBe(true)
  })

  it('returns false in the next minute', () => {
    expect(
      isCronDueNow(
        '50 17 * * 1-5',
        'America/Fortaleza',
        new Date('2026-03-13T20:51:00.000Z'),
      ),
    ).toBe(false)
  })
})
