import { describe, expect, it } from 'vitest'

import type {
  DashboardMetrics,
  Standup,
  StandupSection,
  StandupSourceRepo,
} from './standup'

describe('standup types', () => {
  it('supports a basic standup shape', () => {
    const sections: StandupSection[] = [
      { title: '## o que foi feito', tone: 'default', items: ['- item'] },
    ]
    const sources: StandupSourceRepo[] = [
      {
        name: 'repo/',
        commits: [{ hash: 'abc123', message: 'feat: test' }],
      },
    ]

    const standup: Standup = {
      id: 'id-1',
      date: '2026-03-09',
      status: 'approved',
      createdAt: '17:32',
      contentPreview: 'preview',
      sections,
      sources,
    }

    const metrics: DashboardMetrics = {
      total: { count: 1, change: '++ 1' },
      approved: { count: 1, change: '++ 1' },
      pending: { count: 0, change: '0' },
      rejected: { count: 0, change: '0' },
    }

    expect(standup.id).toBe('id-1')
    expect(metrics.total.count).toBe(1)
  })
})
