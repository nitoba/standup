import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { Client, Events, GatewayIntentBits } from 'discord.js'
import { EnvService } from '../../shared/module/env/env.service'
import { AppLoggerFactory } from '../../shared/module/logger'

@Injectable()
export class DiscordClientService implements OnModuleInit, OnModuleDestroy {
  private readonly logger: ReturnType<AppLoggerFactory['create']>
  private client: Client | null = null

  constructor(
    private readonly loggerFactory: AppLoggerFactory,
    private readonly env: EnvService,
  ) {
    this.logger = this.loggerFactory.create('discord-client')
  }

  async onModuleInit(): Promise<void> {
    if (!this.env.discord.gatewayEnabled || !this.env.discord.token) {
      this.logger.warn(
        'Discord gateway desabilitado. O modulo permanece carregado, mas sem conexao ativa.',
      )
      return
    }

    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.MessageContent,
      ],
    })

    this.client.once(Events.ClientReady, () => {
      this.logger.info(
        `Discord conectado como ${this.client?.user?.tag ?? 'n/a'}`,
      )
    })

    this.client.on(Events.Error, (error) => {
      this.logger.error(error.message, error.stack)
    })

    await new Promise<void>((resolve, reject) => {
      this.client?.once(Events.ClientReady, () => resolve())
      this.client?.once(Events.Error, reject)
      this.client?.login(this.env.discord.token).catch(reject)
    })
  }

  async onModuleDestroy(): Promise<void> {
    if (!this.client) {
      return
    }

    await this.client.destroy()
    this.client = null
  }

  get currentClient(): Client | null {
    return this.client
  }

  get isReady(): boolean {
    return this.client?.isReady() ?? false
  }
}
