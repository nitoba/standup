import { provideHttpClient, withInterceptors } from '@angular/common/http'
import { TestBed } from '@angular/core/testing'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  mockApiInterceptor,
  resetMockApiState,
} from '../interceptors/mock-api.interceptor'
import { StandupService } from './standup.service'

describe('StandupService', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    resetMockApiState()
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withInterceptors([mockApiInterceptor]))],
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('computes dashboard metrics from standups', async () => {
    const service = TestBed.inject(StandupService)

    await vi.advanceTimersByTimeAsync(700)

    const metrics = service.metrics()
    expect(metrics.total.count).toBe(142)
    expect(metrics.approved.count).toBe(128)
    expect(metrics.pending.count).toBe(8)
    expect(metrics.rejected.count).toBe(6)
  })

  it('loads standup detail through httpResource', async () => {
    const service = TestBed.inject(StandupService)
    const detail = TestBed.runInInjectionContext(() =>
      service.getStandupById(() => '7f3a2b1c'),
    )

    await vi.advanceTimersByTimeAsync(700)

    expect(detail.value()?.id).toBe('7f3a2b1c')
  })

  it('updates standup status and reloads the list', async () => {
    const service = TestBed.inject(StandupService)

    await vi.advanceTimersByTimeAsync(700)
    const approvePromise = service.approve('7f3a2b1c')
    await vi.advanceTimersByTimeAsync(700)
    await approvePromise
    await vi.advanceTimersByTimeAsync(700)

    const updated = service.standups
      .value()
      .find((item) => item.id === '7f3a2b1c')
    expect(updated?.status).toBe('approved')
  })
})
