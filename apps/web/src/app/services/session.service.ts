import {
  computed,
  Injectable,
  InjectionToken,
  inject,
  signal,
} from '@angular/core'

import { environment } from '../../environments/environment'

type BetterAuthSessionResult = {
  data?: unknown
  error?: Error | null
}

type BetterAuthSocialSignInOptions = {
  provider: 'discord'
  callbackURL?: string
}

type BetterAuthBrowserClientInstance = {
  getSession(): Promise<BetterAuthSessionResult>
  signIn: {
    social(options: BetterAuthSocialSignInOptions): Promise<unknown>
  }
  signOut(): Promise<unknown>
}

type BetterAuthClientModule = {
  createAuthClient(options?: {
    baseURL?: string
  }): BetterAuthBrowserClientInstance
}

export interface SessionUser {
  id: string
  email?: string | null
  name?: string | null
  image?: string | null
  [key: string]: unknown
}

export interface SessionRecord {
  id: string
  userId: string
  expiresAt: string
  [key: string]: unknown
}

export interface SessionData {
  session: SessionRecord
  user: SessionUser
}

export interface BetterAuthClient {
  getSession(): Promise<SessionData | null>
  signIn(returnUrl?: string): Promise<void>
  signOut(): Promise<void>
}

export const BETTER_AUTH_CLIENT = new InjectionToken<BetterAuthClient>(
  'BETTER_AUTH_CLIENT',
  {
    providedIn: 'root',
    factory: () => createBetterAuthBrowserClient(),
  },
)

@Injectable({ providedIn: 'root' })
export class SessionService {
  private readonly authClient = inject(BETTER_AUTH_CLIENT)
  private readonly sessionState = signal<SessionData | null>(null)
  private readonly loadingState = signal(false)
  private readonly resolvedState = signal(false)

  readonly session = this.sessionState.asReadonly()
  readonly isLoading = this.loadingState.asReadonly()
  readonly hasResolvedSession = this.resolvedState.asReadonly()
  readonly user = computed(() => this.sessionState()?.user ?? null)
  readonly isAuthenticated = computed(() => this.session() !== null)

  bootstrap() {
    return this.resolveSession()
  }

  async resolveSession() {
    this.loadingState.set(true)

    try {
      const session = await this.authClient.getSession()
      this.sessionState.set(session)
      return session
    } catch {
      return null
    } finally {
      this.resolvedState.set(true)
      this.loadingState.set(false)
    }
  }

  signIn(returnUrl?: string) {
    return this.authClient.signIn(returnUrl)
  }

  async signOut() {
    await this.authClient.signOut()
    this.clearSession()
  }

  clearSession() {
    this.sessionState.set(null)
  }
}

function createBetterAuthBrowserClient(): BetterAuthClient {
  let authClientPromise: Promise<BetterAuthBrowserClientInstance> | null = null

  const getAuthClient = async () => {
    authClientPromise ??= importBetterAuthClient().then(
      ({ createAuthClient }) =>
        createAuthClient(
          environment.apiBaseUrl
            ? { baseURL: environment.apiBaseUrl }
            : undefined,
        ),
    )

    return authClientPromise
  }

  return {
    async getSession() {
      const authClient = await getAuthClient()
      const { data, error } = await authClient.getSession()

      if (error) {
        throw error
      }

      return readSessionData(data)
    },

    async signIn(returnUrl?: string) {
      const authClient = await getAuthClient()
      // Build absolute callbackURL so Better Auth redirects back to the
      // frontend origin, not the API origin (they differ in dev).
      const callbackURL = returnUrl
        ? `${window.location.origin}${returnUrl}`
        : window.location.origin
      await authClient.signIn.social({
        provider: 'discord',
        callbackURL,
      })
    },

    async signOut() {
      const authClient = await getAuthClient()
      await authClient.signOut()
    },
  }
}

const importBetterAuthClient = () =>
  import('better-auth/client') as Promise<BetterAuthClientModule>

function readSessionData(payload: unknown): SessionData | null {
  if (!payload || typeof payload !== 'object') {
    return null
  }

  // Try direct shape first, then nested under .data
  const candidates = [payload, (payload as { data?: unknown }).data]

  for (const candidate of candidates) {
    const result = extractSessionData(candidate)
    if (result) return result
  }

  return null
}

/**
 * Extracts session data from a Better Auth response object.
 * Tolerant of field variations: accepts both string and Date for expiresAt,
 * and treats any object with session.id + user.id as valid.
 */
function extractSessionData(value: unknown): SessionData | null {
  if (!value || typeof value !== 'object') {
    return null
  }

  const candidate = value as {
    session?: Record<string, unknown>
    user?: Record<string, unknown>
  }

  if (
    !candidate.session ||
    typeof candidate.session !== 'object' ||
    !candidate.user ||
    typeof candidate.user !== 'object'
  ) {
    return null
  }

  const sessionId = candidate.session['id']
  const userId = candidate.session['userId'] ?? candidate.session['user_id']
  const expiresAtRaw =
    candidate.session['expiresAt'] ?? candidate.session['expires_at']
  const userIdFromUser = candidate.user['id']

  if (
    typeof sessionId !== 'string' ||
    !userId ||
    !userIdFromUser ||
    typeof userIdFromUser !== 'string'
  ) {
    return null
  }

  // Normalize expiresAt to string (Better Auth may return Date object)
  const expiresAt =
    expiresAtRaw instanceof Date
      ? expiresAtRaw.toISOString()
      : typeof expiresAtRaw === 'string'
        ? expiresAtRaw
        : ''

  return {
    session: {
      id: sessionId,
      userId: String(userId),
      expiresAt,
      ...candidate.session,
    },
    user: {
      id: userIdFromUser,
      email: (candidate.user['email'] as string) ?? null,
      name: (candidate.user['name'] as string) ?? null,
      image: (candidate.user['image'] as string) ?? null,
      ...candidate.user,
    },
  }
}
