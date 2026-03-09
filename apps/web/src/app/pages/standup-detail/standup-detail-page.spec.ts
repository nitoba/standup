import { provideHttpClient, withInterceptors } from '@angular/common/http'
import { TestBed } from '@angular/core/testing'
import { provideRouter } from '@angular/router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  mockApiInterceptor,
  resetMockApiState,
} from '../../interceptors/mock-api.interceptor'
import { StandupDetailPage } from './standup-detail-page'

describe('StandupDetailPage', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    resetMockApiState()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders detail header', async () => {
    await TestBed.configureTestingModule({
      imports: [StandupDetailPage],
      providers: [
        provideRouter([]),
        provideHttpClient(withInterceptors([mockApiInterceptor])),
      ],
    }).compileComponents()

    const fixture = TestBed.createComponent(StandupDetailPage)
    fixture.componentRef.setInput('id', '7f3a2b1c')
    fixture.detectChanges()

    await vi.advanceTimersByTimeAsync(700)
    fixture.detectChanges()

    const element = fixture.nativeElement as HTMLElement
    expect(element.textContent).toContain('standup_detail')
  })
})
