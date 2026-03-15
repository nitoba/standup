import { signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { provideRouter } from '@angular/router'
import { describe, expect, it, vi } from 'vitest'

import type { SessionUser } from '../auth/session-service'
import { SessionService } from '../auth/session-service'
import { SidebarLayout } from './sidebar'

function createMockSessionService(user: SessionUser | null = null) {
  const userSignal = signal(user)
  return {
    user: userSignal.asReadonly(),
    signOut: vi.fn().mockResolvedValue(undefined),
  }
}

describe('SidebarLayout', () => {
  it('renders navigation and project name', async () => {
    const mockSession = createMockSessionService()

    await TestBed.configureTestingModule({
      imports: [SidebarLayout],
      providers: [
        provideRouter([]),
        { provide: SessionService, useValue: mockSession },
      ],
    }).compileComponents()

    const fixture = TestBed.createComponent(SidebarLayout)
    fixture.detectChanges()

    const element = fixture.nativeElement as HTMLElement
    expect(element.textContent).toContain('standup_bot')
    expect(element.textContent).toContain('painel')
  })

  it('displays user name from session', async () => {
    const mockSession = createMockSessionService({
      id: 'u1',
      name: 'nitoba',
      email: 'nito@test.com',
    })

    await TestBed.configureTestingModule({
      imports: [SidebarLayout],
      providers: [
        provideRouter([]),
        { provide: SessionService, useValue: mockSession },
      ],
    }).compileComponents()

    const fixture = TestBed.createComponent(SidebarLayout)
    fixture.detectChanges()

    const element = fixture.nativeElement as HTMLElement
    expect(element.textContent).toContain('nitoba')
  })

  it('falls back to email when name is not available', async () => {
    const mockSession = createMockSessionService({
      id: 'u1',
      name: null,
      email: 'nito@test.com',
    })

    await TestBed.configureTestingModule({
      imports: [SidebarLayout],
      providers: [
        provideRouter([]),
        { provide: SessionService, useValue: mockSession },
      ],
    }).compileComponents()

    const fixture = TestBed.createComponent(SidebarLayout)
    fixture.detectChanges()

    const element = fixture.nativeElement as HTMLElement
    expect(element.textContent).toContain('nito@test.com')
  })

  it('shows generic usuário when no session', async () => {
    const mockSession = createMockSessionService(null)

    await TestBed.configureTestingModule({
      imports: [SidebarLayout],
      providers: [
        provideRouter([]),
        { provide: SessionService, useValue: mockSession },
      ],
    }).compileComponents()

    const fixture = TestBed.createComponent(SidebarLayout)
    fixture.detectChanges()

    const element = fixture.nativeElement as HTMLElement
    expect(element.textContent).toContain('usuário')
  })

  it('renders the desktop user popover trigger', async () => {
    const mockSession = createMockSessionService({
      id: 'u1',
      name: 'nitoba',
      email: 'nito@test.com',
    })

    await TestBed.configureTestingModule({
      imports: [SidebarLayout],
      providers: [
        provideRouter([]),
        { provide: SessionService, useValue: mockSession },
      ],
    }).compileComponents()

    const fixture = TestBed.createComponent(SidebarLayout)
    fixture.detectChanges()

    const aside = fixture.nativeElement.querySelector('aside') as HTMLElement
    const trigger = aside.querySelector(
      'footer button[aria-haspopup="menu"]',
    ) as HTMLButtonElement | null

    expect(trigger).not.toBeNull()
    expect(trigger?.textContent).toContain('nitoba')
    expect(trigger?.textContent).toContain('ativo')
  })

  it('calls signOut and navigates to /login on logout request', async () => {
    const mockSession = createMockSessionService({
      id: 'u1',
      name: 'nitoba',
    })

    await TestBed.configureTestingModule({
      imports: [SidebarLayout],
      providers: [
        provideRouter([{ path: 'login', component: SidebarLayout }]),
        { provide: SessionService, useValue: mockSession },
      ],
    }).compileComponents()

    const fixture = TestBed.createComponent(SidebarLayout)
    fixture.detectChanges()

    await fixture.componentInstance.handleSignOut()

    expect(mockSession.signOut).toHaveBeenCalled()
  })

  it('renders logout button in mobile nav', async () => {
    const mockSession = createMockSessionService()

    await TestBed.configureTestingModule({
      imports: [SidebarLayout],
      providers: [
        provideRouter([]),
        { provide: SessionService, useValue: mockSession },
      ],
    }).compileComponents()

    const fixture = TestBed.createComponent(SidebarLayout)
    fixture.detectChanges()

    // Open mobile menu
    fixture.componentInstance.mobileMenuOpen.set(true)
    fixture.detectChanges()

    const mobileNav = fixture.nativeElement.querySelector('nav') as HTMLElement
    expect(mobileNav.textContent).toContain('sair')
  })

  it('locks body scroll while mobile menu is open', async () => {
    const mockSession = createMockSessionService()

    await TestBed.configureTestingModule({
      imports: [SidebarLayout],
      providers: [
        provideRouter([]),
        { provide: SessionService, useValue: mockSession },
      ],
    }).compileComponents()

    const fixture = TestBed.createComponent(SidebarLayout)
    fixture.detectChanges()

    expect(document.body.style.overflow).toBe('')

    fixture.componentInstance.mobileMenuOpen.set(true)
    fixture.detectChanges()

    expect(document.body.style.overflow).toBe('hidden')

    fixture.componentInstance.mobileMenuOpen.set(false)
    fixture.detectChanges()

    expect(document.body.style.overflow).toBe('')
  })
})
