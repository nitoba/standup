import { provideHttpClient } from '@angular/common/http'
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing'
import { ApplicationRef } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { provideRouter } from '@angular/router'
import {
  provideTanStackQuery,
  QueryClient,
} from '@tanstack/angular-query-experimental'
import { Subject } from 'rxjs'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { Standup, StandupEvent } from '../../shared/models/standup-models'
import { DashboardPage } from './dashboard-page'
import { StandupEventsService } from './services/standup-events-service'
import { StandupService } from './services/standup-service'

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
  customEntries: null
  status: string
  userId: string
  createdAt: number
  updatedAt: number
}

describe('DashboardPage', () => {
  let httpMock: HttpTestingController
  let appRef: ApplicationRef

  async function renderDashboard() {
    TestBed.resetTestingModule()
    await TestBed.configureTestingModule({
      imports: [DashboardPage],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTanStackQuery(new QueryClient()),
        { provide: StandupEventsService, useValue: stubEventsService },
      ],
    }).compileComponents()

    httpMock = TestBed.inject(HttpTestingController)
    appRef = TestBed.inject(ApplicationRef)

    const fixture = TestBed.createComponent(DashboardPage)
    fixture.detectChanges()

    return fixture
  }
  afterEach(() => {
    httpMock.verify()
    vi.useRealTimers()
  })

  it('renders the dashboard header', async () => {
    const fixture = await renderDashboard()
    TestBed.tick()
    httpMock
      .expectOne('/standups?page=1&pageSize=20&sort=date&sortDir=desc')
      .flush(
        makeListResponse(buildMockStandupDtos(buildDashboardStandups()), {
          total: 142,
          totalPages: 8,
        }),
      )
    await appRef.whenStable()
    fixture.detectChanges()

    const element = fixture.nativeElement as HTMLElement
    expect(element.textContent).toContain('standups')
    expect(element.textContent).toContain(
      'visão geral dos relatórios diários de standup',
    )
  })

  it('shows first-access empty state when there are no standups and no active filters', async () => {
    const fixture = await renderDashboard()
    TestBed.tick()
    httpMock
      .expectOne('/standups?page=1&pageSize=20&sort=date&sortDir=desc')
      .flush(makeListResponse([], { total: 0, totalPages: 0 }))
    await appRef.whenStable()
    await fixture.whenStable()
    fixture.detectChanges()

    expect(fixture.componentInstance.showFirstAccessEmptyState()).toBe(true)
  })

  it('reloads from the server for status and date filters while keeping search client-side', async () => {
    const fixture = await renderDashboard()
    const standupService = TestBed.inject(StandupService)
    const setDashboardFiltersSpy = vi.spyOn(
      standupService,
      'setDashboardFilters',
    )
    const allStandups = buildDashboardStandups()
    const allStandupDtos = buildMockStandupDtos(allStandups)
    const pendingStandups = filterDashboardStandups(allStandups, {
      status: 'pending_review',
    })
    const pendingTodayStandups = filterDashboardStandups(allStandups, {
      status: 'pending_review',
      date: '09/03/2026',
    })

    TestBed.tick()
    httpMock
      .expectOne('/standups?page=1&pageSize=20&sort=date&sortDir=desc')
      .flush(makeListResponse(allStandupDtos, { total: 142, totalPages: 8 }))
    await appRef.whenStable()
    fixture.detectChanges()

    expect(fixture.componentInstance.standupService.standups.error()).toBeNull()

    fixture.componentInstance.onStatusChange('pending_review')
    fixture.detectChanges()

    expect(setDashboardFiltersSpy).toHaveBeenCalledWith({
      status: 'pending_review',
      date: undefined,
      search: '',
    })

    TestBed.tick()
    httpMock
      .expectOne(
        '/standups?page=1&pageSize=20&sort=date&sortDir=desc&status=pending_review',
      )
      .flush(
        makeListResponse(buildMockStandupDtos(pendingStandups), {
          total: pendingStandups.length,
          totalPages: 1,
        }),
      )
    await appRef.whenStable()
    fixture.detectChanges()

    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date('2026-03-09T12:00:00Z'))

    fixture.componentInstance.onDateChange('today')
    fixture.detectChanges()

    expect(setDashboardFiltersSpy).toHaveBeenLastCalledWith({
      status: 'pending_review',
      date: '09/03/2026',
      search: '',
    })

    TestBed.tick()
    const filteredRequest = httpMock.expectOne(
      '/standups?page=1&pageSize=20&sort=date&sortDir=desc&status=pending_review&date=09/03/2026',
    )
    filteredRequest.flush(
      makeListResponse(buildMockStandupDtos(pendingTodayStandups), {
        total: pendingTodayStandups.length,
        totalPages: 1,
      }),
    )
    await appRef.whenStable()
    fixture.detectChanges()
    vi.useRealTimers()

    fixture.componentInstance.onSearchChange('no-match')
    fixture.detectChanges()

    expect(fixture.componentInstance.searchFilter()).toBe('no-match')
    expect(setDashboardFiltersSpy).toHaveBeenCalledTimes(3)
    TestBed.tick()
    httpMock
      .expectOne(
        '/standups?page=1&pageSize=20&sort=date&sortDir=desc&status=pending_review&date=09/03/2026&search=no-match',
      )
      .flush(
        makeListResponse([], {
          total: 0,
          totalPages: 0,
        }),
      )
    await appRef.whenStable()
    fixture.detectChanges()

    fixture.componentInstance.onStatusChange('all')
    fixture.componentInstance.onDateChange('all_time')
    fixture.detectChanges()

    expect(setDashboardFiltersSpy).toHaveBeenNthCalledWith(3, {
      status: 'pending_review',
      date: '09/03/2026',
      search: 'no-match',
    })
    expect(setDashboardFiltersSpy).toHaveBeenNthCalledWith(4, {
      status: undefined,
      date: '09/03/2026',
      search: 'no-match',
    })
    expect(setDashboardFiltersSpy).toHaveBeenNthCalledWith(5, {
      status: undefined,
      date: undefined,
      search: 'no-match',
    })

    TestBed.tick()
    httpMock
      .expectOne(
        '/standups?page=1&pageSize=20&sort=date&sortDir=desc&search=no-match',
      )
      .flush(
        makeListResponse([], {
          total: 0,
          totalPages: 0,
        }),
      )
    await appRef.whenStable()
    fixture.detectChanges()

    fixture.componentInstance.onSearchChange('')
    fixture.detectChanges()

    TestBed.tick()
    httpMock
      .expectOne('/standups?page=1&pageSize=20&sort=date&sortDir=desc')
      .flush(makeListResponse(allStandupDtos, { total: 142, totalPages: 8 }))
    await appRef.whenStable()
    fixture.detectChanges()
  })
})

