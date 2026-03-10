import { provideHttpClient } from '@angular/common/http'
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing'
import { ApplicationRef } from '@angular/core'
import type { ComponentFixture } from '@angular/core/testing'
import { TestBed } from '@angular/core/testing'
import { By } from '@angular/platform-browser'
import { provideRouter } from '@angular/router'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { buildMockStandups, filterStandups } from '../../data/mock-data'
import { StandupService } from '../../services/standup.service'
import { DashboardPage } from './dashboard-page'
import { FilterBar } from './filter-bar'

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
      ],
    }).compileComponents()

    httpMock = TestBed.inject(HttpTestingController)
    appRef = TestBed.inject(ApplicationRef)

    const fixture = TestBed.createComponent(DashboardPage)
    fixture.detectChanges()

    return fixture
  }

  function getFilterBar(fixture: ComponentFixture<DashboardPage>) {
    return fixture.debugElement.query(By.directive(FilterBar))
  }

  afterEach(() => {
    httpMock.verify()
    vi.useRealTimers()
  })

  it('renders the dashboard header', async () => {
    const fixture = await renderDashboard()
    TestBed.tick()
    httpMock.expectOne('/standups').flush({
      data: buildMockStandupDtos(buildMockStandups()),
    })
    await appRef.whenStable()
    fixture.detectChanges()

    const element = fixture.nativeElement as HTMLElement
    expect(element.textContent).toContain('standups')
    expect(element.textContent).toContain('daily standup reports overview')
  })

  it('reloads from the server for status and date filters while keeping search client-side', async () => {
    const fixture = await renderDashboard()
    const standupService = TestBed.inject(StandupService)
    const setDashboardFiltersSpy = vi.spyOn(
      standupService,
      'setDashboardFilters',
    )
    const allStandups = buildMockStandups()
    const allStandupDtos = buildMockStandupDtos(allStandups)
    const pendingStandups = filterStandups(allStandups, {
      status: 'pending_review',
    })
    const pendingTodayStandups = filterStandups(allStandups, {
      status: 'pending_review',
      date: '2026-03-09',
    })

    TestBed.tick()
    httpMock.expectOne('/standups').flush({ data: allStandupDtos })
    await appRef.whenStable()
    fixture.detectChanges()

    expect(fixture.componentInstance.standupService.standups.isLoading()).toBe(
      false,
    )
    expect(
      fixture.componentInstance.standupService.standups.error(),
    ).toBeUndefined()

    const filterBar = getFilterBar(fixture)
    expect(filterBar).not.toBeNull()

    ;(filterBar.componentInstance as FilterBar).onStatusSelected(
      'pending_review',
    )
    fixture.detectChanges()

    expect(setDashboardFiltersSpy).toHaveBeenCalledWith({
      status: 'pending_review',
      date: undefined,
    })

    TestBed.tick()
    httpMock
      .expectOne('/standups?status=pending_review')
      .flush({ data: buildMockStandupDtos(pendingStandups) })
    await appRef.whenStable()
    fixture.detectChanges()

    const refreshedFilterBar = getFilterBar(fixture)
    expect(refreshedFilterBar).not.toBeNull()

    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date('2026-03-09T12:00:00Z'))

    ;(refreshedFilterBar.componentInstance as FilterBar).onDateSelected('today')
    fixture.detectChanges()

    expect(setDashboardFiltersSpy).toHaveBeenLastCalledWith({
      status: 'pending_review',
      date: '2026-03-09',
    })

    TestBed.tick()
    const filteredRequest = httpMock.expectOne(
      '/standups?status=pending_review&date=2026-03-09',
    )
    filteredRequest.flush({ data: buildMockStandupDtos(pendingTodayStandups) })
    await appRef.whenStable()
    fixture.detectChanges()
    vi.useRealTimers()

    const element = fixture.nativeElement as HTMLElement
    expect(element.textContent).toContain('// showing 1-1 of 1 standups')

    const finalFilterBar = getFilterBar(fixture)
    expect(finalFilterBar).not.toBeNull()

    const searchInput = finalFilterBar.nativeElement.querySelector(
      'input[aria-label="Search standups"]',
    ) as HTMLInputElement
    searchInput.value = 'no-match'
    searchInput.dispatchEvent(new Event('input'))
    fixture.detectChanges()

    expect(fixture.componentInstance.searchFilter()).toBe('no-match')
    expect(setDashboardFiltersSpy).toHaveBeenCalledTimes(2)
    httpMock.expectNone(() => true)
    expect(element.textContent).toContain('// showing 1-0 of 0 standups')

    ;(finalFilterBar.componentInstance as FilterBar).onStatusSelected('all')
    ;(finalFilterBar.componentInstance as FilterBar).onDateSelected('all_time')
    fixture.detectChanges()

    expect(setDashboardFiltersSpy).toHaveBeenNthCalledWith(3, {
      status: undefined,
      date: '2026-03-09',
    })
    expect(setDashboardFiltersSpy).toHaveBeenNthCalledWith(4, {
      status: undefined,
      date: undefined,
    })

    fixture.componentInstance.onSearchChange('')
    fixture.detectChanges()

    TestBed.tick()
    httpMock.expectOne('/standups').flush({ data: allStandupDtos })
    await appRef.whenStable()
    fixture.detectChanges()

    expect(element.textContent).toContain('// showing 1-142 of 142 standups')
  })
})

function buildMockStandupDtos(standups: ReturnType<typeof buildMockStandups>) {
  return standups.map((standup, index) => toStandupDto(standup, index))
}

function toStandupDto(
  standup: ReturnType<typeof buildMockStandups>[number],
  index: number,
): StandupDto {
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
