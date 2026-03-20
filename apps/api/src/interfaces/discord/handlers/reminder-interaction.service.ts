import { Injectable } from '@nestjs/common'
import { type ButtonInteraction } from 'discord.js'
import { ReminderActionsService } from '../../../contexts/standups/worker/reminders/reminder-actions.service'
import { Result, ValidationError } from '../../../shared/domain'
import { DiscordAuthService } from '../services/discord-auth.service'

export type ReminderAction = 'snooze' | 'cancel-today'

const ACTION_EMOJI: Record<ReminderAction, string> = {
  snooze: '⏰',
  'cancel-today': '❌',
}

const ACTION_MESSAGE: Record<ReminderAction, string> = {
  snooze: 'Standup adiado por 15 minutos.',
  'cancel-today': 'Standup cancelado para hoje.',
}

@Injectable()
export class ReminderInteractionService {
  constructor(
    private readonly auth: DiscordAuthService,
    private readonly reminderActions: ReminderActionsService,
  ) {}

  async handle(
    interaction: ButtonInteraction,
    action: ReminderAction,
  ): Promise<void> {
    await interaction.deferUpdate()

    const session = await this.auth.resolveActiveSession(interaction.user.id)
    if (!session?.hasSession) {
      await this.auth.replySessionExpired(interaction)
      return
    }

    const reminderResult =
      action === 'snooze'
        ? Result.ok(await this.reminderActions.snoozeReminder(session.userId))
        : action === 'cancel-today'
          ? Result.ok(
              await this.reminderActions.cancelReminderForToday(session.userId),
            )
          : Result.err(
              new ValidationError({
                field: 'action',
                message: `Unknown reminder action: ${action}`,
              }),
            )

    if (!reminderResult || reminderResult.isErr()) {
      await interaction.editReply({
        content: `❌ Erro ao processar ação: ${reminderResult?.error.message ?? 'no listener handled the reminder action'}`,
        components: [],
      })
      return
    }

    await interaction.editReply({
      content: `${ACTION_EMOJI[action]} ${ACTION_MESSAGE[action]}`,
      components: [],
    })
  }
}
