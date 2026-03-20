import { Injectable } from '@nestjs/common'
import { StandupRepository } from '../../../platform/database/repositories/standup.repository'
import { UserSettingsRepository } from '../../../platform/database/repositories/user-settings.repository'
import { EnvService } from '../../../platform/env/env.service'
import { LocalDateService } from '../../../platform/time/local-date.service'
import { ExternalServiceError, InvalidStateTransitionError } from '../../../shared/domain'
import { signWebhookPayload } from '../../../shared/utils/sign-webhook-payload'
import { formatStandupRecord } from '../shared/format-standup-record'
import { throwStandupHttpError } from '../shared/throw-standup-http-error'

const ALLOWED_STATES = new Set(['approved', 'published'])

@Injectable()
export class SendToDiscordService {
  constructor(
    private readonly standupRepository: StandupRepository,
    private readonly envService: EnvService,
    private readonly localDateService: LocalDateService,
    private readonly userSettingsRepository: UserSettingsRepository,
  ) {}

  async send(userId: string, standupId: string) {
    const found = await this.standupRepository.findByIdForUser(standupId, userId)
    if (found.isErr()) {
      throwStandupHttpError(found.error)
    }

    const standup = found.value
    if (!ALLOWED_STATES.has(standup.status)) {
      throwStandupHttpError(
        new InvalidStateTransitionError({
          from: standup.status,
          to: 'send_to_discord',
        }),
      )
    }

    const { url, channelUrl, webhookSecret, sendTimeoutMs } = this.envService.automation
    if (!url || !channelUrl || !webhookSecret) {
      throwStandupHttpError(
        new ExternalServiceError({
          service: 'discord-automation',
          message:
            'Discord automation is not configured. Set DISCORD_AUTOMATION_URL, DISCORD_AUTOMATION_CHANNEL_URL, and DISCORD_AUTOMATION_WEBHOOK_SECRET.',
        }),
      )
    }

    const body = JSON.stringify({ channelUrl, message: standup.content })
    const { header } = signWebhookPayload(webhookSecret, body)

    let response: Response
    try {
      response = await fetch(`${url}/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-webhook-signature': header,
        },
        body,
        signal: AbortSignal.timeout(sendTimeoutMs),
      })
    } catch (error) {
      const message =
        error instanceof TypeError
          ? `Network error connecting to automation server: ${error.message}`
          : `Request to automation server timed out after ${sendTimeoutMs}ms`

      throwStandupHttpError(
        new ExternalServiceError({
          service: 'discord-automation',
          message,
        }),
      )
    }

    if (!response!.ok) {
      const detail = await response!.text().catch(() => 'unknown error')
      throwStandupHttpError(
        new ExternalServiceError({
          service: 'discord-automation',
          message: `Automation server returned ${response!.status}: ${detail}`,
        }),
      )
    }

    const updated = await this.standupRepository.updateSentToDiscordAt(standupId)
    if (updated.isErr()) {
      throwStandupHttpError(updated.error)
    }

    return formatStandupRecord(
      updated.value,
      this.localDateService,
      await this.resolveTimezone(userId),
    )
  }

  private async resolveTimezone(userId: string): Promise<string> {
    const settingsResult = await this.userSettingsRepository.findByUserId(userId)
    if (settingsResult.isOk() && settingsResult.value?.timezone) {
      return settingsResult.value.timezone
    }
    return 'America/Sao_Paulo'
  }
}
