import { LocalDateService } from '../../../platform/time/local-date.service'
import type { StandupRecord } from '../../../shared/domain'

export function formatStandupRecord(
  record: StandupRecord,
  localDateService: LocalDateService,
  timezone: string,
): StandupRecord {
  return {
    ...record,
    date: localDateService.formatIsoForTimezone(record.date, timezone),
  }
}
