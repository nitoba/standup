import { Injectable } from "@nestjs/common";
import { type ButtonInteraction } from "discord.js";
import { Result, ValidationError } from "../../../shared/domain";
import { EventBusService } from "../../../shared/module/events/event-bus.service";
import { DiscordAuthService } from "../services/discord-auth.service";
import { DiscordTriggerService } from "../services/discord-trigger.service";

export type ReminderAction = "run-now" | "snooze" | "cancel-today";

const ACTION_EMOJI: Record<ReminderAction, string> = {
  "run-now": "▶",
  snooze: "⏰",
  "cancel-today": "❌",
};

const ACTION_MESSAGE: Record<ReminderAction, string> = {
  "run-now": "Standup sendo gerado agora...",
  snooze: "Standup adiado por 15 minutos.",
  "cancel-today": "Standup cancelado para hoje.",
};

@Injectable()
export class ReminderInteractionService {
  constructor(
    private readonly auth: DiscordAuthService,
    private readonly trigger: DiscordTriggerService,
    private readonly eventBus: EventBusService,
  ) {}

  async handle(
    interaction: ButtonInteraction,
    action: ReminderAction,
  ): Promise<void> {
    await interaction.deferUpdate();

    const session = await this.auth.resolveActiveSession(interaction.user.id);
    if (!session?.hasSession) {
      await this.auth.replySessionExpired(interaction);
      return;
    }

    if (action === "run-now") {
      const result = await this.trigger.trigger(
        session.userId,
        interaction.user.id,
      );
      if (result.isErr()) {
        await interaction.editReply({
          content: `❌ Erro ao processar ação: ${result.error.message}`,
          components: [],
        });
        return;
      }

      if (!result.value.accepted) {
        await interaction.editReply({
          content:
            result.value.reason === "pending_review_exists"
              ? "⚠️ Já existe um standup aguardando revisão."
              : "✅ O standup de hoje já foi aprovado.",
          components: [],
        });
        return;
      }
    } else {
      const reminderResult = await this.eventBus.requestWorkerReminderAction<
        Result<
          { ok: true; snoozedUntil?: string; cancelledDate?: string },
          ValidationError
        >
      >({
        action,
        userId: session.userId,
      });

      if (!reminderResult || reminderResult.isErr()) {
        await interaction.editReply({
          content: `❌ Erro ao processar ação: ${reminderResult?.error.message ?? "no listener handled the reminder action"}`,
          components: [],
        });
        return;
      }
    }

    await interaction.editReply({
      content: `${ACTION_EMOJI[action]} ${ACTION_MESSAGE[action]}`,
      components: [],
    });
  }
}
