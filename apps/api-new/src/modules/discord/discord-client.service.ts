import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common'
import { Client, Events, GatewayIntentBits } from 'discord.js'
import { EnvService } from '../../shared/env/env.service'

@Injectable()
export class DiscordClientService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DiscordClientService.name)
  private client: Client | null = null

  constructor(private readonly env: EnvService) {}

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
      this.logger.log(
        `Discord conectado como ${this.client?.user?.tag ?? 'n/a'}`,
      )
    })

    this.client.on(Events.Error, (error) => {
      this.logger.error(error.message, error.stack)
    })

    await this.client.login(this.env.discord.token)
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
}
