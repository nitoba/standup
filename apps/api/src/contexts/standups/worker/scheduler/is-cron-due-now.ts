import { Cron } from 'croner'

export function isCronDueNow(
  expression: string,
  timezone: string,
  now?: Date,
): boolean {
  const ref = now ?? new Date()
  const cron = new Cron(expression, { timezone })
  const [prev] = cron.previousRuns(1, ref)

  if (!prev) {
    return false
  }

  return ref.getTime() - prev.getTime() < 60_000
}
