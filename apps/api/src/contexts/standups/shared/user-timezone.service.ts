import { Injectable } from '@nestjs/common'
import { UserSettingsRepository } from '../../../platform/database/repositories/user-settings.repository'

const DEFAULT_TIMEZONE = 'America/Sao_Paulo'

@Injectable()
export class UserTimezoneService {
  constructor(
    private readonly userSettingsRepository: UserSettingsRepository,
  ) {}

  async resolve(userId: string): Promise<string> {
    const settingsResult =
      await this.userSettingsRepository.findByUserId(userId)

    if (settingsResult.isOk() && settingsResult.value?.timezone) {
      return settingsResult.value.timezone
    }

    return DEFAULT_TIMEZONE
  }
}
