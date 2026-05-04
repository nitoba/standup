import { NecordPaginationModule } from '@necord/pagination'
import { forwardRef, Module } from '@nestjs/common'
import { APP_FILTER } from '@nestjs/core'
import { GatewayIntentBits } from 'discord.js'
import { NecordModule } from 'necord'
import { StandupsModule } from '../../contexts/standups/standups.module'
import { DatabaseModule } from '../../platform/database/database.module'
import { EnvModule } from '../../platform/env/env.module'
import { EnvService } from '../../platform/env/env.service'
import { DiscordClientService } from './discord-client.service'
import { ApproveSubcommand } from './features/approve/approve.subcommand'
import { LoginCommand } from './features/auth/login.command'
import { LogoutCommand } from './features/auth/logout.command'
import { CopyButton } from './features/copy/copy.button'
import { ListSubcommand } from './features/list/list.subcommand'
import { ReminderButtons } from './features/reminder/reminder.buttons'
import { RetrySubcommand } from './features/retry/retry.subcommand'
import { AdjustModal } from './features/review/adjust.modal'
import { ReviewButtons } from './features/review/review.buttons'
import { ServicesSubcommand } from './features/services/services.subcommand'
import { SettingsModal } from './features/settings/settings.modal'
import { SettingsSubcommand } from './features/settings/settings.subcommand'
import { TriggerSubcommand } from './features/trigger/trigger.subcommand'
import { TriggerConfirmationButtons } from './features/trigger/trigger-confirmation.buttons'
import { ButtonInteractionService } from './handlers/button-interaction.service'
import { CommandCooldownService } from './handlers/command-cooldown.service'
import { CopyInteractionService } from './handlers/copy-interaction.service'
import { ModalInteractionService } from './handlers/modal-interaction.service'
import { ReminderInteractionService } from './handlers/reminder-interaction.service'
import { SettingsInteractionService } from './handlers/settings-interaction.service'
import { StandupInteractionService } from './handlers/standup-interaction.service'
import { TriggerConfirmationService } from './handlers/trigger-confirmation.service'
import { DiscordStreamingListener } from './listeners/discord-streaming.listener'
import { DiscordMessagesService } from './notifications/discord-messages.service'
import { DiscordAuthService } from './services/discord-auth.service'
import { DiscordAvailableReposService } from './services/discord-available-repos.service'
import { DiscordServiceHealthService } from './services/discord-service-health.service'
import { DiscordTriggerService } from './services/discord-trigger.service'
import { StandupNotificationService } from './services/standup-notification.service'
import { StandupStatusSyncService } from './services/standup-status-sync.service'
import { DiscordExceptionFilter } from './shared/filters/discord-exception.filter'
import { DiscordUserLinkedGuard } from './shared/guards/discord-user-linked.guard'
import { CooldownInterceptor } from './shared/interceptors/cooldown.interceptor'

const gatewayEnv = process.env.DISCORD_GATEWAY_ENABLED
const shouldLoadNecord =
  gatewayEnv !== 'false' &&
  gatewayEnv !== '0' &&
  Boolean(process.env.DISCORD_BOT_TOKEN)

const necordImports = shouldLoadNecord
  ? [
      NecordModule.forRootAsync({
        imports: [EnvModule],
        inject: [EnvService],
        useFactory: (env: EnvService) => ({
          token: env.discord.token ?? '',
          intents: [
            GatewayIntentBits.Guilds,
            GatewayIntentBits.GuildMessages,
            GatewayIntentBits.DirectMessages,
          ],
          development: env.discord.guildId ? [env.discord.guildId] : false,
          skipRegistration: !env.discord.gatewayEnabled,
        }),
      }),
      NecordPaginationModule.forRoot({
        allowSkip: true,
        allowTraversal: true,
        buttonsPosition: 'end',
      }),
    ]
  : []

@Module({
  imports: [
    DatabaseModule,
    EnvModule,
    forwardRef(() => StandupsModule),
    ...necordImports,
  ],
  providers: [
    LoginCommand,
    LogoutCommand,
    TriggerSubcommand,
    ListSubcommand,
    ApproveSubcommand,
    SettingsSubcommand,
    ServicesSubcommand,
    RetrySubcommand,
    TriggerConfirmationButtons,
    SettingsModal,
    ReviewButtons,
    AdjustModal,
    ReminderButtons,
    CopyButton,
    DiscordUserLinkedGuard,
    CooldownInterceptor,
    { provide: APP_FILTER, useClass: DiscordExceptionFilter },
    DiscordStreamingListener,
    DiscordClientService,
    DiscordMessagesService,
    DiscordAuthService,
    DiscordAvailableReposService,
    DiscordServiceHealthService,
    DiscordTriggerService,
    StandupNotificationService,
    StandupStatusSyncService,
    CommandCooldownService,
    CopyInteractionService,
    ReminderInteractionService,
    SettingsInteractionService,
    TriggerConfirmationService,
    StandupInteractionService,
    ButtonInteractionService,
    ModalInteractionService,
  ],
  exports: [
    DiscordClientService,
    DiscordMessagesService,
    StandupStatusSyncService,
  ],
})
export class DiscordModule {}
