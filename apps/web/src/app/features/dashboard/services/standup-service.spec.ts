import { provideHttpClient } from '@angular/common/http'
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing'
import { ApplicationRef } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import {
  provideTanStackQuery,
  QueryClient,
} from '@tanstack/angular-query-experimental'
import { Subject } from 'rxjs'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { StandupEvent } from '../../../shared/models/standup-models'
import { StandupEventsService } from './standup-events-service'
import { StandupService } from './standup-service'

/** Stub que não abre EventSource real — evita ReferenceError em JSDOM */
const stubEventsService = {
  standupEvents$: new Subject<StandupEvent>(),
  connect: () => {},
  disconnect: () => {},
  ngOnDestroy: () => {},
}

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

function makeListResponse(
  data: StandupDto[],
  overrides?: Partial<{
    page: number
    pageSize: number
    total: number
    totalPages: number
    summary: {
      total: number
      approved: number
      pending: number
      rejected: number
    }
    metricChanges: {
      total: { current: number; previous: number; delta: number }
      approved: { current: number; previous: number; delta: number }
      pending: { current: number; previous: number; delta: number }
      rejected: { current: number; previous: number; delta: number }
    }
  }>,
) {
  return {
    data,
    pagination: {
      page: overrides?.page ?? 1,
      pageSize: overrides?.pageSize ?? 20,
      total: overrides?.total ?? data.length,
      totalPages: overrides?.totalPages ?? (data.length === 0 ? 0 : 1),
    },
    summary: overrides?.summary ?? {
      total: data.length,
      approved: data.filter((item) => item.status === 'approved').length,
      pending: data.filter((item) => item.status === 'pending_review').length,
      rejected: data.filter((item) => item.status === 'rejected').length,
    },
    metricChanges: overrides?.metricChanges ?? {
      total: { current: data.length, previous: 0, delta: data.length },
      approved: {
        current: data.filter((item) => item.status === 'approved').length,
        previous: 0,
        delta: data.filter((item) => item.status === 'approved').length,
      },
      pending: {
        current: data.filter((item) => item.status === 'pending_review').length,
        previous: 0,
        delta: data.filter((item) => item.status === 'pending_review').length,
      },
      rejected: {
        current: data.filter((item) => item.status === 'rejected').length,
        previous: 0,
        delta: data.filter((item) => item.status === 'rejected').length,
      },
    },
  }
}

