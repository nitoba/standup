import { TestBed } from '@angular/core/testing'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const betterAuthMocks = vi.hoisted(() => ({
  createAuthClient: vi.fn(),
  getSession: vi.fn(),
  signInSocial: vi.fn(),
  signOut: vi.fn(),
}))

import {
  BETTER_AUTH_CLIENT,
  BETTER_AUTH_CLIENT_MODULE_LOADER,
  type BetterAuthClient,
  type SessionData,
  SessionService,
  type SessionUser,
} from './session-service'

function makeSession(overrides?: Partial<SessionData>): SessionData {
  return {
    session: {
      id: 'session-1',
      userId: 'user-1',
      expiresAt: '2026-03-16T12:00:00.000Z',
    },
    user: {
      id: 'user-1',
      email: 'nitoba@example.com',
      name: 'Nitoba',
      image: 'https://example.com/avatar.png',
      ...overrides?.user,
    } satisfies SessionUser,
    ...overrides,
  }
}

describe('SessionService', () => {
  const authClient = {
    getSession: vi.fn<() => Promise<SessionData | null>>(),
    signIn: vi.fn<(returnUrl?: string) => Promise<void>>(),
    signOut: vi.fn<() => Promise<void>>(),
  }

  beforeEach(() => {
    TestBed.resetTestingModule()
    betterAuthMocks.createAuthClient.mockReset()
    betterAuthMocks.getSession.mockReset()
    betterAuthMocks.signInSocial.mockReset()
    betterAuthMocks.signOut.mockReset()

    betterAuthMocks.createAuthClient.mockReturnValue({
      getSession: betterAuthMocks.getSession,
      signIn: { social: betterAuthMocks.signInSocial },
      signOut: betterAuthMocks.signOut,
    })

    authClient.getSession.mockReset()
    authClient.signIn.mockReset()
    authClient.signOut.mockReset()

    TestBed.configureTestingModule({
      providers: [{ provide: BETTER_AUTH_CLIENT, useValue: authClient }],
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('bootstraps the current session through the Better Auth client', async () => {
    const service = TestBed.inject(SessionService) as SessionService
    const session = makeSession()

    authClient.getSession.mockResolvedValue(session)

    expect(service.isLoading()).toBe(false)
    expect(service.hasResolvedSession()).toBe(false)
    expect(service.session()).toBeNull()
    expect(service.user()).toBeNull()

    const resolved = await service.bootstrap()

    expect(authClient.getSession).toHaveBeenCalledTimes(1)
    expect(resolved).toEqual(session)
    expect(service.session()).toEqual(session)
    expect(service.user()).toEqual(session.user)
    expect(service.isAuthenticated()).toBe(true)
    expect(service.hasResolvedSession()).toBe(true)
    expect(service.isLoading()).toBe(false)
  })

  it('clears the session when bootstrap resolves without an authenticated user', async () => {
    const service = TestBed.inject(SessionService) as SessionService
    const session = makeSession()

    authClient.getSession.mockResolvedValue(session)
    await service.bootstrap()

    authClient.getSession.mockResolvedValue(null)

    const resolved = await service.resolveSession()

    expect(resolved).toBeNull()
    expect(service.session()).toBeNull()
    expect(service.user()).toBeNull()
    expect(service.isAuthenticated()).toBe(false)
    expect(service.hasResolvedSession()).toBe(true)
  })

  it('redirects Discord sign-in through the Better Auth client', async () => {
    const service = TestBed.inject(SessionService) as SessionService

    await service.signIn('/dashboard')

    expect(authClient.signIn).toHaveBeenCalledWith('/dashboard')
  })

  it('signs out and clears the local session cache', async () => {
    const service = TestBed.inject(SessionService) as SessionService
    const session = makeSession()

    authClient.getSession.mockResolvedValue(session)
    await service.bootstrap()

    await service.signOut()

    expect(authClient.signOut).toHaveBeenCalledTimes(1)
    expect(service.session()).toBeNull()
    expect(service.user()).toBeNull()
    expect(service.isAuthenticated()).toBe(false)
    expect(service.hasResolvedSession()).toBe(true)
  })

  it('creates the default Better Auth browser adapter from better-auth/client', async () => {
    TestBed.resetTestingModule()
    TestBed.configureTestingModule({
      providers: [
        {
          provide: BETTER_AUTH_CLIENT_MODULE_LOADER,
          useValue: async () => ({
            createAuthClient: betterAuthMocks.createAuthClient,
          }),
        },
      ],
    })

    const client = TestBed.inject(BETTER_AUTH_CLIENT) as BetterAuthClient
    const session = makeSession()

    betterAuthMocks.getSession.mockResolvedValue({ data: session, error: null })
    betterAuthMocks.signInSocial.mockResolvedValue(undefined)
    betterAuthMocks.signOut.mockResolvedValue(undefined)

    await expect(client.getSession()).resolves.toEqual(session)
    await client.signIn('/dashboard')
    await client.signOut()

    expect(betterAuthMocks.createAuthClient).toHaveBeenCalledTimes(1)
    // In test build, environment.development.ts is used via fileReplacements
    expect(betterAuthMocks.createAuthClient).toHaveBeenCalledWith({
      baseURL: 'http://localhost:3333',
    })
    expect(betterAuthMocks.getSession).toHaveBeenCalledTimes(1)
    // callbackURL is resolved to absolute using window.location.origin
    // so Better Auth redirects back to the frontend, not the API origin
    expect(betterAuthMocks.signInSocial).toHaveBeenCalledWith({
      provider: 'discord',
      callbackURL: `${window.location.origin}/dashboard`,
    })
    expect(betterAuthMocks.signOut).toHaveBeenCalledTimes(1)
  })
})
