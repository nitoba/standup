import {
  HttpClient,
  provideHttpClient,
  withInterceptors,
} from '@angular/common/http'
import { TestBed } from '@angular/core/testing'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { mockApiInterceptor, resetMockApiState } from './mock-api.interceptor'

describe('mockApiInterceptor', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    resetMockApiState()
  })

  function setup() {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withInterceptors([mockApiInterceptor]))],
    })

    return TestBed.inject(HttpClient)
  }

  it('returns standup lists with filters applied', async () => {
    const http = setup()

    const promise = http
      .get('/api/standups', {
        params: { status: 'pending_review', date: '2026-03-09' },
      })
      .toPromise()

    await vi.advanceTimersByTimeAsync(700)

    const body = await promise

    expect(Array.isArray(body)).toBe(true)
    expect((body as Array<{ id: string }>)[0]?.id).toBe('7f3a2b1c')
  })

  it('returns standup detail by id', async () => {
    const http = setup()

    const promise = http.get('/api/standups/7f3a2b1c').toPromise()

    await vi.advanceTimersByTimeAsync(700)

    const body = await promise

    expect((body as { id: string }).id).toBe('7f3a2b1c')
  })

  it('updates standup status through patch requests', async () => {
    const http = setup()

    const promise = http
      .patch('/api/standups/7f3a2b1c/status', { status: 'approved' })
      .toPromise()

    await vi.advanceTimersByTimeAsync(700)

    const body = await promise

    expect((body as { status: string }).status).toBe('approved')
  })

  it('returns trigger acknowledgement', async () => {
    const http = setup()

    const promise = http.post('/api/standups/trigger', {}).toPromise()

    await vi.advanceTimersByTimeAsync(700)

    const body = await promise

    expect((body as { triggered: boolean }).triggered).toBe(true)
  })
})
