/**
 * Determines the meeting type label based on day of week.
 * Returns an empty string for days without special meetings.
 *
 * dateStr is expected in YYYY-MM-DD format.
 * Uses local date parsing to avoid UTC midnight → previous-day shift.
 */
export function determineMeetingType(dateStr: string): string {
  const [year, month, dayOfMonth] = dateStr.split('-').map(Number)
  const date = new Date(year ?? 2000, (month ?? 1) - 1, dayOfMonth ?? 1)
  const day = date.getDay() // 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat
  if (day === 1) return '📆 (Start of week meeting)'
  if (day === 3) return '📆 (Planing Web)'
  if (day === 5) return '📆 (Encerramento semanal)'
  return ''
}
