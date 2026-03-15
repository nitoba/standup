import { describe, expect, it } from 'vitest'

import {
  buildMockStandups,
  filterStandups,
  updateStandupStatus,
} from './mock-data'

describe('mock-data', () => {
  it('builds the expected total number of standups', () => {
    expect(buildMockStandups()).toHaveLength(142)
  })

  it('filters standups by status, date, and search', () => {
    const standups = buildMockStandups()
    const filtered = filterStandups(standups, {
      status: 'pending_review',
      date: '09/03/2026',
      search: 'retry logic',
    })

    expect(filtered).toHaveLength(1)
    expect(filtered[0]?.id).toBe('7f3a2b1c')
  })

  it('returns an updated standup snapshot without mutating the source array', () => {
    const standups = buildMockStandups()
    const updated = updateStandupStatus(standups, '7f3a2b1c', 'approved')

    expect(updated?.status).toBe('approved')
    expect(standups.find((item) => item.id === '7f3a2b1c')?.status).toBe(
      'pending_review',
    )
  })
})
