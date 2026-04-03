import { HttpClient } from '@angular/common/http'
import { Injectable, inject } from '@angular/core'
import { injectMutation } from '@tanstack/angular-query-experimental'
import {
  cancelTodayReminder,
  runReminderNow,
  snoozeReminder,
} from '../../../api/endpoints/reminders/reminders'

@Injectable({ providedIn: 'root' })
export class ReminderService {
  private readonly http = inject(HttpClient)

  /** TanStack Mutation: POST /reminders/run-now (uses Orval-generated function) */
  readonly runNowMutation = injectMutation(() => ({
    mutationKey: ['runReminderNow'],
    mutationFn: () => runReminderNow(this.http),
  }))

  /** TanStack Mutation: POST /reminders/snooze (uses Orval-generated function) */
  readonly snoozeMutation = injectMutation(() => ({
    mutationKey: ['snoozeReminder'],
    mutationFn: () => snoozeReminder(this.http),
  }))

  /** TanStack Mutation: POST /reminders/cancel-today (uses Orval-generated function) */
  readonly cancelTodayMutation = injectMutation(() => ({
    mutationKey: ['cancelTodayReminder'],
    mutationFn: () => cancelTodayReminder(this.http),
  }))

  /** Convenience async wrappers (backward-compatible API) */
  async runNow() {
    return this.runNowMutation.mutateAsync(undefined as void)
  }

  async snooze() {
    return this.snoozeMutation.mutateAsync(undefined as void)
  }

  async cancelToday() {
    return this.cancelTodayMutation.mutateAsync(undefined as void)
  }
}
