import { BadRequestException, Injectable } from '@nestjs/common'
import {
  type ListStandupFilters,
  StandupRepository,
} from '../../../platform/database/repositories/standup.repository'
import { LocalDateService } from '../../../platform/time/local-date.service'
import type { StandupRecord } from '../../../shared/domain'
import { formatStandupRecord } from '../shared/format-standup-record'
import { throwStandupHttpError } from '../shared/throw-standup-http-error'
import { UserTimezoneService } from '../shared/user-timezone.service'

@Injectable()
export class StandupsQueryService {
  constructor(
    private readonly standupRepository: StandupRepository,
    private readonly localDateService: LocalDateService,
    private readonly userTimezone: UserTimezoneService,
  ) {}

  async list(userId: string, filters: Omit<ListStandupFilters, 'userId'>) {
    const timezone = await this.userTimezone.resolve(userId)
    const result = await this.standupRepository.list({
      ...this.normalizeFilters(filters, timezone),
      userId,
    })

    if (result.isErr()) {
      throwStandupHttpError(result.error)
    }

    const todayIso = this.localDateService.today(timezone).iso
    const metricChangesResult =
      await this.standupRepository.getMetricChangesForUser(
        userId,
        this.localDateService.shiftIsoDate(todayIso, -6),
        todayIso,
        this.localDateService.shiftIsoDate(todayIso, -13),
        this.localDateService.shiftIsoDate(todayIso, -7),
      )

    if (metricChangesResult.isErr()) {
      throwStandupHttpError(metricChangesResult.error)
    }

    return {
      ...result.value,
      items: result.value.items.map((record: StandupRecord) =>
        formatStandupRecord(record, this.localDateService, timezone),
      ),
      metricChanges: metricChangesResult.value,
    }
  }

  async getById(userId: string, id: string) {
    const timezone = await this.userTimezone.resolve(userId)
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
        ? this.localDateService.shiftIsoDate(todayIso, -6)
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
}
