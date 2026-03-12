import { TestBed } from '@angular/core/testing'
import { describe, expect, it, vi } from 'vitest'

import { CronBuilderComponent } from './cron-builder'

describe('CronBuilderComponent', () => {
  async function renderComponent(value = '30 17 * * 1-5') {
    await TestBed.configureTestingModule({
      imports: [CronBuilderComponent],
    }).compileComponents()

    const fixture = TestBed.createComponent(CronBuilderComponent)
    fixture.componentRef.setInput('value', value)
    fixture.detectChanges()

    return fixture
  }

  it('renders the parsed cron preview and description', async () => {
    const fixture = await renderComponent()
    const el = fixture.nativeElement as HTMLElement

    expect(el.textContent).toContain('>30 17 * * 1-5')
    expect(el.textContent).toContain('// every weekday at 17:30')
  })

  it('emits the updated cron expression when apply is clicked', async () => {
    const fixture = await renderComponent()
    const el = fixture.nativeElement as HTMLElement
    const appliedSpy = vi.fn()

    fixture.componentInstance.applied.subscribe(appliedSpy)

    el.querySelector<HTMLButtonElement>('[aria-label="Increase hour"]')?.click()
    fixture.detectChanges()

    Array.from(el.querySelectorAll('button'))
      .find((button) => button.textContent?.includes('apply'))
      ?.click()
    fixture.detectChanges()

    expect(appliedSpy).toHaveBeenCalledWith('30 18 * * 1-5')
  })
})
