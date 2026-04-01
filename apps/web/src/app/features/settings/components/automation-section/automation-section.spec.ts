import { TestBed } from '@angular/core/testing'
import { describe, expect, it, vi } from 'vitest'

import { AutomationSection } from './automation-section'

describe('AutomationSection', () => {
  async function renderComponent(active = false) {
    await TestBed.configureTestingModule({
      imports: [AutomationSection],
    }).compileComponents()

    const fixture = TestBed.createComponent(AutomationSection)
    fixture.componentRef.setInput('active', active)
    fixture.detectChanges()

    return fixture
  }

  it('renders the active toggle with correct state', async () => {
    const fixture = await renderComponent(true)
    const el = fixture.nativeElement as HTMLElement

    const toggle = el.querySelector<HTMLButtonElement>('[role="switch"]')
    expect(toggle).toBeTruthy()
    expect(toggle?.getAttribute('aria-checked')).toBe('true')
  })

  it('renders unchecked when active is false', async () => {
    const fixture = await renderComponent(false)
    const el = fixture.nativeElement as HTMLElement

    const toggle = el.querySelector<HTMLButtonElement>('[role="switch"]')
    expect(toggle?.getAttribute('aria-checked')).toBe('false')
  })

  it('emits activeChange when toggle is clicked', async () => {
    const fixture = await renderComponent(false)
    const el = fixture.nativeElement as HTMLElement
    const outputSpy = vi.fn()

    fixture.componentInstance.activeChange.subscribe(outputSpy)

    const toggle = el.querySelector<HTMLButtonElement>('[role="switch"]')!
    toggle.click()
    fixture.detectChanges()

    expect(outputSpy).toHaveBeenCalledWith(true)
  })

  it('emits activeChange with false when toggling from checked', async () => {
    const fixture = await renderComponent(true)
    const el = fixture.nativeElement as HTMLElement
    const outputSpy = vi.fn()

    fixture.componentInstance.activeChange.subscribe(outputSpy)

    const toggle = el.querySelector<HTMLButtonElement>('[role="switch"]')!
    toggle.click()
    fixture.detectChanges()

    expect(outputSpy).toHaveBeenCalledWith(false)
  })
})
