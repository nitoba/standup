const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/
const DISPLAY_DATE_PATTERN = /^(\d{2})\/(\d{2})\/(\d{4})$/

type DateParts = {
  year: number
  month: number
  day: number
}

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
}

function isValidDateParts(parts: DateParts): boolean {
  if (parts.month < 1 || parts.month > 12) {
    return false
  }

  if (parts.day < 1) {
    return false
  }

  const daysInMonth = [
    31,
    isLeapYear(parts.year) ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ]

  return parts.day <= (daysInMonth[parts.month - 1] ?? 0)
}

function parseDateParts(
  value: string,
  pattern: RegExp,
  order: 'iso' | 'display',
): DateParts | null {
  const match = pattern.exec(value)
  if (!match) {
    return null
  }

  const parts =
    order === 'iso'
      ? {
          year: Number(match[1]),
          month: Number(match[2]),
          day: Number(match[3]),
        }
      : {
          year: Number(match[3]),
          month: Number(match[2]),
          day: Number(match[1]),
        }

  if (!isValidDateParts(parts)) {
    return null
  }

  return parts
}

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

export function isIsoDate(value: string): boolean {
  return parseDateParts(value, ISO_DATE_PATTERN, 'iso') !== null
}

export function isDisplayDate(value: string): boolean {
  return parseDateParts(value, DISPLAY_DATE_PATTERN, 'display') !== null
}

export function toDisplayDateFromIso(value: string): string {
  const parts = parseDateParts(value, ISO_DATE_PATTERN, 'iso')
  if (!parts) {
    throw new RangeError(`Invalid ISO date: ${value}`)
  }

  return `${pad(parts.day)}/${pad(parts.month)}/${parts.year}`
}

export function toIsoDateFromDisplay(value: string): string {
  const parts = parseDateParts(value, DISPLAY_DATE_PATTERN, 'display')
  if (!parts) {
    throw new RangeError(`Invalid display date: ${value}`)
  }

  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`
}

export function normalizeDateInput(value: string): string {
  if (isIsoDate(value)) {
    return value
  }

  if (isDisplayDate(value)) {
    return toIsoDateFromDisplay(value)
  }

  throw new RangeError(`Invalid date input: ${value}`)
}

export function shiftIsoDate(value: string, days: number): string {
  const parts = parseDateParts(value, ISO_DATE_PATTERN, 'iso')
  if (!parts) {
    throw new RangeError(`Invalid ISO date: ${value}`)
  }

  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day))
  date.setUTCDate(date.getUTCDate() + days)

  return [
    date.getUTCFullYear(),
    pad(date.getUTCMonth() + 1),
    pad(date.getUTCDate()),
  ].join('-')
}

export function getIsoDayOfWeek(value: string): number {
  const parts = parseDateParts(value, ISO_DATE_PATTERN, 'iso')
  if (!parts) {
    throw new RangeError(`Invalid ISO date: ${value}`)
  }

  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay()
}
