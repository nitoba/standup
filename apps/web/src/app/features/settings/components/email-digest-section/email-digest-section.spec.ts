import { TestBed } from '@angular/core/testing'
import { describe, expect, it, vi } from 'vitest'

import { EmailDigestSection } from './email-digest-section'

describe('EmailDigestSection', () => {
  async function renderComponent(emailTheme: 'light' | 'dark' = 'light') {
    await TestBed.configureTestingModule({
      imports: [EmailDigestSection],
    }).compileComponents()

    const fixture = TestBed.createComponent(EmailDigestSection)
    fixture.componentRef.setInput('emailTheme', emailTheme)
    fixture.detectChanges()

    return fixture
  }

  it('renders dark/light email theme toggle', async () => {
    const fixture = await renderComponent('light')
    const el = fixture.nativeElement as HTMLElement

    const darkButton = el.querySelector('[aria-label="Tema escuro"]')
    const lightButton = el.querySelector('[aria-label="Tema claro"]')

    expect(darkButton).toBeTruthy()
    expect(lightButton).toBeTruthy()
  })

  it('shows light button as active when emailTheme is light', async () => {
    const fixture = await renderComponent('light')
    const el = fixture.nativeElement as HTMLElement

    const lightButton = el.querySelector(
      '[aria-label="Tema claro"]',
    ) as HTMLElement
    expect(lightButton?.getAttribute('aria-pressed')).toBe('true')
  })

  it('shows dark button as active when emailTheme is dark', async () => {
    const fixture = await renderComponent('dark')
    const el = fixture.nativeElement as HTMLElement

    const darkButton = el.querySelector(
      '[aria-label="Tema escuro"]',
    ) as HTMLElement
    expect(darkButton?.getAttribute('aria-pressed')).toBe('true')
  })

  it('emits emailThemeChange with dark when dark button is clicked', async () => {
    const fixture = await renderComponent('light')
    const el = fixture.nativeElement as HTMLElement
    const outputSpy = vi.fn()

    ;(
      fixture.componentInstance as EmailDigestSection
    ).emailThemeChange.subscribe(outputSpy)

    const darkButton = el.querySelector(
      '[aria-label="Tema escuro"]',
    ) as HTMLElement
    darkButton.click()

    expect(outputSpy).toHaveBeenCalledWith('dark')
  })

  it('emits emailThemeChange with light when light button is clicked', async () => {
    const fixture = await renderComponent('dark')
    const el = fixture.nativeElement as HTMLElement
    const outputSpy = vi.fn()

    ;(
      fixture.componentInstance as EmailDigestSection
    ).emailThemeChange.subscribe(outputSpy)

    const lightButton = el.querySelector(
      '[aria-label="Tema claro"]',
    ) as HTMLElement
    lightButton.click()

    expect(outputSpy).toHaveBeenCalledWith('light')
  })
})