function buildDashboardStandups(): Standup[] {
  return [
    {
      id: '7f3a2b1c',
      date: '09/03/2026',
      status: 'pending_review',
      createdAt: '17:32',
      contentPreview:
        'implementada lógica de retry com backoff exponencial no pipeline de geração de standup...',
      sections: [],
      sources: [],
    },
    {
      id: 'standup-2026-03-08',
      date: '08/03/2026',
      status: 'pending_review',
      createdAt: '17:31',
      contentPreview:
        'adicionados comandos slash no Discord para disparar, listar e aprovar standups...',
      sections: [],
      sources: [],
    },
    {
      id: 'standup-2026-03-07',
      date: '07/03/2026',
      status: 'approved',
      createdAt: '17:30',
      contentPreview:
        'refatorados os handlers de rotas HTTP em arquivos modulares separados para melhor manutenção...',
      sections: [],
      sources: [],
    },
    {
      id: 'standup-2026-03-06',
      date: '06/03/2026',
      status: 'rejected',
      createdAt: '17:29',
      contentPreview:
        'adicionado endpoint de disparo manual com validação de autenticação interna...',
      sections: [],
      sources: [],
    },
    {
      id: 'standup-2026-03-05',
      date: '05/03/2026',
      status: 'approved',
      createdAt: '17:28',
      contentPreview:
        'ajustada a lógica de recuperação do scheduler para evitar execuções duplicadas...',
      sections: [],
      sources: [],
    },
  ]
}

function filterDashboardStandups(
  standups: readonly Standup[],
  filters: {
    status?: string
    date?: string
    search?: string
  },
) {
  return standups.filter((standup) => {
    const matchesStatus = filters.status
      ? standup.status === filters.status
      : true
    const matchesDate = filters.date ? standup.date === filters.date : true
    const normalizedSearch = filters.search?.trim().toLowerCase()
    const matchesSearch = normalizedSearch
      ? [standup.id, standup.date, standup.contentPreview]
          .join(' ')
          .toLowerCase()
          .includes(normalizedSearch)
      : true

    return matchesStatus && matchesDate && matchesSearch
  })
}

function buildMockStandupDtos(standups: Standup[]) {
  return standups.map((standup, index) => toStandupDto(standup, index))
}

function makeListResponse(
  standups: StandupDto[],
  overrides?: Partial<{
    total: number
    totalPages: number
    page: number
    pageSize: number
  }>,
) {
  return {
    data: standups,
    pagination: {
      page: overrides?.page ?? 1,
      pageSize: overrides?.pageSize ?? 20,
      total: overrides?.total ?? standups.length,
      totalPages: overrides?.totalPages ?? (standups.length === 0 ? 0 : 1),
    },
    summary: {
      total: overrides?.total ?? standups.length,
      approved: standups.filter((item) => item.status === 'approved').length,
      pending: standups.filter((item) => item.status === 'pending_review')
        .length,
      rejected: standups.filter((item) => item.status === 'rejected').length,
    },
    metricChanges: {
      total: { current: standups.length, previous: 0, delta: standups.length },
      approved: {
        current: standups.filter((item) => item.status === 'approved').length,
        previous: 0,
        delta: standups.filter((item) => item.status === 'approved').length,
      },
      pending: {
        current: standups.filter((item) => item.status === 'pending_review')
          .length,
        previous: 0,
        delta: standups.filter((item) => item.status === 'pending_review')
          .length,
      },
      rejected: {
        current: standups.filter((item) => item.status === 'rejected').length,
        previous: 0,
        delta: standups.filter((item) => item.status === 'rejected').length,
      },
    },
  }
}

function toStandupDto(standup: Standup, index: number): StandupDto {
  return {
    id: standup.id,
    date: standup.date,
    meetingType: 'daily',
    content: `## o que foi feito\n- ${standup.contentPreview}`,
    sourceData: JSON.stringify({
      repos: [
        {
          repoName: 'standup-web',
          commits: [{ hash: `hash-${index}`, subject: standup.contentPreview }],
        },
      ],
    }),
    customEntries: null,
    status: standup.status,
    userId: 'user-1',
    createdAt: Date.UTC(2026, 2, 9, 17, index, 0),
    updatedAt: Date.UTC(2026, 2, 9, 17, index, 30),
  }
}
