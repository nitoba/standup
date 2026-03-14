import type { StandupRecord } from '../../../shared/domain'
import { LocalDateService } from '../../../shared/time/local-date.service'

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
