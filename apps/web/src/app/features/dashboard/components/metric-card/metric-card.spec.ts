import { TestBed } from '@angular/core/testing'
import { describe, expect, it } from 'vitest'

import { MetricCard } from './metric-card'

describe('MetricCard', () => {
  it('renders label, value, and change text', async () => {
    await TestBed.configureTestingModule({
      imports: [MetricCard],
    }).compileComponents()

    const fixture = TestBed.createComponent(MetricCard)
    fixture.componentRef.setInput('label', 'approved')
    fixture.componentRef.setInput('value', 128)
    fixture.componentRef.setInput('change', '++ 8 this_week')
    fixture.componentRef.setInput('dotColor', 'bg-[var(--accent-green)]')
    fixture.componentRef.setInput('valueColor', 'text-[var(--accent-green)]')
    fixture.componentRef.setInput('changeColor', 'text-[var(--accent-green)]')
    fixture.detectChanges()

    const element = fixture.nativeElement as HTMLElement
    expect(element.textContent).toContain('approved')
    expect(element.textContent).toContain('128')
    expect(element.textContent).toContain('++ 8 this_week')
  })
})
