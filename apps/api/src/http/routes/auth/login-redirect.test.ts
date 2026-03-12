import { describe, expect, it, vi } from 'vitest'
import { handleDiscordLogin } from './login-redirect.js'

function makeFakeAuthResponse(url: string, cookies: string[] = []) {
  const body = JSON.stringify({ url, redirect: true })
  const headers = new Headers({ 'content-type': 'application/json' })
  for (const cookie of cookies) {
    headers.append('set-cookie', cookie)
  }
  return new Response(body, { status: 200, headers })
}

describe('handleDiscordLogin', () => {
  it('returns a 302 redirect with Set-Cookie forwarded from auth.handler', async () => {
    const oauthUrl =
      'https://discord.com/oauth2/authorize?client_id=test&state=abc'
    const stateCookie =
      'better-auth.state=abc123; Path=/api/auth; HttpOnly; SameSite=Lax'

    const handler = vi
      .fn()
      .mockResolvedValue(makeFakeAuthResponse(oauthUrl, [stateCookie]))
    const auth = { handler } as never
    const loginHandler = handleDiscordLogin(auth)

    const c = {
      req: {
        url: 'http://localhost:3333/auth/login/discord',
        header: vi.fn().mockReturnValue('existing-cookie=value'),
      },
      json: vi.fn(),
    }

    const response = await loginHandler(c as never)

    // Should have proxied a POST to /api/auth/sign-in/social
    expect(handler).toHaveBeenCalledTimes(1)
    const proxyRequest = handler.mock.calls[0]![0] as Request
    expect(proxyRequest.method).toBe('POST')
    expect(new URL(proxyRequest.url).pathname).toBe('/api/auth/sign-in/social')
    expect(proxyRequest.headers.get('content-type')).toBe('application/json')
    expect(proxyRequest.headers.get('origin')).toBe('http://localhost:3333')
    expect(proxyRequest.headers.get('cookie')).toBe('existing-cookie=value')

    const body = await proxyRequest.json()
    expect(body).toEqual({
      provider: 'discord',
      callbackURL: '/auth/callback',
    })

    // Should return a real 302 redirect (not JSON)
    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toBe(oauthUrl)
    expect(response.headers.get('set-cookie')).toContain(
      'better-auth.state=abc123',
    )
  })

  it('returns 500 when auth.handler response has no URL', async () => {
    const emptyResponse = new Response(JSON.stringify({}), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
    const handler = vi.fn().mockResolvedValue(emptyResponse)
    const auth = { handler } as never
    const loginHandler = handleDiscordLogin(auth)

    const jsonMock = vi
      .fn()
      .mockImplementation((body: unknown, status: number) =>
        Response.json(body, { status }),
      )

    const c = {
      req: {
        url: 'http://localhost:3333/auth/login/discord',
        header: vi.fn().mockReturnValue(undefined),
      },
      json: jsonMock,
    }

    await loginHandler(c as never)

    expect(jsonMock).toHaveBeenCalledWith(
      { error: 'Failed to initiate Discord OAuth' },
      500,
    )
  })

  it('forwards cookie header when present', async () => {
    const handler = vi
      .fn()
      .mockResolvedValue(
        makeFakeAuthResponse('https://discord.com/oauth2/authorize'),
      )
    const auth = { handler } as never
    const loginHandler = handleDiscordLogin(auth)

    const c = {
      req: {
        url: 'http://localhost:3333/auth/login/discord',
        header: vi.fn().mockReturnValue('session-token=xyz'),
      },
    }

    await loginHandler(c as never)

    const proxyRequest = handler.mock.calls[0]![0] as Request
    expect(proxyRequest.headers.get('cookie')).toBe('session-token=xyz')
  })

  it('omits cookie header when not present', async () => {
    const handler = vi
      .fn()
      .mockResolvedValue(
        makeFakeAuthResponse('https://discord.com/oauth2/authorize'),
      )
    const auth = { handler } as never
    const loginHandler = handleDiscordLogin(auth)

    const c = {
      req: {
        url: 'http://localhost:3333/auth/login/discord',
        header: vi.fn().mockReturnValue(undefined),
      },
    }

    await loginHandler(c as never)

    const proxyRequest = handler.mock.calls[0]![0] as Request
    expect(proxyRequest.headers.get('cookie')).toBeNull()
  })
})
