import { HttpRequest, HttpResponse } from '@angular/common/http'
import { TestBed } from '@angular/core/testing'
import { firstValueFrom, of } from 'rxjs'
import { describe, expect, it, vi } from 'vitest'

import { environment } from '../../environments/environment'
import { baseUrlInterceptor } from './base-url.interceptor'

describe('baseUrlInterceptor', () => {
  it('prepends apiBaseUrl and sets withCredentials for API requests', async () => {
    // In test build, environment.development.ts is used via fileReplacements
    // so apiBaseUrl = 'http://localhost:3333'
    expect(environment.apiBaseUrl).toBeTruthy()

    const request = new HttpRequest('GET', '/standups')
    const response = new HttpResponse()
    const next = vi.fn().mockReturnValue(of(response))

    const result = await TestBed.runInInjectionContext(() =>
      firstValueFrom(baseUrlInterceptor(request, next as never)),
    )

    expect(result).toBe(response)
    const interceptedRequest = next.mock.calls[0]![0] as HttpRequest<unknown>
    expect(interceptedRequest.url).toBe(`${environment.apiBaseUrl}/standups`)
    expect(interceptedRequest.withCredentials).toBe(true)
  })

  it('handles API requests with path segments', async () => {
    const request = new HttpRequest('GET', '/standups/abc-123')
    const response = new HttpResponse()
    const next = vi.fn().mockReturnValue(of(response))

    await TestBed.runInInjectionContext(() =>
      firstValueFrom(baseUrlInterceptor(request, next as never)),
    )

    const interceptedRequest = next.mock.calls[0]![0] as HttpRequest<unknown>
    expect(interceptedRequest.url).toBe(
      `${environment.apiBaseUrl}/standups/abc-123`,
    )
    expect(interceptedRequest.withCredentials).toBe(true)
  })

  it.each([
    '/settings/me',
    '/repos',
    '/reminders/snooze',
    '/health',
    '/ready',
  ])('intercepts %s as an API route', async (url) => {
    const request = new HttpRequest('GET', url)
    const response = new HttpResponse()
    const next = vi.fn().mockReturnValue(of(response))

    await TestBed.runInInjectionContext(() =>
      firstValueFrom(baseUrlInterceptor(request, next as never)),
    )

    const interceptedRequest = next.mock.calls[0]![0] as HttpRequest<unknown>
    expect(interceptedRequest.url).toBe(`${environment.apiBaseUrl}${url}`)
    expect(interceptedRequest.withCredentials).toBe(true)
  })

  it('does not modify requests that are not API routes', async () => {
    const request = new HttpRequest('GET', '/assets/logo.svg')
    const response = new HttpResponse()
    const next = vi.fn().mockReturnValue(of(response))

    await TestBed.runInInjectionContext(() =>
      firstValueFrom(baseUrlInterceptor(request, next as never)),
    )

    const interceptedRequest = next.mock.calls[0]![0] as HttpRequest<unknown>
    expect(interceptedRequest.url).toBe('/assets/logo.svg')
    expect(interceptedRequest.withCredentials).toBe(false)
  })
})
