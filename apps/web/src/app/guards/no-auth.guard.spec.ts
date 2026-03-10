import { signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { provideRouter, Router, type UrlTree } from '@angular/router'
import { describe, expect, it } from 'vitest'

import { SessionService } from '../services/session.service'
import { noAuthGuard } from './no-auth.guard'

describe('noAuthGuard', () => {
  it('allows activation when the user is not authenticated', () => {
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

    const allowed = TestBed.runInInjectionContext(() =>
      noAuthGuard({} as never, { url: '/login' } as never),
    )

    expect(allowed).toBe(true)
  })

  it('redirects authenticated users to /dashboard', () => {
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

    const router = TestBed.inject(Router)

    const result = TestBed.runInInjectionContext(() =>
      noAuthGuard({} as never, { url: '/login' } as never),
    ) as UrlTree

    expect(router.serializeUrl(result)).toBe('/dashboard')
  })

  it('waits for session resolution before allowing unauthenticated access', async () => {
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
      noAuthGuard({} as never, { url: '/login' } as never),
    )

    expect(guardResult).toBeInstanceOf(Promise)

    // Simulate bootstrap completing without a session
    hasResolvedSession.set(true)

    await expect(guardResult).resolves.toBe(true)
  })

  it('waits for session resolution and redirects if authenticated', async () => {
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
      noAuthGuard({} as never, { url: '/login' } as never),
    )

    expect(guardResult).toBeInstanceOf(Promise)

    // Simulate bootstrap completing with an authenticated session
    isAuthenticated.set(true)
    hasResolvedSession.set(true)

    const result = (await guardResult) as UrlTree
    expect(router.serializeUrl(result)).toBe('/dashboard')
  })
})
