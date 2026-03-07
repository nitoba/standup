import { Cron } from 'croner'

/**
 * Checks if a cron expression would fire in the current minute for the given timezone.
 * Uses croner's `previousRuns()` with a reference date to determine if the last
 * scheduled run falls within the past 60 seconds.
 *
 * @param now - Optional reference date (defaults to current time). Useful for testing.
 */
export function isCronDueNow(
  expression: string,
  timezone: string,
  now?: Date,
): boolean {
  const ref = now ?? new Date()
  const cron = new Cron(expression, { timezone })
  const [prev] = cron.previousRuns(1, ref)
  if (!prev) return false
  return ref.getTime() - prev.getTime() < 60_000
}
