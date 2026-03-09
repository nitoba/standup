import { TestBed } from '@angular/core/testing'
import { provideRouter } from '@angular/router'
import { describe, expect, it } from 'vitest'

import { SidebarLayout } from './sidebar'

describe('SidebarLayout', () => {
  it('renders navigation and projects content', async () => {
    await TestBed.configureTestingModule({
      imports: [SidebarLayout],
      providers: [provideRouter([])],
    }).compileComponents()

    const fixture = TestBed.createComponent(SidebarLayout)
    fixture.detectChanges()

    const element = fixture.nativeElement as HTMLElement
    expect(element.textContent).toContain('standup_bot')
    expect(element.textContent).toContain('dashboard')
  })
})
