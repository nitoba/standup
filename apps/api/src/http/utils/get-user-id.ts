/**
 * Extracts the authenticated user's ID from the Hono context.
 * Returns undefined when the request bypasses auth (internal service calls).
 *
 * Accepts a loose context type so it works with both `Hono<AppContext>`
 * and the generic `Hono<any>` used by individual route registrations.
 */
export function getUserId(c: {
  get: (key: string) => unknown
}): string | undefined {
  const user = c.get('user') as { id?: unknown } | undefined
  return typeof user?.id === 'string' ? user.id : undefined
}
