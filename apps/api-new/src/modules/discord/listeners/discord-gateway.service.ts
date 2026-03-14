import { Injectable, OnApplicationBootstrap } from '@nestjs/common'
import { createServiceLogger } from '@standup/logger'
import { Events } from 'discord.js'
import { CommandRegistrationService } from '../commands/command-registration.service'
import { DiscordClientService } from '../discord-client.service'
import { ButtonInteractionService } from '../handlers/button-interaction.service'
import { ModalInteractionService } from '../handlers/modal-interaction.service'
import { SlashCommandHandlerService } from '../handlers/slash-command-handler.service'

const logger = createServiceLogger({
  service: 'api-new',
  component: 'discord-gateway',
})

@Injectable()
export class DiscordGatewayService implements OnApplicationBootstrap {
  private interactionsBound = false

  constructor(
    private readonly discordClient: DiscordClientService,
    private readonly commands: CommandRegistrationService,
    private readonly slashCommands: SlashCommandHandlerService,
    private readonly buttonInteractions: ButtonInteractionService,
    private readonly modalInteractions: ModalInteractionService,
  ) {}

  onApplicationBootstrap(): void {
    const client = this.discordClient.currentClient
    if (!client) {
      logger.warn(
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
          logger.error('Unhandled Discord interaction error', {
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
