import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { EnvironmentVariables } from './env.types'

@Injectable()
export class EnvService {
  constructor(
    private readonly configService: ConfigService<EnvironmentVariables, true>,
  ) {}

  get app() {
    return {
      nodeEnv: this.get('NODE_ENV'),
      port: this.get('PORT'),
      corsOrigin: this.get('CORS_ORIGIN'),
      appUrl: this.get('APP_URL'),
    }
  }

  get auth() {
    return {
      secret: this.get('BETTER_AUTH_SECRET'),
      baseUrl: this.get('BETTER_AUTH_URL'),
      discordClientId: this.get('DISCORD_CLIENT_ID'),
      discordClientSecret: this.get('DISCORD_CLIENT_SECRET'),
      internalSecret: this.get('INTERNAL_SECRET'),
    }
  }

  get database() {
    return {
      url: this.get('DATABASE_URL'),
      authToken: this.get('DATABASE_AUTH_TOKEN'),
    }
  }

  get discord() {
    return {
      gatewayEnabled: this.get('DISCORD_GATEWAY_ENABLED'),
      token: this.get('DISCORD_BOT_TOKEN'),
      channelId: this.get('DISCORD_CHANNEL_ID'),
      guildId: this.get('DISCORD_GUILD_ID'),
    }
  }

  get worker() {
    return {
      schedulerEnabled: this.get('SCHEDULER_ENABLED'),
      reposRootPath: this.get('REPOS_ROOT_PATH'),
      aiProviderApiKey: this.get('AI_PROVIDER_API_KEY'),
      azureDevopsOrg: this.get('AZURE_DEVOPS_ORG'),
      azureDevopsPat: this.get('AZURE_DEVOPS_PAT'),
      azureDevopsDefaultProject: this.get('AZURE_DEVOPS_DEFAULT_PROJECT'),
    }
  }

  get smtp() {
    return {
      host: this.get('SMTP_HOST'),
      port: this.get('SMTP_PORT'),
      user: this.get('SMTP_USER'),
      pass: this.get('SMTP_PASS'),
      from: this.get('SMTP_FROM'),
      secure: this.get('SMTP_SECURE'),
    }
  }

  get<K extends keyof EnvironmentVariables>(key: K): EnvironmentVariables[K] {
    return this.configService.get(key, { infer: true })
  }
}
