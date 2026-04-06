import { provideHttpClient } from '@angular/common/http'
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing'
import { TestBed } from '@angular/core/testing'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { WeeklyDigestService } from './weekly-digest-service'

describe('WeeklyDigestService', () => {
  let service: WeeklyDigestService
  let httpMock: HttpTestingController

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    })

    service = TestBed.inject(WeeklyDigestService)
    httpMock = TestBed.inject(HttpTestingController)
  })

  afterEach(() => {
    httpMock.verify()
  })

  it('preserves approved and published when mapping weekly standups', async () => {
    const promise = service.listApprovedStandups({
      from: '2026-03-03',
      to: '2026-03-09',
    })

    const request = httpMock.expectOne(
      (req) =>
        req.url === '/standups' &&
        req.params.get('status') === 'approved' &&
        req.params.get('pageSize') === '100' &&
        req.params.get('from') === '2026-03-03' &&
        req.params.get('to') === '2026-03-09',
    )

    expect(request.request.method).toBe('GET')
    request.flush({
      data: [
        makeStandupDto({ id: 'approved-1', status: 'approved' }),
        makeStandupDto({ id: 'approved-2', status: 'approved' }),
      ],
      pagination: { page: 1, pageSize: 100, total: 2, totalPages: 1 },
      summary: { total: 2, approved: 2, pending: 0, rejected: 0 },
      metricChanges: {
        total: { current: 2, previous: 0, delta: 2 },
        approved: { current: 2, previous: 0, delta: 2 },
        pending: { current: 0, previous: 0, delta: 0 },
        rejected: { current: 0, previous: 0, delta: 0 },
      },
    })

    await expect(promise).resolves.toEqual([
      expect.objectContaining({ id: 'approved-1', status: 'approved' }),
      expect.objectContaining({ id: 'approved-2', status: 'approved' }),
    ])
  })
})

function makeStandupDto(
  overrides: Partial<{
    id: string
    date: string
    meetingType: string
    content: string
    sourceData: string
    customEntries: null
    status:
      | 'draft'
      | 'delivery_pending'
      | 'pending_review'
      | 'approved'
      | 'rejected'
    userId: string
    createdAt: number
    updatedAt: number
  }> = {},
) {
  return {
    id: 'standup-1',
    date: '2026-03-09',
    meetingType: 'daily',
    content: 'standup semanal',
    sourceData: '{"repos":[]}',
    customEntries: null,
    status: 'approved' as const,
    userId: 'user-1',
    createdAt: Date.UTC(2026, 2, 9, 17, 32, 0),
    updatedAt: Date.UTC(2026, 2, 9, 17, 40, 0),
    ...overrides,
  }
}
