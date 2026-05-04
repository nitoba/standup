// apps/api/src/interfaces/discord/features/copy/copy.button.ts
import { Injectable } from '@nestjs/common'
import { Button, type ButtonContext, ComponentParam, Context } from 'necord'
import { CopyInteractionService } from '../../handlers/copy-interaction.service'

@Injectable()
export class CopyButton {
  constructor(private readonly copy: CopyInteractionService) {}

  @Button('standup-copy\\:content\\::standupId')
  public async onCopy(
    @Context() [interaction]: ButtonContext,
    @ComponentParam('standupId') standupId: string,
  ) {
    await this.copy.handle(interaction, 'content', standupId)
  }
}
