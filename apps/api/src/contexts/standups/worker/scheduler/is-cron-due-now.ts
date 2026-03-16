import { Cron } from 'croner'

export function isCronDueNow(
  expression: string,
  timezone: string,
  now?: Date,
): boolean {
  const ref = now ?? new Date()
  const cron = new Cron(expression, { timezone })
  const minuteRef = new Date(ref)
  minuteRef.setSeconds(0, 0)

  return cron.match(minuteRef)
}
