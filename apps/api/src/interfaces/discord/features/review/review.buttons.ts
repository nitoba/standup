// apps/api/src/interfaces/discord/features/review/review.buttons.ts
import { Injectable } from '@nestjs/common'
import { Button, type ButtonContext, Context } from 'necord'
import { ButtonInteractionService } from '../../handlers/button-interaction.service'

@Injectable()
export class ReviewButtons {
  constructor(private readonly buttons: ButtonInteractionService) {}

  @Button('standup\\:approve\\::standupId')
  public async onApprove(@Context() [interaction]: ButtonContext) {
    await this.buttons.handle(interaction)
  }

  @Button('standup\\:reject\\::standupId')
  public async onReject(@Context() [interaction]: ButtonContext) {
    await this.buttons.handle(interaction)
  }

  @Button('standup\\:adjust\\::standupId')
  public async onAdjust(@Context() [interaction]: ButtonContext) {
    await this.buttons.handle(interaction)
  }

  @Button('standup\\:regenerate\\::standupId')
  public async onRegenerate(@Context() [interaction]: ButtonContext) {
    await this.buttons.handle(interaction)
  }
}
