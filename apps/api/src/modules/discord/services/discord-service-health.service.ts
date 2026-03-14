import { access } from 'node:fs/promises'
import { Injectable } from '@nestjs/common'
import { sql } from 'drizzle-orm'
import { DatabaseService } from '../../../shared/module/database/database.service'
import { user } from '../../../shared/module/database/schema'
import { EnvService } from '../../../shared/module/env/env.service'
import { DiscordMessagesService } from '../notifications/discord-messages.service'

export type DiscordServiceName = 'api' | 'worker' | 'bot'

export interface DiscordServiceHealth {
  service: DiscordServiceName
  ok: boolean
  latencyMs: number
  uptimeSeconds: number
  error?: string
}

@Injectable()
export class DiscordServiceHealthService {
  constructor(
    private readonly database: DatabaseService,
    private readonly env: EnvService,
    private readonly messages: DiscordMessagesService,
  ) {}

  async listServices(
    filter: DiscordServiceName | 'all',
  ): Promise<DiscordServiceHealth[]> {
    const uptimeSeconds = Math.floor(process.uptime())
    const services: Promise<DiscordServiceHealth>[] = []

    if (filter === 'all' || filter === 'api') {
      services.push(
        this.measure('api', uptimeSeconds, async () => {
          const health = await this.database.db
            .select({ count: sql<number>`count(*)` })
            .from(user)
            .get()

          if (typeof health?.count !== 'number') {
            throw new Error(
              'Database health query returned an unexpected value',
            )
          }
        }),
      )
    }

    if (filter === 'all' || filter === 'worker') {
      services.push(
        this.measure('worker', uptimeSeconds, async () => {
          if (!this.env.worker.schedulerEnabled) {
            throw new Error('Scheduler disabled by env')
          }

          if (!this.env.worker.reposRootPath) {
            throw new Error('REPOS_ROOT_PATH not configured')
          }

          await access(this.env.worker.reposRootPath)

          const health = await this.database.db
            .select({ count: sql<number>`count(*)` })
            .from(user)
            .get()

          if (typeof health?.count !== 'number') {
            throw new Error(
              'Database health query returned an unexpected value',
            )
          }
        }),
      )
    }

    if (filter === 'all' || filter === 'bot') {
      services.push(
        this.measure('bot', uptimeSeconds, async () => {
          if (!this.env.discord.gatewayEnabled) {
            throw new Error('Discord gateway disabled by env')
          }

          if (!this.env.discord.token) {
            throw new Error('DISCORD_BOT_TOKEN not configured')
          }

          if (!this.env.discord.channelId) {
            throw new Error('DISCORD_CHANNEL_ID not configured')
          }

          if (!this.messages.isReady()) {
            throw new Error('Discord gateway not ready')
          }
        }),
      )
    }

    return Promise.all(services)
  }

  private async measure(
    service: DiscordServiceName,
    uptimeSeconds: number,
    check: () => Promise<void>,
  ): Promise<DiscordServiceHealth> {
    const startedAt = Date.now()

    try {
      await check()

      return {
        service,
        ok: true,
        latencyMs: Date.now() - startedAt,
        uptimeSeconds,
      }
    } catch (error) {
      return {
        service,
        ok: false,
        latencyMs: Date.now() - startedAt,
        uptimeSeconds,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }
}
