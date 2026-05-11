// apps/api/src/interfaces/discord/features/reminder/reminder.buttons.ts
import { Injectable } from '@nestjs/common'
import { Button, type ButtonContext, Context } from 'necord'
import { ReminderInteractionService } from '../../handlers/reminder-interaction.service'

@Injectable()
export class ReminderButtons {
  constructor(private readonly reminders: ReminderInteractionService) {}

  @Button('standup-reminder\\:snooze')
  public async onSnooze(@Context() [interaction]: ButtonContext) {
    await this.reminders.handle(interaction, 'snooze')
  }

  @Button('standup-reminder\\:cancel-today')
  public async onCancelToday(@Context() [interaction]: ButtonContext) {
    await this.reminders.handle(interaction, 'cancel-today')
  }
}
