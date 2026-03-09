import { TestBed } from '@angular/core/testing'
import { describe, expect, it, vi } from 'vitest'

import { FilterBar } from './filter-bar'

describe('FilterBar', () => {
  it('emits status, date, and search changes', async () => {
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
    input.value = 'retry'
    input.dispatchEvent(new Event('input'))

    expect(statusSpy).toHaveBeenCalledWith('pending_review')
    expect(dateSpy).toHaveBeenCalledWith('2026-03-09')
    expect(searchSpy).toHaveBeenCalledWith('retry')
  })
})
