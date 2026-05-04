import { Injectable } from '@nestjs/common'
import { Button, type ButtonContext, ComponentParam, Context } from 'necord'
import { SettingsInteractionService } from '../../handlers/settings-interaction.service'

function isSettingsAction(action: string): action is 'edit' | 'toggle' {
  return action === 'edit' || action === 'toggle'
}

@Injectable()
export class SettingsButtons {
  constructor(private readonly settings: SettingsInteractionService) {}

  @Button('settings\\::action')
  public async onSettingsButton(
    @Context() [interaction]: ButtonContext,
    @ComponentParam('action') action: string,
  ) {
    if (!isSettingsAction(action)) {
      return
    }

    await this.settings.handleButton(interaction, action)
  }
}
