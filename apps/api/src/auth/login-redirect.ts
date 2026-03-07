import type { Context } from 'hono'
import type { Auth } from './auth.js'

/**
 * GET /auth/login/discord
 *
 * Convenience endpoint for Discord bot login links.
 * Initiates the Discord OAuth flow by calling Better Auth's social sign-in
 * and redirecting the user to Discord's authorization page.
 *
 * After OAuth, the user is redirected back to /auth/callback (success page).
 */
export function handleDiscordLogin(auth: Auth) {
  return async (c: Context): Promise<Response> => {
    const callbackURL = '/auth/callback'

    // Use Better Auth's internal API to get the OAuth redirect URL
    const response = await auth.api.signInSocial({
      body: {
        provider: 'discord',
        callbackURL,
      },
    })

    if (response?.url) {
      return c.redirect(response.url)
    }

    return c.json({ error: 'Failed to initiate Discord OAuth' }, 500)
  }
}
