import { describe, expect, it, vi } from 'vitest'
import { handleDiscordLogin } from './login-redirect.js'

function makeContext() {
  const redirect = vi.fn((url: string, status?: number) => ({ url, status }))
  const json = vi.fn((body: unknown, status: number) => ({ body, status }))

  return {
    c: {
      redirect,
      json,
    },
    redirect,
    json,
  }
}

describe('handleDiscordLogin', () => {
  it('redirects to the Discord OAuth URL returned by Better Auth', async () => {
    const signInSocial = vi.fn().mockResolvedValue({
      url: 'https://discord.com/oauth2/authorize?client_id=test',
    })
    const { c, redirect } = makeContext()

    const handler = handleDiscordLogin({
      api: { signInSocial },
    } as never)

    const response = await handler(c as never)

    expect(signInSocial).toHaveBeenCalledTimes(1)
    expect(signInSocial).toHaveBeenCalledWith({
      body: {
        provider: 'discord',
        callbackURL: '/auth/callback',
      },
    })
    expect(redirect).toHaveBeenCalledWith(
      'https://discord.com/oauth2/authorize?client_id=test',
    )
    expect(response).toEqual({
      url: 'https://discord.com/oauth2/authorize?client_id=test',
      status: undefined,
    })
  })

  it('returns 500 when Better Auth does not provide a redirect URL', async () => {
    const signInSocial = vi.fn().mockResolvedValue({})
    const { c, json, redirect } = makeContext()

    const handler = handleDiscordLogin({
      api: { signInSocial },
    } as never)

    const response = await handler(c as never)

    expect(signInSocial).toHaveBeenCalledTimes(1)
    expect(redirect).not.toHaveBeenCalled()
    expect(json).toHaveBeenCalledWith(
      { error: 'Failed to initiate Discord OAuth' },
      500,
    )
    expect(response).toEqual({
      body: { error: 'Failed to initiate Discord OAuth' },
      status: 500,
    })
  })
})
