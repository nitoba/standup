import { Injectable } from '@nestjs/common'
import { EnvService } from '../../../shared/env/env.service'
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
    private readonly env: EnvService,
    private readonly messages: DiscordMessagesService,
  ) {}

  listServices(filter: DiscordServiceName | 'all'): DiscordServiceHealth[] {
    const uptimeSeconds = Math.floor(process.uptime())
    const services: DiscordServiceHealth[] = []

    if (filter === 'all' || filter === 'api') {
      services.push({
        service: 'api',
        ok: true,
        latencyMs: 0,
        uptimeSeconds,
      })
    }

    if (filter === 'all' || filter === 'worker') {
      services.push({
        service: 'worker',
        ok: true,
        latencyMs: 0,
        uptimeSeconds,
        error: this.env.worker.schedulerEnabled
          ? undefined
          : 'Scheduler disabled by env',
      })
    }

    if (filter === 'all' || filter === 'bot') {
      services.push({
        service: 'bot',
        ok: this.messages.isReady(),
        latencyMs: 0,
        uptimeSeconds,
        error: this.messages.isReady()
          ? undefined
          : 'Discord gateway not ready',
      })
    }

    return services
  }
}
