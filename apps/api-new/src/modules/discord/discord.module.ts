import { Module } from '@nestjs/common'
import { DatabaseModule } from '../../shared/database/database.module'
import { CommandRegistrationService } from './commands/command-registration.service'
import { DiscordClientService } from './discord-client.service'
import { ButtonInteractionService } from './handlers/button-interaction.service'
import { CopyInteractionService } from './handlers/copy-interaction.service'
import { ModalInteractionService } from './handlers/modal-interaction.service'
import { ReminderInteractionService } from './handlers/reminder-interaction.service'
import { SettingsInteractionService } from './handlers/settings-interaction.service'
import { SlashCommandHandlerService } from './handlers/slash-command-handler.service'
import { StandupInteractionService } from './handlers/standup-interaction.service'
import { TriggerConfirmationService } from './handlers/trigger-confirmation.service'
import { DiscordGatewayService } from './listeners/discord-gateway.service'
import { DiscordMessagesService } from './notifications/discord-messages.service'
import { DiscordAuthService } from './services/discord-auth.service'
import { DiscordAvailableReposService } from './services/discord-available-repos.service'
import { DiscordServiceHealthService } from './services/discord-service-health.service'
import { DiscordTriggerService } from './services/discord-trigger.service'
import { StandupNotificationService } from './services/standup-notification.service'
import { StandupStatusSyncService } from './services/standup-status-sync.service'

@Module({
  imports: [DatabaseModule],
  providers: [
    DiscordClientService,
    DiscordMessagesService,
    DiscordAuthService,
    DiscordAvailableReposService,
    DiscordServiceHealthService,
    DiscordTriggerService,
    StandupNotificationService,
    StandupStatusSyncService,
    CommandRegistrationService,
    CopyInteractionService,
    ReminderInteractionService,
    SettingsInteractionService,
    StandupInteractionService,
    TriggerConfirmationService,
    ButtonInteractionService,
    ModalInteractionService,
    SlashCommandHandlerService,
    DiscordGatewayService,
  ],
  exports: [
    DiscordClientService,
    DiscordMessagesService,
    StandupStatusSyncService,
  ],
})
export class DiscordModule {}
