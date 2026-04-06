import { describe, expect, it } from 'vitest'

import type {
  ApproveStandupResponseDto,
  CancelTodayReminderAckDto,
  DashboardMetrics,
  ReminderAcceptedDto,
  SessionDto,
  SettingsDto,
  Standup,
  StandupDto,
  StandupListResponseDto,
  StandupSection,
  StandupSourceRepo,
  StandupStatus,
  UpdateSettingsResponseDto,
} from './standup-models'

describe('standup types', () => {
  it('aligns standup transport and view types with backend contracts', () => {
    const sections: StandupSection[] = [
      { title: '## o que foi feito', tone: 'default', items: ['- item'] },
    ]
    const sources: StandupSourceRepo[] = [
      {
        name: 'repo/',
        commits: [{ hash: 'abc123', message: 'feat: test' }],
      },
    ]

    const dto: StandupDto = {
      id: 'id-1',
      date: '09/03/2026',
      meetingType: 'daily',
      content: '## o que foi feito\n- item',
      sourceData: '{"repos":[]}',
      customEntries: null,
      status: 'approved',
      userId: 'user-1',
      createdAt: 1_741_542_400_000,
      updatedAt: 1_741_542_700_000,
    }

    const standup: Standup = {
      ...dto,
      createdAt: '09/03/2026 17:32',
      updatedAt: '09/03/2026 17:40',
      contentPreview: '## o que foi feito - item',
      sections,
      sources,
    }

    const listResponse: StandupListResponseDto = {
      data: [dto],
      pagination: {
        page: 1,
        pageSize: 20,
        total: 1,
        totalPages: 1,
      },
      summary: {
        total: 1,
        approved: 1,
        pending: 0,
        rejected: 0,
      },
      metricChanges: {
        total: { current: 1, previous: 0, delta: 1 },
        approved: { current: 1, previous: 0, delta: 1 },
        pending: { current: 0, previous: 0, delta: 0 },
        rejected: { current: 0, previous: 0, delta: 0 },
      },
    }

    const approveResponse: ApproveStandupResponseDto = {
      data: dto,
      warning: 'Channel not found',
    }

    const settings: SettingsDto = {
      standupCron: '30 17 * * 1-5',
      reminderCron: '20 17 * * 1-5',
      recoveryCron: '0 18 * * 1-5',
      timezone: 'America/Sao_Paulo',
      gitAuthor: 'dev@example.com',
      gitSincePeriod: '8 hours ago',
      selectedRepos: ['repo-a'],
      active: true,
      snoozedUntil: null,
      cancelledDate: null,
    }

    const session: SessionDto = {
      session: {
        id: 'session-1',
        userId: 'user-1',
        expiresAt: '2026-03-16T17:32:00.000Z',
      },
      user: {
        id: 'user-1',
        email: 'dev@example.com',
        name: 'Dev',
      },
    }

    const accepted: ReminderAcceptedDto = { ok: true, accepted: true }
    const cancelled: CancelTodayReminderAckDto = {
      ok: true,
      cancelledDate: '09/03/2026',
    }
    const settingsResponse: UpdateSettingsResponseDto = { data: settings }
    const statuses: StandupStatus[] = [
      'draft',
      'delivery_pending',
      'pending_review',
      'approved',
      'rejected',
    ]

    const metrics: DashboardMetrics = {
      total: { count: 1, change: '++ 1' },
      approved: { count: 1, change: '++ 1' },
      pending: { count: 0, change: '0' },
      rejected: { count: 0, change: '0' },
    }

    expect(listResponse.data[0]?.status).toBe('approved')
    expect(listResponse.pagination.totalPages).toBe(1)
    expect(listResponse.metricChanges.total.delta).toBe(1)
    expect(standup.updatedAt).toContain('17:40')
    expect(approveResponse.warning).toBe('Channel not found')
    expect(settingsResponse.data.selectedRepos).toEqual(['repo-a'])
    expect(session.user.email).toBe('dev@example.com')
    expect(accepted.accepted).toBe(true)
    expect(cancelled.cancelledDate).toBe('09/03/2026')
    expect(statuses).toContain('draft')
    expect(statuses).toContain('delivery_pending')
    expect(metrics.total.count).toBe(1)
  })
})
