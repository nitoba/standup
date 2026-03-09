import { HttpClient } from '@angular/common/http'
import { Injectable, inject, signal } from '@angular/core'
import { firstValueFrom } from 'rxjs'

interface ApiEnvelope<T> {
  data: T
}

export interface RepoOption {
  id: string
  name: string
  project: string
}

export interface SettingsRecord {
  standupCron: string
  reminderCron: string
  recoveryCron: string
  timezone: string
  gitAuthor: string
  gitSincePeriod: string
  selectedRepos: string[]
  active: boolean
  snoozedUntil: number | null
  cancelledDate: string | null
}

export interface SaveSettingsInput {
  standupCron: string
  reminderCron: string
  recoveryCron: string
  timezone: string
  gitAuthor: string
  gitSincePeriod: string
  selectedRepos: string[]
  active: boolean
}

@Injectable({ providedIn: 'root' })
export class SettingsService {
  private readonly http = inject(HttpClient)
  private readonly settingsState = signal<SettingsRecord | null>(null)
  private readonly reposState = signal<RepoOption[]>([])

  readonly settings = this.settingsState.asReadonly()
  readonly repos = this.reposState.asReadonly()

  async loadSettings() {
    const response = await firstValueFrom(
      this.http.get<ApiEnvelope<SettingsRecord>>('/settings/me'),
    )

    this.settingsState.set(response.data)
    return response.data
  }

  async loadRepos() {
    const response = await firstValueFrom(
      this.http.get<ApiEnvelope<RepoOption[]>>('/repos'),
    )

    this.reposState.set(response.data)
    return response.data
  }

  async saveSettings(input: SaveSettingsInput) {
    const response = await firstValueFrom(
      this.http.put<ApiEnvelope<SettingsRecord>>('/settings/me', input),
    )

    this.settingsState.set(response.data)
    return response.data
  }
}
