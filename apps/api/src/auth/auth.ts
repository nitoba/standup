import { getDb } from '@standup/db'
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'

export interface AuthDeps {
  databaseUrl: string
  discordClientId: string
  discordClientSecret: string
  betterAuthSecret: string
  betterAuthUrl: string
}

/**
 * Cria a instância do Better Auth configurada com Discord OAuth.
 * Deve ser chamada uma vez no bootstrap da API.
 */
export function createAuth(deps: AuthDeps) {
  const db = getDb(deps.databaseUrl)

  return betterAuth({
    database: drizzleAdapter(db, { provider: 'sqlite' }),
    secret: deps.betterAuthSecret,
    baseURL: deps.betterAuthUrl,
    socialProviders: {
      discord: {
        clientId: deps.discordClientId,
        clientSecret: deps.discordClientSecret,
      },
    },
    session: {
      expiresIn: 60 * 60 * 24 * 7, // 7 days
      updateAge: 60 * 60 * 24, // update session every 24h
    },
  })
}

export type Auth = ReturnType<typeof createAuth>
