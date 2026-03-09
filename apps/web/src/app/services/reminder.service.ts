import { HttpClient } from '@angular/common/http'
import { Injectable, inject } from '@angular/core'
import { firstValueFrom } from 'rxjs'

interface ApiEnvelope<T> {
  data: T
}

export interface ReminderAcceptedResponse {
  ok: boolean
  accepted: boolean
}

export interface SnoozeReminderResponse {
  ok: boolean
  snoozedUntil: string
}

export interface CancelTodayReminderResponse {
  ok: boolean
  cancelledDate: string
}

@Injectable({ providedIn: 'root' })
export class ReminderService {
  private readonly http = inject(HttpClient)

  async runNow() {
    return firstValueFrom(
      this.http.post<ReminderAcceptedResponse>('/reminders/run-now', {}),
    )
  }

  async snooze() {
    const response = await firstValueFrom(
      this.http.post<ApiEnvelope<SnoozeReminderResponse>>(
        '/reminders/snooze',
        {},
      ),
    )

    return response.data
  }

  async cancelToday() {
    const response = await firstValueFrom(
      this.http.post<ApiEnvelope<CancelTodayReminderResponse>>(
        '/reminders/cancel-today',
        {},
      ),
    )

    return response.data
  }
}
