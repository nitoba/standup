import { Controller, Get, ServiceUnavailableException } from '@nestjs/common'
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger'
import { AllowAnonymous } from '@thallesp/nestjs-better-auth'
import { sql } from 'drizzle-orm'
import { DiscordMessagesService } from '../../../interfaces/discord/notifications/discord-messages.service'
import { DatabaseService } from '../../database/database.service'
import { user } from '../../database/schema'
import { EnvService } from '../../env/env.service'

@AllowAnonymous()
@ApiTags('infra')
@Controller()
export class HealthController {
  constructor(
    private readonly database: DatabaseService,
    private readonly env: EnvService,
    private readonly discordMessages: DiscordMessagesService,
  ) {}

  @Get('health')
  @ApiOperation({ summary: 'Verifica se a API está saudável' })
  @ApiOkResponse({ description: 'Estado básico da aplicação.' })
  getHealth() {
    return {
      status: 'ok',
      service: 'standup-api',
      uptimeSeconds: Math.floor(process.uptime()),
    }
  }

  @Get('ready')
  @ApiOperation({
    summary: 'Verifica se a API está pronta para receber tráfego',
  })
  @ApiOkResponse({ description: 'Prontidão da aplicação.' })
  async getReady() {
    let databaseStatus: 'ok' | 'error' = 'ok'
    let discordStatus: 'ok' | 'error' | 'disabled' = 'disabled'

    try {
      const health = await this.database.db
        .select({ count: sql<number>`count(*)` })
        .from(user)
        .get()

      if (typeof health?.count !== 'number') {
        throw new Error('Database health query returned an unexpected value')
      }
    } catch {
      databaseStatus = 'error'
    }

    if (this.env.discord.gatewayEnabled) {
      discordStatus = this.discordMessages.isReady() ? 'ok' : 'error'
    }

    if (databaseStatus === 'error' || discordStatus === 'error') {
      throw new ServiceUnavailableException({
        status: 'not_ready',
        database: databaseStatus,
        discord: discordStatus,
      })
    }

    return {
      status: 'ready',
      database: databaseStatus,
      discord: discordStatus,
    }
  }
}
