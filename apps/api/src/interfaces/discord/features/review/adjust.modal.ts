// apps/api/src/interfaces/discord/features/review/adjust.modal.ts
import { Injectable } from '@nestjs/common'
import type { Client } from 'discord.js'
import { Context, Modal, type ModalContext } from 'necord'
import { ModalInteractionService } from '../../handlers/modal-interaction.service'

@Injectable()
export class AdjustModal {
  constructor(private readonly modals: ModalInteractionService) {}

  @Modal('standup-adjust-modal\\::standupId')
  public async onSubmit(@Context() [interaction]: ModalContext) {
    await this.modals.handle(interaction, interaction.client as Client)
  }
}
