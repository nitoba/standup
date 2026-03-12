/**
 * Better Auth user object set by sessionAuthMiddleware.
 * Only `id` is guaranteed; other fields vary by provider.
 */
export interface AuthUser {
  id: string
  [key: string]: unknown
}

export type AppContext = {
  Variables: {
    requestId: string
    /** undefined when request bypasses auth (internal service calls) */
    user: AuthUser | undefined
    session: Record<string, unknown>
  }
}
