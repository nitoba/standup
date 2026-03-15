import { TestBed } from '@angular/core/testing'
import { describe, expect, it, vi } from 'vitest'

import type { Standup } from '../../../../shared/models/standup-models'
import { StandupTable } from './standup-table'

describe('StandupTable', () => {
  it('renders rows and emits selected standup ids', async () => {
    await TestBed.configureTestingModule({
      imports: [StandupTable],
    }).compileComponents()

    const fixture = TestBed.createComponent(StandupTable)
    const emitSpy = vi.fn()
    const standups: Standup[] = [
      {
        id: '7f3a2b1c',
        date: '09/03/2026',
        status: 'pending_review',
        createdAt: '17:32',
        contentPreview: 'implemented retry logic...',
        sections: [],
        sources: [],
      },
    ]

    fixture.componentRef.setInput('standups', standups)
    fixture.componentRef.setInput('total', 1)
    fixture.componentRef.setInput('page', 1)
    fixture.componentRef.setInput('pageSize', 20)
    fixture.componentRef.setInput('totalPages', 1)
    fixture.componentInstance.viewStandup.subscribe(emitSpy)
    fixture.detectChanges()

    const button = Array.from(
      fixture.nativeElement.querySelectorAll(
        'button',
      ) as NodeListOf<HTMLButtonElement>,
    ).find((element) =>
      element.textContent?.includes('$ ver >>'),
    ) as HTMLButtonElement
    button.click()

    expect(fixture.nativeElement.textContent).toContain(
      'implemented retry logic',
    )
    expect(fixture.nativeElement.textContent).toContain('página 1 de 1')
    expect(fixture.nativeElement.textContent).toContain('1 no total')
    expect(emitSpy).toHaveBeenCalledWith('7f3a2b1c')
  })

  it('renders clickable page numbers and emits page changes', async () => {
    await TestBed.configureTestingModule({
      imports: [StandupTable],
    }).compileComponents()

    const fixture = TestBed.createComponent(StandupTable)
    const pageChangeSpy = vi.fn()

    fixture.componentRef.setInput('standups', [])
    fixture.componentRef.setInput('total', 142)
    fixture.componentRef.setInput('page', 4)
    fixture.componentRef.setInput('pageSize', 20)
    fixture.componentRef.setInput('totalPages', 8)
    fixture.componentInstance.pageChange.subscribe(pageChangeSpy)
    fixture.detectChanges()

    const pageFiveButton = Array.from(
      fixture.nativeElement.querySelectorAll(
        'button',
      ) as NodeListOf<HTMLButtonElement>,
    ).find(
      (element) => element.textContent?.trim() === '5',
    ) as HTMLButtonElement

    expect(fixture.nativeElement.textContent).toContain('1')
    expect(fixture.nativeElement.textContent).toContain('4')
    expect(fixture.nativeElement.textContent).toContain('8')
    expect(fixture.nativeElement.textContent).toContain('...')
    expect(fixture.nativeElement.textContent).toContain('página 4 de 8')
    expect(fixture.nativeElement.textContent).toContain('142 no total')

    pageFiveButton.click()

    expect(pageChangeSpy).toHaveBeenCalledWith(5)
  })
})
