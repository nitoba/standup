// apps/api/src/interfaces/discord/features/settings/settings.modal.ts
import { Injectable } from '@nestjs/common'
import { Context, Modal, type ModalContext } from 'necord'
import { SettingsInteractionService } from '../../handlers/settings-interaction.service'

@Injectable()
export class SettingsModal {
  constructor(private readonly settings: SettingsInteractionService) {}

  @Modal('settings-modal:edit')
  public async onSubmit(@Context() [interaction]: ModalContext) {
    await this.settings.handleModal(interaction)
  }
}
