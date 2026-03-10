import { provideHttpClient } from '@angular/common/http'
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing'
import { ApplicationRef } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { StandupService } from './standup.service'

type StandupDto = {
  id: string
  date: string
  meetingType: string
  content: string
  sourceData: string
  customEntries: {
    scheduledMeetings: string[]
    directCalls: string[]
  } | null
  status: string
  userId: string | null
  createdAt: number
  updatedAt: number
}

describe('StandupService', () => {
  let service: StandupService
  let httpMock: HttpTestingController
  let appRef: ApplicationRef

  beforeEach(async () => {
    TestBed.resetTestingModule()
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    })

    service = TestBed.inject(StandupService)
    httpMock = TestBed.inject(HttpTestingController)
    appRef = TestBed.inject(ApplicationRef)

    // httpResource fires initial request on creation
    TestBed.tick()
    httpMock.expectOne('/standups').flush({ data: [] })
    await appRef.whenStable()
  })

  afterEach(() => {
    httpMock.verify()
  })

  it('loads dashboard standups from the API data envelope', async () => {
    // Trigger a reload to test with actual data
    service.standups.reload()
    TestBed.tick()

    const request = httpMock.expectOne('/standups')
    expect(request.request.method).toBe('GET')
    request.flush({
      data: [
        makeStandupDto({
          id: '7f3a2b1c',
          status: 'pending_review',
          content:
            '## o que foi feito\n- implemented retry logic\n\n## em andamento\n- validating worker contracts',
          sourceData: JSON.stringify({
            repos: [
              {
                repoName: 'standup-service',
                commits: [
                  {
                    hash: 'abc1234',
                    subject: 'feat: implement retry logic',
                  },
                ],
              },
            ],
          }),
        }),
      ],
    })

    await appRef.whenStable()

    expect(service.standups.value()).toEqual([
      expect.objectContaining({
        id: '7f3a2b1c',
        status: 'pending_review',
        contentPreview: 'implemented retry logic',
        sections: [
          {
            title: '## o que foi feito',
            tone: 'default',
            items: ['- implemented retry logic'],
          },
          {
            title: '## em andamento',
            tone: 'cyan',
            items: ['- validating worker contracts'],
          },
        ],
        sources: [
          {
            name: 'standup-service/',
            commits: [
              {
                hash: 'abc1234',
                message: 'feat: implement retry logic',
              },
            ],
          },
        ],
      }),
    ])
  })

  it('re-fetches dashboard standups with status and date filters', async () => {
    service.setDashboardFilters({
      status: 'approved',
      date: '2026-03-09',
    })
    TestBed.tick()

    const request = httpMock.expectOne(
      (req) =>
        req.url === '/standups' &&
        req.params.get('status') === 'approved' &&
        req.params.get('date') === '2026-03-09',
    )
    expect(request.request.method).toBe('GET')
    request.flush({
      data: [makeStandupDto({ id: 'standup-2', status: 'approved' })],
    })

    await appRef.whenStable()

    expect(service.standups.value()).toEqual([
      expect.objectContaining({ id: 'standup-2', status: 'approved' }),
    ])
  })

  it('loads standup detail when selectStandup is called', async () => {
    service.selectStandup('7f3a2b1c')
    TestBed.tick()

    const request = httpMock.expectOne('/standups/7f3a2b1c')
    expect(request.request.method).toBe('GET')
    request.flush({ data: makeStandupDto({ id: '7f3a2b1c' }) })

    await appRef.whenStable()

    expect(service.selectedStandup.value()).toEqual(
      expect.objectContaining({ id: '7f3a2b1c' }),
    )
  })

  it('approves via the dedicated endpoint and reloads dashboard data', async () => {
    const approvePromise = service.approve('7f3a2b1c')

    const approveRequest = httpMock.expectOne('/standups/7f3a2b1c/approve')
    expect(approveRequest.request.method).toBe('POST')
    expect(approveRequest.request.body).toEqual({})
    approveRequest.flush({
      data: makeStandupDto({ id: '7f3a2b1c', status: 'published' }),
    })

    await expect(approvePromise).resolves.toEqual(
      expect.objectContaining({ id: '7f3a2b1c', status: 'approved' }),
    )

    // approve calls standups.reload() which fires a new GET
    TestBed.tick()
    httpMock.expectOne('/standups').flush({
      data: [makeStandupDto({ id: '7f3a2b1c', status: 'published' })],
    })
    await appRef.whenStable()
  })

  it('rejects through the status endpoint and reloads dashboard data', async () => {
    const rejectPromise = service.reject('7f3a2b1c')

    const rejectRequest = httpMock.expectOne('/standups/7f3a2b1c/status')
    expect(rejectRequest.request.method).toBe('PATCH')
    expect(rejectRequest.request.body).toEqual({ status: 'rejected' })
    rejectRequest.flush({
      data: makeStandupDto({ id: '7f3a2b1c', status: 'rejected' }),
    })

    await expect(rejectPromise).resolves.toEqual(
      expect.objectContaining({ id: '7f3a2b1c', status: 'rejected' }),
    )

    // reject calls standups.reload()
    TestBed.tick()
    httpMock.expectOne('/standups').flush({
      data: [makeStandupDto({ id: '7f3a2b1c', status: 'rejected' })],
    })
    await appRef.whenStable()
  })

  it('returns the accepted acknowledgement when requesting an adjustment', async () => {
    const adjustPromise = service.adjust(
      '7f3a2b1c',
      'Remove the blocker section and add the deployment fix',
    )

    const request = httpMock.expectOne('/standups/trigger')
    expect(request.request.method).toBe('POST')
    expect(request.request.body).toEqual({
      forceRegenerate: true,
      rewriteFromStandupId: '7f3a2b1c',
      rewriteInstruction:
        'Remove the blocker section and add the deployment fix',
      replaceStandupId: '7f3a2b1c',
    })
    request.flush(
      { ok: true, accepted: true },
      { status: 202, statusText: 'Accepted' },
    )

    await expect(adjustPromise).resolves.toEqual({ ok: true, accepted: true })
  })

  it('returns the accepted acknowledgement when forcing regeneration', async () => {
    const regeneratePromise = service.regenerate('7f3a2b1c')

    const request = httpMock.expectOne('/standups/trigger')
    expect(request.request.method).toBe('POST')
    expect(request.request.body).toEqual({
      forceRegenerate: true,
      replaceStandupId: '7f3a2b1c',
    })
    request.flush(
      { ok: true, accepted: true },
      { status: 202, statusText: 'Accepted' },
    )

    await expect(regeneratePromise).resolves.toEqual({
      ok: true,
      accepted: true,
    })
  })
})

function makeStandupDto(overrides: Partial<StandupDto> = {}): StandupDto {
  return {
    id: 'standup-1',
    date: '2026-03-09',
    meetingType: 'daily',
    content: '## o que foi feito\n- shipped the dashboard filters',
    sourceData: JSON.stringify({
      repos: [
        {
          repoName: 'standup-web',
          commits: [
            { hash: 'abc1234', subject: 'feat: ship dashboard filters' },
          ],
        },
      ],
    }),
    customEntries: null,
    status: 'approved',
    userId: 'user-1',
    createdAt: Date.UTC(2026, 2, 9, 17, 32, 0),
    updatedAt: Date.UTC(2026, 2, 9, 17, 40, 0),
    ...overrides,
  }
}
