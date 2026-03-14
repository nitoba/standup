import { Injectable } from "@nestjs/common";
import { OnEvent } from "@nestjs/event-emitter";
import { UserRepository } from "../../../shared/module/database/repositories/user.repository";
import { UserSettingsRepository } from "../../../shared/module/database/repositories/user-settings.repository";
import { Result, ValidationError } from "../../../shared/domain";
import { AppLoggerFactory } from "../../../shared/module/logger";
import { parseSelectedRepos } from "../../../shared/repos/parse-selected-repos";
import {
  STANDUP_JOB_DISPATCH_REQUESTED_EVENT,
  type StandupJobDispatchRequestedEvent,
} from "../../../shared/module/events/standup-events";
import { RunStandupJobService } from "./run-standup-job.service";
import type { StandupJobOptions } from "./types";

@Injectable()
export class StandupDispatchService {
  private readonly logger: ReturnType<AppLoggerFactory["create"]>;
  constructor(
    private readonly loggerFactory: AppLoggerFactory,
    private readonly userRepository: UserRepository,
    private readonly userSettingsRepository: UserSettingsRepository,
    private readonly standupJob: RunStandupJobService,
  ) {
    this.logger = this.loggerFactory.create("standup-dispatch");
  }

  @OnEvent(STANDUP_JOB_DISPATCH_REQUESTED_EVENT)
  handleRequestedDispatch(event: StandupJobDispatchRequestedEvent): {
    ok: true;
  } {
    this.dispatchStandupJob(event);
    return { ok: true };
  }

  dispatchStandupJob(options: StandupJobOptions): void {
    void this.standupJob.run(options).catch((error: unknown) => {
      this.logger.error("Standup job threw unexpectedly", {
        userId: options.userId,
        error: error instanceof Error ? error.message : String(error),
      });
    });
  }

  async dispatchStandupJobForUser(
    userId: string,
  ): Promise<Result<void, ValidationError>> {
    const optionsResult = await this.resolveStandupJobOptionsForUser(userId);

    if (optionsResult.isErr()) {
      return optionsResult;
    }

    this.dispatchStandupJob(optionsResult.value);

    return Result.ok(undefined);
  }

  private async resolveStandupJobOptionsForUser(
    userId: string,
  ): Promise<Result<StandupJobOptions, ValidationError>> {
    const settingsResult =
      await this.userSettingsRepository.findByUserId(userId);
    if (settingsResult.isErr() || !settingsResult.value) {
      return Result.err(
        new ValidationError({
          field: "userId",
          message: "User settings not found",
        }),
      );
    }

    const discordResult =
      await this.userRepository.findDiscordIdByUserId(userId);
    if (discordResult.isErr() || !discordResult.value) {
      return Result.err(
        new ValidationError({
          field: "userId",
          message: "Discord identity not found",
        }),
      );
    }

    const selectedRepos = parseSelectedRepos(
      settingsResult.value.selectedRepos,
    );
    if (selectedRepos.length === 0) {
      return Result.err(
        new ValidationError({
          field: "selectedRepos",
          message: "No repositories selected",
        }),
      );
    }

    return Result.ok({
      userId,
      discordUserId: discordResult.value,
      selectedRepos,
      gitAuthor: settingsResult.value.gitAuthor,
      timezone: settingsResult.value.timezone,
      gitSincePeriod: settingsResult.value.gitSincePeriod,
    });
  }
}
