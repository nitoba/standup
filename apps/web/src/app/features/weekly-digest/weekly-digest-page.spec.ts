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

    const httpMock = TestBed.inject(HttpTestingController)
    const appRef = TestBed.inject(ApplicationRef)

    const fixture = TestBed.createComponent(WeeklyDigestPage)
    fixture.componentRef.setInput('from', '2026-03-03')
    fixture.componentRef.setInput('to', '2026-03-09')
    fixture.detectChanges()

    const emptyResponse = {
      data: [],
      pagination: { page: 1, pageSize: 100, total: 0, totalPages: 0 },
      summary: { total: 0, approved: 0, pending: 0, rejected: 0 },
    }

    for (const _attempt of [1, 2, 3]) {
      TestBed.tick()
      const requests = httpMock.match((request) => request.url === '/standups')
      for (const request of requests) {
        request.flush(emptyResponse)
      }
      await Promise.resolve()
      await Promise.resolve()
      fixture.detectChanges()
    }

    await fixture.whenStable()
    await appRef.whenStable()
    fixture.detectChanges()

    const element = fixture.nativeElement as HTMLElement
    expect(element.textContent).toContain('voltar para standups')
    expect(element.textContent).toContain('resumo_semanal')

    httpMock.verify()
  })

  it('mapeia status para rotulos em pt-BR', async () => {
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
    const page = fixture.componentInstance

    expect(page.formatStatus('approved')).toBe('[aprovado]')
    expect(page.formatStatus('pending_review')).toBe('[pendente]')
    expect(page.formatStatus('rejected')).toBe('[rejeitado]')
  })
})
