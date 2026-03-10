import { signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { provideRouter, Router, type UrlTree } from '@angular/router'
import { describe, expect, it } from 'vitest'
import { authGuard } from './auth-guard'
import { SessionService } from './session-service'

describe('authGuard', () => {
  it('allows activation when the user is authenticated', () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: SessionService,
          useValue: {
            isAuthenticated: signal(true).asReadonly(),
            hasResolvedSession: signal(true).asReadonly(),
          },
        },
      ],
    })

    const allowed = TestBed.runInInjectionContext(() =>
      authGuard({} as never, { url: '/dashboard' } as never),
    )

    expect(allowed).toBe(true)
  })

  it('redirects unauthenticated users to login with the current returnUrl', () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: SessionService,
          useValue: {
            isAuthenticated: signal(false).asReadonly(),
            hasResolvedSession: signal(true).asReadonly(),
          },
        },
      ],
    })

    const router = TestBed.inject(Router)

    const result = TestBed.runInInjectionContext(() =>
      authGuard({} as never, { url: '/standups/123?view=full' } as never),
    ) as UrlTree

    expect(router.serializeUrl(result)).toBe(
      '/login?returnUrl=%2Fstandups%2F123%3Fview%3Dfull',
    )
  })

  it('waits for session resolution before deciding (bootstrap in progress)', async () => {
    const isAuthenticated = signal(false)
    const hasResolvedSession = signal(false)

    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: SessionService,
          useValue: {
            isAuthenticated: isAuthenticated.asReadonly(),
            hasResolvedSession: hasResolvedSession.asReadonly(),
          },
        },
      ],
    })

    const guardResult = TestBed.runInInjectionContext(() =>
      authGuard({} as never, { url: '/settings' } as never),
    )

    expect(guardResult).toBeInstanceOf(Promise)

    // Simulate bootstrap completing with an authenticated session
    isAuthenticated.set(true)
    hasResolvedSession.set(true)

    await expect(guardResult).resolves.toBe(true)
  })

  it('waits for session resolution and redirects if not authenticated', async () => {
    const isAuthenticated = signal(false)
    const hasResolvedSession = signal(false)

    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: SessionService,
          useValue: {
            isAuthenticated: isAuthenticated.asReadonly(),
            hasResolvedSession: hasResolvedSession.asReadonly(),
          },
        },
      ],
    })

    const router = TestBed.inject(Router)

    const guardResult = TestBed.runInInjectionContext(() =>
      authGuard({} as never, { url: '/dashboard' } as never),
    )

    expect(guardResult).toBeInstanceOf(Promise)

    // Simulate bootstrap completing without a session (e.g. expired cookie)
    hasResolvedSession.set(true)

    const result = (await guardResult) as UrlTree
    expect(router.serializeUrl(result)).toBe('/login?returnUrl=%2Fdashboard')
  })
})
