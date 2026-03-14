import { Injectable } from "@nestjs/common";
import { OnEvent } from "@nestjs/event-emitter";
import { StandupRepository } from "../../../shared/module/database/repositories/standup.repository";
import { UserRepository } from "../../../shared/module/database/repositories/user.repository";
import {
  type DbError,
  ExternalServiceError,
  type NotFoundError,
  Result,
} from "../../../shared/domain";
import { EnvService } from "../../../shared/module/env/env.service";
import { AppLoggerFactory } from "../../../shared/module/logger";
import {
  STANDUP_STATUS_CHANGED_EVENT,
  type StandupStatusChangedEvent,
} from "../../../shared/module/events/standup-events";
import { DiscordMessagesService } from "../notifications/discord-messages.service";

export interface SyncStandupStatusInput {
  standupId: string;
  newStatus: "approved" | "rejected" | "published";
}

type SyncError = NotFoundError | DbError | ExternalServiceError;

@Injectable()
export class StandupStatusSyncService {
  private readonly logger: ReturnType<AppLoggerFactory["create"]>;
  constructor(
    private readonly loggerFactory: AppLoggerFactory,
    private readonly standupRepository: StandupRepository,
    private readonly userRepository: UserRepository,
    private readonly messages: DiscordMessagesService,
    private readonly env: EnvService,
  ) {
    this.logger = this.loggerFactory.create("discord-standup-status-sync");
  }

  @OnEvent(STANDUP_STATUS_CHANGED_EVENT)
  async handleStatusChanged(event: StandupStatusChangedEvent): Promise<void> {
    if (event.source === "discord") {
      return;
    }

    if (
      event.newStatus !== "approved" &&
      event.newStatus !== "rejected" &&
      event.newStatus !== "published"
    ) {
      return;
    }

    const result = await this.syncStatus({
      standupId: event.standupId,
      newStatus: event.newStatus,
    });

    if (result.isErr()) {
      this.logger.warn("Failed to sync standup status to Discord", {
        standupId: event.standupId,
        newStatus: event.newStatus,
        error: result.error.message,
      });
    }
  }

  async syncStatus(
    input: SyncStandupStatusInput,
  ): Promise<Result<void, SyncError>> {
    const found = await this.standupRepository.findById(input.standupId);
    if (found.isErr()) {
      return found;
    }

    const record = found.value;
    let discordUserId: string | undefined;

    if (record.userId) {
      const accountResult = await this.userRepository.findDiscordIdByUserId(
        record.userId,
      );

      if (accountResult.isOk() && accountResult.value) {
        discordUserId = accountResult.value;
      }
    }

    if (record.dmMessageId && discordUserId) {
      const label =
        input.newStatus === "rejected"
          ? "❌ Rejeitado via web"
          : "✅ Aprovado e publicado via web";

      const dmResult = await this.messages.updateDmMessage({
        discordUserId,
        messageId: record.dmMessageId,
        payload: {
          content: label,
          components: [],
        },
      });

      if (dmResult.isErr()) {
        this.logger.warn("Failed to sync DM message", {
          standupId: input.standupId,
          error: dmResult.error.message,
        });
      }
    }

    if (input.newStatus === "approved" && this.env.discord.channelId) {
      const publishResult = await this.messages.publishStandup(
        record,
        this.env.discord.channelId,
      );

      if (publishResult.isErr()) {
        this.logger.warn("Failed to publish standup during sync", {
          standupId: input.standupId,
          error: publishResult.error.message,
        });
        return Result.ok(undefined);
      }

      const publishedResult = await this.standupRepository.updateStatus(
        input.standupId,
        "published",
      );

      if (publishedResult.isErr()) {
        this.logger.warn(
          "Failed to transition standup to published after sync",
          {
            standupId: input.standupId,
            error: publishedResult.error.message,
          },
        );
      }
    }

    return Result.ok(undefined);
  }
}
