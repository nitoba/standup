import { TestBed } from '@angular/core/testing'
import { describe, expect, it, vi } from 'vitest'

import type { Standup } from '../../types/standup'
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
        date: '2026-03-09',
        status: 'pending_review',
        createdAt: '17:32',
        contentPreview: 'implemented retry logic...',
        sections: [],
        sources: [],
      },
    ]

    fixture.componentRef.setInput('standups', standups)
    fixture.componentRef.setInput('total', 1)
    fixture.componentInstance.viewStandup.subscribe(emitSpy)
    fixture.detectChanges()

    const button = fixture.nativeElement.querySelector(
      'button',
    ) as HTMLButtonElement
    button.click()

    expect(fixture.nativeElement.textContent).toContain(
      'implemented retry logic',
    )
    expect(emitSpy).toHaveBeenCalledWith('7f3a2b1c')
  })
})
