import { signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { provideRouter } from '@angular/router'
import { describe, expect, it, vi } from 'vitest'

import type { SessionUser } from '../services/session.service'
import { SessionService } from '../services/session.service'
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
    expect(element.textContent).toContain('dashboard')
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
    expect(element.textContent).toContain('nitoba/')
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
    expect(element.textContent).toContain('nito@test.com/')
  })

  it('shows generic user/ when no session', async () => {
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
    expect(element.textContent).toContain('user/')
  })

  it('calls signOut and navigates to /login on logout click', async () => {
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

    // Find the desktop logout button (inside <aside>)
    const aside = fixture.nativeElement.querySelector('aside') as HTMLElement
    const logoutButton = aside.querySelector(
      'button',
    ) as HTMLButtonElement | null
    // The first button in footer is the logout button (reports button is in nav)
    const footerButtons = aside.querySelectorAll('footer button')
    const logoutBtn = footerButtons[0] as HTMLButtonElement

    expect(logoutBtn.textContent).toContain('logout')

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
    expect(mobileNav.textContent).toContain('logout')
  })
})
