import { Injectable } from '@nestjs/common'
import { DiscordMessagesService } from '../../../interfaces/discord/notifications/discord-messages.service'
import { StandupReadRepository } from '../../../platform/database/repositories/standup-read.repository'
import { StandupWriteRepository } from '../../../platform/database/repositories/standup-write.repository'
import { EnvService } from '../../../platform/env/env.service'
import { LocalDateService } from '../../../platform/time/local-date.service'
import { ExternalServiceError, ValidationError } from '../../../shared/domain'
import { formatStandupRecord } from '../shared/format-standup-record'
import { UserTimezoneService } from '../shared/user-timezone.service'

@Injectable()
export class SendToDiscordService {
  constructor(
    private readonly standupRead: StandupReadRepository,
    private readonly standupWrite: StandupWriteRepository,
    private readonly messages: DiscordMessagesService,
    private readonly env: EnvService,
    private readonly localDateService: LocalDateService,
    private readonly userTimezone: UserTimezoneService,
  ) {}

  async send(userId: string, standupId: string) {
    const channelId = this.env.discord.channelId?.trim()
    if (!channelId) {
      throw new ExternalServiceError({
        service: 'discord',
        message: 'Canal de publicação do Discord não configurado.',
      })
    }

    const found = await this.standupRead.findByIdForUser(standupId, userId)
    if (found.isErr()) {
      throw found.error
    }

    if (found.value.status !== 'approved') {
      throw new ValidationError({
        field: 'status',
        message: 'Apenas standups aprovados podem ser enviados ao Discord.',
      })
    }

    const publishResult = await this.messages.publishStandup(
      found.value,
      channelId,
    )
    if (publishResult.isErr()) {
      throw publishResult.error
    }

    const marked = await this.standupWrite.updateSentToDiscordAt(standupId)
    if (marked.isErr()) {
      throw marked.error
    }

    return formatStandupRecord(
      marked.value,
      this.localDateService,
      await this.userTimezone.resolve(userId),
    )
  }
}
