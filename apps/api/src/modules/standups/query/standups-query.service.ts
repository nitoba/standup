import { BadRequestException, Injectable } from '@nestjs/common'
import {
  type ListStandupFilters,
  StandupRepository,
} from '../../../shared/module/database/repositories/standup.repository'
import type { StandupRecord } from '../../../shared/domain'
import { UserSettingsRepository } from '../../../shared/module/database/repositories/user-settings.repository'
import { LocalDateService } from '../../../shared/time/local-date.service'
import { formatStandupRecord } from '../shared/format-standup-record'
import { throwStandupHttpError } from '../shared/throw-standup-http-error'

@Injectable()
export class StandupsQueryService {
  constructor(
    private readonly standupRepository: StandupRepository,
    private readonly userSettingsRepository: UserSettingsRepository,
    private readonly localDateService: LocalDateService,
  ) {}

  async list(userId: string, filters: Omit<ListStandupFilters, 'userId'>) {
    const timezone = await this.resolveTimezone(userId)
    const result = await this.standupRepository.list({
      ...this.normalizeFilters(filters, timezone),
      userId,
    })

    if (result.isErr()) {
      throwStandupHttpError(result.error)
    }

    return {
      ...result.value,
      items: result.value.items.map((record: StandupRecord) =>
        formatStandupRecord(record, this.localDateService, timezone),
      ),
    }
  }

  async getById(userId: string, id: string) {
    const timezone = await this.resolveTimezone(userId)
    const result = await this.standupRepository.findByIdForUser(id, userId)

    if (result.isErr()) {
      throwStandupHttpError(result.error)
    }

    return formatStandupRecord(result.value, this.localDateService, timezone)
  }

  private normalizeFilters(
    filters: Omit<ListStandupFilters, 'userId'>,
    timezone: string,
  ) {
    const todayIso = this.localDateService.today(timezone).iso
    const normalizedDate =
      filters.date === 'this_week'
        ? undefined
        : filters.date
          ? this.normalizeDateInput(filters.date)
          : filters.date
    const fromDate =
      filters.date === 'this_week'
        ? this.localDateService.shiftIsoDate(
            todayIso,
            -6,
          )
        : filters.from
          ? this.normalizeDateInput(filters.from)
          : filters.from

    return {
      ...filters,
      date: normalizedDate,
      from: fromDate,
      to:
        filters.date === 'this_week'
          ? todayIso
          : filters.to
            ? this.normalizeDateInput(filters.to)
            : filters.to,
    }
  }

  private normalizeDateInput(value: string): string {
    try {
      return this.localDateService.normalizeDateInput(value)
    } catch {
      throw new BadRequestException(
        'Invalid date. Use DD/MM/YYYY or YYYY-MM-DD.',
      )
    }
  }

  private async resolveTimezone(userId: string): Promise<string> {
    const settingsResult = await this.userSettingsRepository.findByUserId(userId)

    if (settingsResult.isOk() && settingsResult.value?.timezone) {
      return settingsResult.value.timezone
    }

    return 'America/Sao_Paulo'
  }
}
