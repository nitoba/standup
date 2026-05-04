// apps/api/src/interfaces/discord/features/trigger/trigger-confirmation.buttons.ts
import { Injectable } from '@nestjs/common'
import { Button, type ButtonContext, ComponentParam, Context } from 'necord'
import { TriggerConfirmationService } from '../../handlers/trigger-confirmation.service'

@Injectable()
export class TriggerConfirmationButtons {
  constructor(private readonly trigger: TriggerConfirmationService) {}

  @Button('standup-trigger\\:confirm\\::requestId')
  public async onConfirm(
    @Context() [interaction]: ButtonContext,
    @ComponentParam('requestId') requestId: string,
  ) {
    await this.trigger.handleButton(interaction, 'confirm', requestId)
  }

  @Button('standup-trigger\\:cancel\\::requestId')
  public async onCancel(
    @Context() [interaction]: ButtonContext,
    @ComponentParam('requestId') requestId: string,
  ) {
    await this.trigger.handleButton(interaction, 'cancel', requestId)
  }
}
