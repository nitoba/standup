import { Injectable } from '@nestjs/common'
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { DatabaseService } from '../../shared/module/database/database.service'
import { EnvService } from '../../shared/module/env/env.service'

@Injectable()
export class BetterAuthFactory {
  constructor(
    private readonly env: EnvService,
    private readonly database: DatabaseService,
  ) {}

  create() {
    const socialProviders =
      this.env.auth.discordClientId && this.env.auth.discordClientSecret
        ? {
            discord: {
              clientId: this.env.auth.discordClientId,
              clientSecret: this.env.auth.discordClientSecret,
              permissions: 2048 | 16384,
            },
          }
        : {}

    return betterAuth({
      appName: 'Standup',
      database: drizzleAdapter(this.database.db, { provider: 'sqlite' }),
      secret: this.env.auth.secret,
      baseURL: this.env.auth.baseUrl,
      trustedOrigins: [this.env.app.corsOrigin],
      socialProviders,
      advanced: {
        cookiePrefix: 'standup',
      },
      session: {
        expiresIn: 60 * 60 * 24 * 7,
        updateAge: 60 * 60 * 24,
      },
      hooks: {},
    })
  }
}
