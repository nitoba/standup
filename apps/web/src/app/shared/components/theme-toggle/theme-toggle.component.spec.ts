import { signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { describe, expect, it, vi } from 'vitest'
import { EDarkModes, ZardDarkMode } from '../../services/dark-mode'
import { ThemeToggleComponent } from './theme-toggle.component'

function createDarkModeMock(initialMode = EDarkModes.DARK) {
  const themeMode = signal(initialMode)
  return {
    currentTheme: themeMode.asReadonly(),
    toggleTheme: vi.fn(),
  }
}

describe('ThemeToggleComponent', () => {
  it('renders theme select with terminal label', async () => {
    const darkMode = createDarkModeMock(EDarkModes.DARK)

    await TestBed.configureTestingModule({
      imports: [ThemeToggleComponent],
      providers: [{ provide: ZardDarkMode, useValue: darkMode }],
    }).compileComponents()

    const fixture = TestBed.createComponent(ThemeToggleComponent)
    fixture.componentRef.setInput('showLabel', true)
    fixture.detectChanges()

    const element = fixture.nativeElement as HTMLElement
    const trigger = element.querySelector('button') as HTMLButtonElement | null

    expect(element.textContent).toContain('$')
    expect(element.textContent).toContain('theme_mode')
    expect(trigger).toBeTruthy()
    expect(trigger?.textContent).toContain('dark')
  })

  it('sets the selected theme mode', async () => {
    const darkMode = createDarkModeMock(EDarkModes.LIGHT)

    await TestBed.configureTestingModule({
      imports: [ThemeToggleComponent],
      providers: [{ provide: ZardDarkMode, useValue: darkMode }],
    }).compileComponents()

    const fixture = TestBed.createComponent(ThemeToggleComponent)
    fixture.detectChanges()

    fixture.componentInstance.onThemeChange(EDarkModes.SYSTEM)

    expect(darkMode.toggleTheme).toHaveBeenCalledWith(EDarkModes.SYSTEM)
  })
})
