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
    const pageSizeSpy = vi.fn()

    fixture.componentInstance.statusChange.subscribe(statusSpy)
    fixture.componentInstance.dateChange.subscribe(dateSpy)
    fixture.componentInstance.searchChange.subscribe(searchSpy)
    fixture.componentInstance.pageSizeChange.subscribe(pageSizeSpy)
    fixture.componentRef.setInput('status', 'approved')
    fixture.componentRef.setInput('date', 'today')
    fixture.componentRef.setInput('search', 'retry')
    fixture.componentRef.setInput('pageSize', 50)
    fixture.detectChanges()

    const comboboxes = fixture.nativeElement.querySelectorAll(
      'z-combobox',
    ) as NodeListOf<HTMLElement>
    const input = fixture.nativeElement.querySelector(
      'input',
    ) as HTMLInputElement

    fixture.componentInstance.onStatusSelected('pending_review')
    fixture.componentInstance.onDateSelected('this_week')
    fixture.componentInstance.onDateSelected('today')
    fixture.componentInstance.onDateSelected('yesterday')
    fixture.componentInstance.onDateSelected('all_time')
    fixture.componentInstance.onPageSizeSelected('50')
    input.value = 'retry'
    input.dispatchEvent(new Event('input'))

    expect(comboboxes).toHaveLength(3)
    expect(statusSpy).toHaveBeenCalledWith('pending_review')
    expect(dateSpy).toHaveBeenNthCalledWith(1, 'this_week')
    expect(dateSpy).toHaveBeenNthCalledWith(2, 'today')
    expect(dateSpy).toHaveBeenNthCalledWith(3, 'yesterday')
    expect(dateSpy).toHaveBeenNthCalledWith(4, 'all_time')
    expect(pageSizeSpy).toHaveBeenCalledWith(50)
    expect(searchSpy).toHaveBeenCalledWith('retry')
    expect(fixture.nativeElement.textContent).toContain('status: approved')
    expect(fixture.nativeElement.textContent).toContain('page size: 50')
  })

  it('formats local date parts without converting through UTC', () => {
    const fixture = TestBed.createComponent(FilterBar)
    const filterBar = fixture.componentInstance
    const localDate = new Date(2026, 2, 9, 23, 30)

    expect(filterBar.formatDate(localDate)).toBe('2026-03-09')
  })

  it('treats null combobox values as reset to all and all_time', async () => {
    await TestBed.configureTestingModule({
      imports: [FilterBar],
    }).compileComponents()

    const fixture = TestBed.createComponent(FilterBar)
    const statusSpy = vi.fn()
    const dateSpy = vi.fn()

    fixture.componentInstance.statusChange.subscribe(statusSpy)
    fixture.componentInstance.dateChange.subscribe(dateSpy)

    fixture.componentInstance.onStatusSelected(null)
    fixture.componentInstance.onDateSelected(null)

    expect(fixture.componentInstance.status()).toBe('all')
    expect(fixture.componentInstance.date()).toBe('all_time')
    expect(statusSpy).toHaveBeenCalledWith('all')
    expect(dateSpy).toHaveBeenCalledWith('all_time')
  })
})
