import { HttpClient } from '@angular/common/http'
import { computed, Injectable, inject } from '@angular/core'
import type { CreateQueryResult } from '@tanstack/angular-query-experimental'
import {
  injectMutation,
  injectQuery,
  QueryClient,
} from '@tanstack/angular-query-experimental'
import {
  getListReposQueryKey,
  listRepos,
} from '../../../api/endpoints/repos/repos'
import {
  getGetMeSettingsQueryKey,
  getMeSettings,
  updateMeSettings,
} from '../../../api/endpoints/settings/settings'
import type {
  MeSettingsRecordDto,
  MeSettingsResponseDto,
  PutMeSettingsDto,
  RepoInfoDto,
  RepoListResponseDto,
} from '../../../api/model'

export type RepoOption = RepoInfoDto

export type SettingsRecord = MeSettingsRecordDto

export interface SaveSettingsInput {
  standupCron: string
  reminderCron: string
  recoveryCron: string
  timezone: string
  gitAuthor: string
  selectedRepos: string[]
  active: boolean
  emailTheme: 'light' | 'dark'
}

@Injectable({ providedIn: 'root' })
export class SettingsService {
  private readonly http = inject(HttpClient)
  private readonly queryClient = inject(QueryClient)

  // --- TanStack Query: settings (uses Orval-generated getMeSettings) ---
  private readonly settingsQuery: CreateQueryResult<
    MeSettingsRecordDto | null,
    unknown
  > = injectQuery(() => ({
    queryKey: getGetMeSettingsQueryKey(),
    queryFn: async ({ signal }) => {
      const response: MeSettingsResponseDto = await getMeSettings(this.http, {
        signal,
      })
      return response.data
    },
    enabled: false,
  }))

  // --- TanStack Query: repos (uses Orval-generated listRepos) ---
  private readonly reposQuery: CreateQueryResult<RepoInfoDto[], unknown> =
    injectQuery(() => ({
      queryKey: getListReposQueryKey(),
      queryFn: async ({ signal }) => {
        const response: RepoListResponseDto = await listRepos(this.http, {
          signal,
        })
        return response.data
      },
      enabled: false,
    }))

  // --- TanStack Mutation: save settings (uses Orval-generated updateMeSettings) ---
  private readonly saveSettingsMutation = injectMutation(() => ({
    mutationKey: ['updateMeSettings'],
    mutationFn: async (vars: {
      data: PutMeSettingsDto
    }): Promise<MeSettingsRecordDto> => {
      const response: MeSettingsResponseDto = await updateMeSettings(
        this.http,
        vars.data,
      )
      return response.data
    },
    onSuccess: (data: unknown) => {
      this.queryClient.setQueryData(getGetMeSettingsQueryKey(), data)
    },
  }))

  readonly settings = computed(() => this.settingsQuery.data() ?? null)
  readonly repos = computed<RepoInfoDto[]>(() => this.reposQuery.data() ?? [])

  async loadSettings(): Promise<MeSettingsRecordDto> {
    const response: MeSettingsResponseDto = await getMeSettings(this.http)
    this.queryClient.setQueryData(getGetMeSettingsQueryKey(), response.data)
    return response.data
  }

  async loadRepos(): Promise<RepoInfoDto[]> {
    const response: RepoListResponseDto = await listRepos(this.http)
    this.queryClient.setQueryData(getListReposQueryKey(), response.data)
    return response.data
  }

  async saveSettings(input: SaveSettingsInput): Promise<MeSettingsRecordDto> {
    const result = await this.saveSettingsMutation.mutateAsync({ data: input })
    return result as MeSettingsRecordDto
  }
}
