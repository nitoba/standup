import type { Context } from 'hono'
import type { Auth } from './auth.js'

/**
 * GET /auth/login/discord
 *
 * Convenience endpoint for Discord bot login links.
 * Proxies a POST to Better Auth's /api/auth/sign-in/social, extracts the
 * OAuth redirect URL from the JSON response, and returns a proper 302
 * redirect with the Set-Cookie headers (state token) forwarded to the browser.
 *
 * After OAuth, the user is redirected back to /auth/callback (success page).
 */
export function handleDiscordLogin(auth: Auth) {
  return async (c: Context): Promise<Response> => {
    const origin = new URL(c.req.url).origin

    // Build a POST request to Better Auth's sign-in endpoint.
    // We forward the original Cookie and Origin headers.
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      origin,
    }
    const cookie = c.req.header('cookie')
    if (cookie) {
      headers.cookie = cookie
    }

    const proxyRequest = new Request(`${origin}/api/auth/sign-in/social`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        provider: 'discord',
        callbackURL: '/auth/callback',
      }),
    })

    // Better Auth returns JSON { url, redirect: true } + Set-Cookie headers
    // when Content-Type is application/json (expects client-side redirect).
    // We extract the URL and build a real 302 so the browser redirects.
    const authResponse = await auth.handler(proxyRequest)

    const body = (await authResponse.json()) as { url?: string }

    if (!body.url) {
      return c.json({ error: 'Failed to initiate Discord OAuth' }, 500)
    }

    // Build a 302 redirect, forwarding all Set-Cookie headers from Better Auth
    const redirectResponse = new Response(null, {
      status: 302,
      headers: { location: body.url },
    })

    const setCookies = authResponse.headers.getSetCookie()
    for (const value of setCookies) {
      redirectResponse.headers.append('set-cookie', value)
    }

    return redirectResponse
  }
}
