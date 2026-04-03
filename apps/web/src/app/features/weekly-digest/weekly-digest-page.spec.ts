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
import { describe, expect, it } from 'vitest'
import { WeeklyDigestPage } from './weekly-digest-page'

async function flushWeekStandups(
  fixture: ReturnType<typeof TestBed.createComponent<WeeklyDigestPage>>,
  response: object,
) {
  const httpMock = TestBed.inject(HttpTestingController)
  const appRef = TestBed.inject(ApplicationRef)

  for (const _attempt of [1, 2, 3]) {
    TestBed.tick()
    const requests = httpMock.match((request) => request.url === '/standups')
    for (const request of requests) {
      request.flush(response)
    }
    await Promise.resolve()
    await Promise.resolve()
    fixture.detectChanges()
  }

  await fixture.whenStable()
  await appRef.whenStable()
  fixture.detectChanges()

  httpMock.verify()
}

describe('WeeklyDigestPage', () => {
  it('renderiza os textos principais em pt-BR', async () => {
    await TestBed.configureTestingModule({
      imports: [WeeklyDigestPage],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTanStackQuery(new QueryClient()),
      ],
    }).compileComponents()

    const fixture = TestBed.createComponent(WeeklyDigestPage)
    fixture.componentRef.setInput('from', '2026-03-03')
    fixture.componentRef.setInput('to', '2026-03-09')
    fixture.detectChanges()

    const emptyResponse = {
      data: [],
      pagination: { page: 1, pageSize: 100, total: 0, totalPages: 0 },
      summary: { total: 0, approved: 0, pending: 0, rejected: 0 },
    }

    await flushWeekStandups(fixture, emptyResponse)

    const element = fixture.nativeElement as HTMLElement
    expect(element.textContent).toContain('voltar para standups')
    expect(element.textContent).toContain('resumo_semanal')
  })

  it('renderiza published com label publicado e estilo cyan no dom', async () => {
    await TestBed.configureTestingModule({
      imports: [WeeklyDigestPage],
      providers: [provideRouter([]), provideTanStackQuery(new QueryClient())],
    }).compileComponents()

    const fixture = TestBed.createComponent(WeeklyDigestPage)
    fixture.componentRef.setInput('from', '2026-03-03')
    fixture.componentRef.setInput('to', '2026-03-09')
    Object.assign(fixture.componentInstance, {
      standups: {
        isPending: () => false,
        error: () => null,
      },
      weekStandups: () => [
        {
          id: 'published-1',
          date: '09/03/2026',
          content: 'standup publicado',
          status: 'published',
        },
        {
          id: 'draft-1',
          date: '08/03/2026',
          content: 'rascunho semanal',
          status: 'draft',
        },
      ],
    })
    fixture.detectChanges()

    const element = fixture.nativeElement as HTMLElement
    const publishedStatusLabel = Array.from(
      element.querySelectorAll('span') as NodeListOf<HTMLSpanElement>,
    ).find((span) => span.textContent?.includes('[publicado]'))
    const publishedStatusContainer = publishedStatusLabel?.parentElement
    const publishedStatusIndicator = Array.from(
      publishedStatusContainer?.querySelectorAll('span') ?? [],
    ).find(
      (span) =>
        span.className.includes('h-[6px]') &&
        span.className.includes('w-[6px]') &&
        span.className.includes('rounded-full'),
    )

    const draftStatusLabel = Array.from(
      element.querySelectorAll('span') as NodeListOf<HTMLSpanElement>,
    ).find((span) => span.textContent?.includes('[rascunho]'))

    expect(element.textContent).toContain('[publicado]')
    expect(element.textContent).toContain('[rascunho]')
    expect(publishedStatusLabel?.className).toContain('text-cyan-400')
    expect(publishedStatusIndicator?.className).toContain('bg-cyan-400')
    expect(draftStatusLabel?.className).toContain('text-muted-foreground')
  })
})
