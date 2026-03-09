import { TestBed } from '@angular/core/testing'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { FilterBar } from './filter-bar'

describe('FilterBar', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('emits status, date, and search changes', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-09T12:00:00Z'))

    await TestBed.configureTestingModule({
      imports: [FilterBar],
    }).compileComponents()

    const fixture = TestBed.createComponent(FilterBar)
    const statusSpy = vi.fn()
    const dateSpy = vi.fn()
    const searchSpy = vi.fn()

    fixture.componentInstance.statusChange.subscribe(statusSpy)
    fixture.componentInstance.dateChange.subscribe(dateSpy)
    fixture.componentInstance.searchChange.subscribe(searchSpy)
    fixture.detectChanges()

    const [statusButton, dateButton] =
      fixture.nativeElement.querySelectorAll('button')
    const input = fixture.nativeElement.querySelector(
      'input',
    ) as HTMLInputElement

    statusButton.click()
    dateButton.click()
    fixture.detectChanges()

    expect(dateButton.textContent).toContain('2026-03-09')

    dateButton.click()
    dateButton.click()
    input.value = 'retry'
    input.dispatchEvent(new Event('input'))

    expect(statusSpy).toHaveBeenCalledWith('pending_review')
    expect(dateSpy).toHaveBeenNthCalledWith(1, '2026-03-09')
    expect(dateSpy).toHaveBeenNthCalledWith(2, '2026-03-08')
    expect(dateSpy).toHaveBeenNthCalledWith(3, 'this_week')
    expect(searchSpy).toHaveBeenCalledWith('retry')
  })

  it('formats local date parts without converting through UTC', () => {
    const fixture = TestBed.createComponent(FilterBar)
    const filterBar = fixture.componentInstance
    const localDate = new Date(2026, 2, 9, 23, 30)

    expect(filterBar.formatDate(localDate)).toBe('2026-03-09')
  })
})
