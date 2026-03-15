const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/
const DISPLAY_DATE_PATTERN = /^(\d{2})\/(\d{2})\/(\d{4})$/

export function formatLocalDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')

  return `${day}/${month}/${year}`
}

export function startOfLocalDay(now: Date): Date {
  const today = new Date(now)
  today.setHours(0, 0, 0, 0)

  return today
}

export function minusDays(date: Date, days: number): Date {
  const nextDate = new Date(date)
  nextDate.setDate(nextDate.getDate() - days)

  return nextDate
}

export function normalizeDisplayDate(value: string): string {
  const displayMatch = DISPLAY_DATE_PATTERN.exec(value)
  if (displayMatch) {
    return value
  }

  const isoMatch = ISO_DATE_PATTERN.exec(value)
  if (!isoMatch) {
    return value
  }

  const [, year, month, day] = isoMatch
  return `${day}/${month}/${year}`
}

export function formatTimestampPtBr(timestamp: number): string {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
    .format(new Date(timestamp))
    .replace(',', '')
}
