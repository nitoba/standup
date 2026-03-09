import { provideHttpClient, withInterceptors } from '@angular/common/http'
import { TestBed } from '@angular/core/testing'
import { provideRouter } from '@angular/router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  mockApiInterceptor,
  resetMockApiState,
} from '../../interceptors/mock-api.interceptor'
import { DashboardPage } from './dashboard-page'

describe('DashboardPage', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    resetMockApiState()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders the dashboard header', async () => {
    await TestBed.configureTestingModule({
      imports: [DashboardPage],
      providers: [
        provideRouter([]),
        provideHttpClient(withInterceptors([mockApiInterceptor])),
      ],
    }).compileComponents()

    const fixture = TestBed.createComponent(DashboardPage)
    fixture.detectChanges()
    await vi.advanceTimersByTimeAsync(700)
    fixture.detectChanges()

    const element = fixture.nativeElement as HTMLElement
    expect(element.textContent).toContain('standups')
    expect(element.textContent).toContain('daily standup reports overview')
  })
})
