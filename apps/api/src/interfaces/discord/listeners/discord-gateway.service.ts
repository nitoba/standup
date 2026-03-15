import { Injectable, OnApplicationBootstrap } from '@nestjs/common'
import { Events } from 'discord.js'
import { AppLoggerFactory } from '../../../platform/logger'
import { CommandRegistrationService } from '../commands/command-registration.service'
import { DiscordClientService } from '../discord-client.service'
import { ButtonInteractionService } from '../handlers/button-interaction.service'
import { ModalInteractionService } from '../handlers/modal-interaction.service'
import { SlashCommandHandlerService } from '../handlers/slash-command-handler.service'

@Injectable()
export class DiscordGatewayService implements OnApplicationBootstrap {
  private readonly logger: ReturnType<AppLoggerFactory['create']>
  private interactionsBound = false

  constructor(
    private readonly loggerFactory: AppLoggerFactory,
    private readonly discordClient: DiscordClientService,
    private readonly commands: CommandRegistrationService,
    private readonly slashCommands: SlashCommandHandlerService,
    private readonly buttonInteractions: ButtonInteractionService,
    private readonly modalInteractions: ModalInteractionService,
  ) {
    this.logger = this.loggerFactory.create('discord-gateway')
  }

  onApplicationBootstrap(): void {
    const client = this.discordClient.currentClient
    if (!client) {
      this.logger.warn(
        'Discord gateway disabled, interaction listeners were skipped',
      )
      return
    }

    if (!this.interactionsBound) {
      this.interactionsBound = true
      client.on(Events.InteractionCreate, async (interaction) => {
        try {
          if (interaction.isChatInputCommand()) {
            await this.slashCommands.handle(interaction, client)
            return
          }

          if (interaction.isButton()) {
            await this.buttonInteractions.handle(interaction)
            return
          }

          if (interaction.isModalSubmit()) {
            await this.modalInteractions.handle(interaction, client)
          }
        } catch (error) {
          this.logger.error('Unhandled Discord interaction error', {
            interactionId: interaction.id,
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
          })
        }
      })
    }

    if (client.isReady()) {
      void this.commands.register(client)
      return
    }

    client.once(Events.ClientReady, () => {
      void this.commands.register(client)
    })
  }
}
