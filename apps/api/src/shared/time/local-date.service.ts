import { Injectable } from '@nestjs/common'
import {
  getIsoDayOfWeek,
  isDisplayDate,
  isIsoDate,
  normalizeDateInput,
  shiftIsoDate,
  toDisplayDateFromIso,
  toIsoDateFromDisplay,
} from './date-only'

export interface LocalCalendarDate {
  iso: string
  display: string
}

@Injectable()
export class LocalDateService {
  private readonly formatterCache = new Map<string, Intl.DateTimeFormat>()

  fromDate(date: Date, timezone: string): LocalCalendarDate {
    const parts = this.getFormatter(timezone).formatToParts(date)
    const year = parts.find((part) => part.type === 'year')?.value
    const month = parts.find((part) => part.type === 'month')?.value
    const day = parts.find((part) => part.type === 'day')?.value

    if (!year || !month || !day) {
      throw new RangeError(`Unable to resolve local calendar date for ${timezone}`)
    }

    const iso = `${year}-${month}-${day}`

    return {
      iso,
      display: toDisplayDateFromIso(iso),
    }
  }

  today(timezone: string): LocalCalendarDate {
    return this.fromDate(new Date(), timezone)
  }

  formatIsoForTimezone(isoDate: string, _timezone: string): string {
    return toDisplayDateFromIso(isoDate)
  }

  toIsoDateFromDisplay(displayDate: string, _timezone?: string): string {
    return toIsoDateFromDisplay(displayDate)
  }

  normalizeDateInput(value: string, _timezone?: string): string {
    return normalizeDateInput(value)
  }

  isIsoDate(value: string): boolean {
    return isIsoDate(value)
  }

  isDisplayDate(value: string): boolean {
    return isDisplayDate(value)
  }

  getDayOfWeek(isoDate: string): number {
    return getIsoDayOfWeek(isoDate)
  }

  shiftIsoDate(isoDate: string, days: number): string {
    return shiftIsoDate(isoDate, days)
  }

  getPreviousWeekRange(
    referenceDate: Date,
    timezone: string,
  ): { weekStart: string; weekEnd: string } {
    const todayIso = this.fromDate(referenceDate, timezone).iso
    const dayOfWeek = this.getDayOfWeek(todayIso)
    const daysToLastMonday = dayOfWeek === 0 ? 13 : dayOfWeek + 6
    const weekStart = this.shiftIsoDate(todayIso, -daysToLastMonday)

    return {
      weekStart,
      weekEnd: this.shiftIsoDate(weekStart, 4),
    }
  }

  private getFormatter(timezone: string): Intl.DateTimeFormat {
    const cached = this.formatterCache.get(timezone)

    if (cached) {
      return cached
    }

    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })

    this.formatterCache.set(timezone, formatter)
    return formatter
  }
}
