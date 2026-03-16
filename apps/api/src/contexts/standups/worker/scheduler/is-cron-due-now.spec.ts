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

  it('works for a UTC daily cron and rejects the minute after', () => {
    expect(
      isCronDueNow(
        '0 7 * * *',
        'UTC',
        new Date('2026-03-13T07:00:30.000Z'),
      ),
    ).toBe(true)

    expect(
      isCronDueNow(
        '0 7 * * *',
        'UTC',
        new Date('2026-03-13T07:01:00.000Z'),
      ),
    ).toBe(false)
  })

  it('respects day-of-week and timezone offsets', () => {
    expect(
      isCronDueNow(
        '15 9 * * 1',
        'America/Sao_Paulo',
        new Date('2026-03-16T12:15:00.000Z'),
      ),
    ).toBe(true)

    expect(
      isCronDueNow(
        '15 9 * * 1',
        'America/Sao_Paulo',
        new Date('2026-03-16T12:16:00.000Z'),
      ),
    ).toBe(false)

    expect(
      isCronDueNow(
        '15 9 * * 1',
        'America/Sao_Paulo',
        new Date('2026-03-17T12:15:00.000Z'),
      ),
    ).toBe(false)
  })
})