describe('StandupService', () => {
  let service: StandupService
  let httpMock: HttpTestingController
  let appRef: ApplicationRef

  async function settleAsyncWork() {
    await Promise.resolve()
    await Promise.resolve()
    TestBed.tick()
    await appRef.whenStable()
  }

  async function advanceUntilRequestStarts() {
    await Promise.resolve()
    await Promise.resolve()
    TestBed.tick()
  }

  beforeEach(async () => {
    TestBed.resetTestingModule()
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTanStackQuery(new QueryClient()),
        { provide: StandupEventsService, useValue: stubEventsService },
      ],
    })

    service = TestBed.inject(StandupService)
    httpMock = TestBed.inject(HttpTestingController)
    appRef = TestBed.inject(ApplicationRef)

    // httpResource fires initial request on creation
    TestBed.tick()
    httpMock
      .expectOne('/standups?page=1&pageSize=20&sort=date&sortDir=desc')
      .flush(makeListResponse([]))
    await settleAsyncWork()
  })

  afterEach(() => {
    httpMock.verify()
  })

  it('loads dashboard standups from the API data envelope', async () => {
    // Trigger a reload to test with actual data
    service.standups.reload()
    TestBed.tick()

    const request = httpMock.expectOne(
      '/standups?page=1&pageSize=20&sort=date&sortDir=desc',
    )
    expect(request.request.method).toBe('GET')
    request.flush(
      makeListResponse([
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
      ]),
    )

    await settleAsyncWork()

    expect(service.standups.value().items).toEqual([
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

  it('preserves draft status when mapping API data', async () => {
    service.standups.reload()
    TestBed.tick()

    const request = httpMock.expectOne(
      '/standups?page=1&pageSize=20&sort=date&sortDir=desc',
    )
    request.flush(makeListResponse([makeStandupDto({ status: 'draft' })]))

    await settleAsyncWork()

    expect(service.standups.value().items).toEqual([
      expect.objectContaining({ status: 'draft' }),
    ])
  })

  it('re-fetches dashboard standups with status and date filters', async () => {
    service.setDashboardFilters({
      status: 'approved',
      date: '09/03/2026',
    })
    TestBed.tick()

    const request = httpMock.expectOne(
      (req) =>
        req.url === '/standups' &&
        req.params.get('sort') === 'date' &&
        req.params.get('sortDir') === 'desc' &&
        req.params.get('status') === 'approved' &&
        req.params.get('date') === '09/03/2026',
    )
    expect(request.request.method).toBe('GET')
    request.flush(
      makeListResponse([
        makeStandupDto({ id: 'standup-2', status: 'approved' }),
      ]),
    )

    await settleAsyncWork()

    expect(service.standups.value().items).toEqual([
      expect.objectContaining({ id: 'standup-2', status: 'approved' }),
    ])
  })

  it('updates metrics and pagination from paginated response', async () => {
    service.standups.reload()
    TestBed.tick()

    const request = httpMock.expectOne(
      '/standups?page=1&pageSize=20&sort=date&sortDir=desc',
    )
    request.flush(
      makeListResponse(
        [makeStandupDto({ id: 'standup-2', status: 'approved' })],
        {
          total: 42,
          totalPages: 3,
          summary: { total: 42, approved: 20, pending: 18, rejected: 4 },
          metricChanges: {
            total: { current: 12, previous: 9, delta: 3 },
            approved: { current: 8, previous: 7, delta: 1 },
            pending: { current: 3, previous: 1, delta: 2 },
            rejected: { current: 1, previous: 2, delta: -1 },
          },
        },
      ),
    )

    await settleAsyncWork()

    expect(service.pagination()).toEqual({
      page: 1,
      pageSize: 20,
      total: 42,
      totalPages: 3,
    })
    expect(service.metrics()).toEqual({
      total: { count: 12, change: '++ 3 esta_semana' },
      approved: { count: 8, change: '++ 1 esta_semana' },
      pending: { count: 3, change: '++ 2 esta_semana' },
      rejected: { count: 1, change: '-- 1 vs_semana_passada' },
    })
  })

  it('changes page size and resets to first page', async () => {
    service.setDashboardPage(3)
    service.setDashboardPageSize(50)
    TestBed.tick()

    const request = httpMock.expectOne(
      '/standups?page=1&pageSize=50&sort=date&sortDir=desc',
    )
    request.flush(
      makeListResponse([], { pageSize: 50, total: 0, totalPages: 0 }),
    )

    await settleAsyncWork()

    expect(service.pagination()).toEqual({
      page: 1,
      pageSize: 50,
      total: 0,
      totalPages: 0,
    })
  })

  it('passes search to the paginated list request', async () => {
    service.setDashboardFilters({ search: 'retry' })
    TestBed.tick()

    const request = httpMock.expectOne(
      '/standups?page=1&pageSize=20&sort=date&sortDir=desc&search=retry',
    )
    request.flush(makeListResponse([]))

    await settleAsyncWork()
  })

  it('loads standup detail when selectStandup is called', async () => {
    service.selectStandup('7f3a2b1c')
    TestBed.tick()

    const request = httpMock.expectOne('/standups/7f3a2b1c')
    expect(request.request.method).toBe('GET')
    request.flush({ data: makeStandupDto({ id: '7f3a2b1c' }) })

    await settleAsyncWork()

    expect(service.selectedStandup.value()).toEqual(
      expect.objectContaining({ id: '7f3a2b1c' }),
    )
  })

  it('approves via the dedicated endpoint and reloads dashboard data', async () => {
    const approvePromise = service.approve('7f3a2b1c', {
      scheduledMeetings: ['Planning Backend'],
      directCalls: ['Call com Joao'],
    })

    await advanceUntilRequestStarts()
    const approveRequest = httpMock.expectOne('/standups/7f3a2b1c/approve')
    expect(approveRequest.request.method).toBe('POST')
    expect(approveRequest.request.body).toEqual({
      customEntries: {
        scheduledMeetings: ['Planning Backend'],
        directCalls: ['Call com Joao'],
      },
    })
    approveRequest.flush({
      data: makeStandupDto({ id: '7f3a2b1c', status: 'approved' }),
    })

    await expect(approvePromise).resolves.toEqual(
      expect.objectContaining({
        standup: expect.objectContaining({
          id: '7f3a2b1c',
          status: 'approved',
        }),
      }),
    )

    // approve calls standups.reload() which fires a new GET
    TestBed.tick()
    httpMock
      .expectOne('/standups?page=1&pageSize=20&sort=date&sortDir=desc')
      .flush(
        makeListResponse([
          makeStandupDto({ id: '7f3a2b1c', status: 'approved' }),
        ]),
      )
    await settleAsyncWork()
  })

  it('rejects through the status endpoint and reloads dashboard data', async () => {
    const rejectPromise = service.reject('7f3a2b1c')

    await advanceUntilRequestStarts()
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
    httpMock
      .expectOne('/standups?page=1&pageSize=20&sort=date&sortDir=desc')
      .flush(
        makeListResponse([
          makeStandupDto({ id: '7f3a2b1c', status: 'rejected' }),
        ]),
      )
    await settleAsyncWork()
  })

  it('returns the accepted acknowledgement when requesting an adjustment', async () => {
    const adjustPromise = service.adjust(
      '7f3a2b1c',
      'Remove the blocker section and add the deployment fix',
    )

    await advanceUntilRequestStarts()
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
    TestBed.tick()
    httpMock
      .expectOne('/standups?page=1&pageSize=20&sort=date&sortDir=desc')
      .flush(makeListResponse([]))
    await settleAsyncWork()
  })

  it('returns the accepted acknowledgement when forcing regeneration', async () => {
    const regeneratePromise = service.regenerate('7f3a2b1c')

    await advanceUntilRequestStarts()
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
    TestBed.tick()
    httpMock
      .expectOne('/standups?page=1&pageSize=20&sort=date&sortDir=desc')
      .flush(makeListResponse([]))
    await settleAsyncWork()
  })

  it('tracks coarse-grained progress events and reloads when generation completes', async () => {
    stubEventsService.standupEvents$.next({
      type: 'standup_progress',
      runId: 'run-1',
      date: '09/03/2026',
      mode: 'generate',
      step: 'collecting_git',
      message: 'Coletando commits dos repositorios',
    })

    expect(service.activeProgress()).toEqual(
      expect.objectContaining({
        runId: 'run-1',
        step: 'collecting_git',
      }),
    )

    stubEventsService.standupEvents$.next({
      type: 'standup_generated',
      runId: 'run-1',
      standupId: '7f3a2b1c',
      date: '09/03/2026',
      mode: 'generate',
    })

    TestBed.tick()
    httpMock
      .expectOne('/standups?page=1&pageSize=20&sort=date&sortDir=desc')
      .flush(makeListResponse([makeStandupDto({ id: '7f3a2b1c' })]))
    await settleAsyncWork()

    expect(service.activeProgress()).toBeUndefined()
  })

  it('clears progress when the worker reports failure', () => {
    stubEventsService.standupEvents$.next({
      type: 'standup_progress',
      runId: 'run-2',
      date: '09/03/2026',
      mode: 'generate',
      step: 'generating_standup',
      message: 'Gerando texto do standup',
    })

    stubEventsService.standupEvents$.next({
      type: 'standup_failed',
      runId: 'run-2',
      date: '09/03/2026',
      mode: 'generate',
      message: 'LLM indisponivel',
    })

    expect(service.activeProgress()).toBeUndefined()
  })
})

function makeStandupDto(overrides: Partial<StandupDto> = {}): StandupDto {
  return {
    id: 'standup-1',
    date: '09/03/2026',
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
