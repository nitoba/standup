import { Injectable } from "@nestjs/common";
import { OnEvent } from "@nestjs/event-emitter";
import { StandupRepository } from "../../../shared/module/database/repositories/standup.repository";
import {
  type DbError,
  type NotFoundError,
  Result,
} from "../../../shared/domain";
import { AppLoggerFactory } from "../../../shared/module/logger";
import { EventBusService } from "../../../shared/module/events/event-bus.service";
import {
  STANDUP_READY_EVENT,
  type StandupReadyEvent,
} from "../../../shared/module/events/standup-events";
import { DiscordMessagesService } from "../notifications/discord-messages.service";

export interface StandupReadyResult {
  standupId: string;
  dmSent: boolean;
  transitioned: boolean;
}

@Injectable()
export class StandupNotificationService {
  private readonly logger: ReturnType<AppLoggerFactory["create"]>;
  constructor(
    private readonly loggerFactory: AppLoggerFactory,
    private readonly standupRepository: StandupRepository,
    private readonly messages: DiscordMessagesService,
    private readonly eventBus: EventBusService,
  ) {
    this.logger = this.loggerFactory.create("discord-standup-notification");
  }

  @OnEvent(STANDUP_READY_EVENT)
  async handleStandupReady(event: StandupReadyEvent): Promise<void> {
    const result = await this.notifyStandupReady(
      event.standupId,
      event.discordUserId,
    );

    if (result.isErr()) {
      this.logger.warn("Failed to process standup ready event", {
        standupId: event.standupId,
        error: result.error.message,
      });
    }
  }

  async notifyStandupReady(
    standupId: string,
    discordUserId: string,
  ): Promise<Result<StandupReadyResult, NotFoundError | DbError>> {
    const found = await this.standupRepository.findById(standupId);
    if (found.isErr()) {
      return found;
    }

    const record = found.value;
    const dmResult = await this.messages.sendReviewDm(record, discordUserId);

    if (dmResult.isErr()) {
      this.logger.warn("Failed to send review DM", {
        standupId,
        error: dmResult.error.message,
      });
      return Result.ok({ standupId, dmSent: false, transitioned: false });
    }

    const saveMessageIdResult = await this.standupRepository.updateDmMessageId(
      standupId,
      dmResult.value.messageId,
    );
    if (saveMessageIdResult.isErr()) {
      this.logger.warn("Failed to persist dmMessageId", {
        standupId,
        error: saveMessageIdResult.error.message,
      });
    }

    const transitionResult = await this.standupRepository.updateStatus(
      standupId,
      "pending_review",
    );
    if (transitionResult.isErr()) {
      this.logger.warn("Failed to transition standup to pending_review", {
        standupId,
        error: transitionResult.error.message,
      });
      return Result.ok({ standupId, dmSent: true, transitioned: false });
    }

    if (record.userId) {
      this.eventBus.emitStandupStatusChanged({
        userId: record.userId,
        standupId,
        newStatus: "pending_review",
        source: "worker",
      });
    }

    return Result.ok({ standupId, dmSent: true, transitioned: true });
  }
}
