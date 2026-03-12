import { getDb, UserRepository } from '@standup/db'
import { Result } from '@standup/domain'
import { createServiceLogger } from '@standup/logger'
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { notifyLoginComplete } from './notify-login-complete.js'

const logger = createServiceLogger({
  service: 'api',
  component: 'auth-hooks',
})

export interface AuthDeps {
  databaseUrl: string
  discordClientId: string
  discordClientSecret: string
  betterAuthSecret: string
  betterAuthUrl: string
  corsOrigin: string
  botInternalUrl: string
  internalSecret: string
}

/**
 * Cria a instancia do Better Auth configurada com Discord OAuth.
 * Deve ser chamada uma vez no bootstrap da API.
 */
export function createAuth(deps: AuthDeps) {
  const db = getDb(deps.databaseUrl)

  return betterAuth({
    database: drizzleAdapter(db, { provider: 'sqlite' }),
    secret: deps.betterAuthSecret,
    baseURL: deps.betterAuthUrl,
    trustedOrigins: [deps.corsOrigin],
    socialProviders: {
      discord: {
        clientId: deps.discordClientId,
        clientSecret: deps.discordClientSecret,
        permissions: 2048 | 16384, // Send Messages + Embed Links
      },
    },
    session: {
      expiresIn: 60 * 60 * 24 * 7, // 7 days
      updateAge: 60 * 60 * 24, // update session every 24h
    },
    databaseHooks: {
      session: {
        create: {
          after: async (sessionRecord) => {
            // Resolve internal userId -> Discord ID
            const repo = new UserRepository(db)
            const discordIdResult = await repo.findDiscordIdByUserId(
              sessionRecord.userId,
            )

            if (Result.isError(discordIdResult) || !discordIdResult.value) {
              return
            }

            logger.info('Session created, notifying bot', {
              userId: sessionRecord.userId,
              discordUserId: discordIdResult.value,
            })

            // Fire-and-forget — non-fatal
            notifyLoginComplete({
              botInternalUrl: deps.botInternalUrl,
              internalSecret: deps.internalSecret,
              discordUserId: discordIdResult.value,
            }).catch((err) => {
              logger.error(err)
            })
          },
        },
      },
    },
  })
}

export type Auth = ReturnType<typeof createAuth>
