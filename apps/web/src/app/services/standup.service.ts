import { HttpClient, httpResource } from '@angular/common/http'
import { computed, Injectable, inject, signal } from '@angular/core'
import { firstValueFrom, map } from 'rxjs'

import { METRIC_CHANGES } from '../data/mock-data'
import type {
  ApproveStandupResponseDto,
  DashboardMetrics,
  Standup,
  StandupCustomEntriesDto,
  StandupListResponseDto,
  StandupPage,
  StandupSection,
  StandupSourceRepo,
  StandupStatus,
} from '../types/standup'

type ApiEnvelope<T> = { data: T }
type TriggerAck = { ok: boolean; accepted: boolean }
type DashboardFilters = {
  status?: string | null
  date?: string | null
  search?: string | null
}

type StandupDto = {
  id: string
  date: string
  meetingType: string
  content: string
  sourceData: string
  customEntries: unknown
  status: string
  userId: string | null
  createdAt: number
  updatedAt: number
}

type SourceDataDto = {
  repos?: Array<{
    repoName?: string
    commits?: Array<{ hash?: string; subject?: string; message?: string }>
  }>
}

@Injectable({ providedIn: 'root' })
export class StandupService {
  private readonly http = inject(HttpClient)

  private readonly DEFAULT_PAGE_SIZE = 20

  private readonly statusFilter = signal<string | undefined>(undefined)
  private readonly dateFilter = signal<string | undefined>(undefined)
  private readonly searchFilter = signal<string | undefined>(undefined)
  private readonly page = signal(1)
  private readonly pageSize = signal(this.DEFAULT_PAGE_SIZE)

  readonly standups = httpResource<StandupPage>(
    () => {
      const params: {
        status?: string
        date?: string
        search?: string
        page: string
        pageSize: string
      } = {
        page: String(this.page()),
        pageSize: String(this.pageSize()),
      }
      const status = this.statusFilter()
      const date = this.dateFilter()
      const search = this.searchFilter()
      if (status && status !== 'all') params.status = status
      if (date && date !== 'all') params.date = date
      if (search) params.search = search
      return { url: '/standups', params }
    },
    {
      defaultValue: {
        items: [],
        pagination: {
          page: 1,
          pageSize: this.DEFAULT_PAGE_SIZE,
          total: 0,
          totalPages: 0,
        },
        summary: { total: 0, approved: 0, pending: 0, rejected: 0 },
      },
      parse: (response) =>
        this.mapStandupPage(response as StandupListResponseDto),
    },
  )

  // Selected standup ID — set by detail page via selectStandup()
  private readonly selectedStandupId = signal<string | undefined>(undefined)

  // Reactive GET for single standup — refetches when selectedStandupId changes
  readonly selectedStandup = httpResource<Standup | undefined>(
    () => {
      const id = this.selectedStandupId()
      return id ? `/standups/${id}` : undefined
    },
    {
      parse: (response) =>
        this.mapStandup((response as ApiEnvelope<StandupDto>).data),
    },
  )

  // Metrics derived from the loaded standups list
  readonly metrics = computed<DashboardMetrics>(() => {
    const counts = this.standups.value().summary

    return {
      total: { count: counts.total, change: METRIC_CHANGES.total },
      approved: { count: counts.approved, change: METRIC_CHANGES.approved },
      pending: { count: counts.pending, change: METRIC_CHANGES.pending },
      rejected: { count: counts.rejected, change: METRIC_CHANGES.rejected },
    }
  })

  // Dashboard filter update — signals change triggers httpResource refetch
  setDashboardFilters(filters: DashboardFilters) {
    this.statusFilter.set(filters.status ?? undefined)
    this.dateFilter.set(filters.date ?? undefined)
    this.searchFilter.set(filters.search?.trim() || undefined)
    this.page.set(1)
  }

  setDashboardPage(page: number) {
    this.page.set(Math.max(page, 1))
  }

  setDashboardPageSize(pageSize: number) {
    this.pageSize.set(Math.max(pageSize, 1))
    this.page.set(1)
  }

  readonly pagination = computed(() => this.standups.value().pagination)

  // Detail page calls this to select which standup to load
  selectStandup(id: string | undefined) {
    this.selectedStandupId.set(id)
  }

  // Mutations — one-shot operations, firstValueFrom is appropriate
  async approve(id: string, customEntries?: StandupCustomEntriesDto | null) {
    const standup = await firstValueFrom(
      this.http
        .post<ApproveStandupResponseDto>(`/standups/${id}/approve`, {
          customEntries: customEntries ?? null,
        })
        .pipe(
          map((response) => ({
            standup: this.mapStandup(response.data),
            warning: response.warning,
          })),
        ),
    )
    this.standups.reload()
    return standup
  }

  async reject(id: string) {
    const standup = await firstValueFrom(
      this.http
        .patch<ApiEnvelope<StandupDto>>(`/standups/${id}/status`, {
          status: 'rejected',
        })
        .pipe(map((response) => this.mapStandup(response.data))),
    )
    this.standups.reload()
    return standup
  }

  async adjust(id: string, instruction: string) {
    return firstValueFrom(
      this.http.post<TriggerAck>('/standups/trigger', {
        forceRegenerate: true,
        rewriteFromStandupId: id,
        rewriteInstruction: instruction,
        replaceStandupId: id,
      }),
    )
  }

  async regenerate(id: string) {
    return firstValueFrom(
      this.http.post<TriggerAck>('/standups/trigger', {
        forceRegenerate: true,
        replaceStandupId: id,
      }),
    )
  }

  private mapStandupPage(response: StandupListResponseDto): StandupPage {
    return {
      items: response.data.map((dto) => this.mapStandup(dto)),
      pagination: response.pagination,
      summary: response.summary,
    }
  }

  // All the private mapping methods stay exactly the same
  private mapStandup(standup: StandupDto): Standup {
    return {
      id: standup.id,
      date: standup.date,
      status: this.mapStatus(standup.status),
      createdAt: this.formatTimestamp(standup.createdAt),
      content: standup.content,
      sourceData: this.formatSourceData(standup.sourceData),
      contentPreview: this.buildContentPreview(standup.content),
      customEntries: this.parseCustomEntries(standup.customEntries),
      sections: this.parseSections(standup.content),
      sources: this.parseSources(standup.sourceData),
    }
  }

  private parseCustomEntries(
    customEntries: unknown,
  ): StandupCustomEntriesDto | null {
    if (!customEntries || typeof customEntries !== 'object') {
      return null
    }

    const maybeEntries = customEntries as {
      scheduledMeetings?: unknown
      directCalls?: unknown
    }

    const scheduledMeetings = Array.isArray(maybeEntries.scheduledMeetings)
      ? maybeEntries.scheduledMeetings.filter(
          (value): value is string => typeof value === 'string',
        )
      : []
    const directCalls = Array.isArray(maybeEntries.directCalls)
      ? maybeEntries.directCalls.filter(
          (value): value is string => typeof value === 'string',
        )
      : []

    if (scheduledMeetings.length === 0 && directCalls.length === 0) {
      return null
    }

    return { scheduledMeetings, directCalls }
  }

  private mapStatus(status: string): StandupStatus {
    if (status === 'rejected') return 'rejected'
    if (status === 'approved' || status === 'published') return 'approved'
    return 'pending_review'
  }

  private buildContentPreview(content: string) {
    const preview = content
      .split('\n')
      .map((line) => line.trim())
      .find((line) => line.startsWith('- '))
    return preview ? preview.slice(2) : content.trim()
  }

  private parseSections(content: string): StandupSection[] {
    const lines = content.split('\n').map((line) => line.trim())
    const sections: StandupSection[] = []
    let currentSection: StandupSection | null = null
    for (const line of lines) {
      if (!line) continue
      if (line.startsWith('## ')) {
        currentSection = {
          title: line,
          tone: this.resolveSectionTone(line),
          items: [],
        }
        sections.push(currentSection)
        continue
      }
      if (line.startsWith('- ')) {
        if (!currentSection) {
          currentSection = { title: '## resumo', tone: 'default', items: [] }
          sections.push(currentSection)
        }
        currentSection.items.push(line)
      }
    }
    return sections
  }

  private resolveSectionTone(title: string): StandupSection['tone'] {
    const normalizedTitle = title.toLowerCase()
    if (normalizedTitle.includes('andamento')) return 'cyan'
    if (normalizedTitle.includes('bloqueio')) return 'muted'
    return 'default'
  }

  private parseSources(sourceData: string): StandupSourceRepo[] {
    try {
      const parsed = JSON.parse(sourceData) as SourceDataDto
      return (parsed.repos ?? []).map((repo) => ({
        name: this.formatRepoName(repo.repoName),
        commits: (repo.commits ?? []).map((commit) => ({
          hash: commit.hash ?? '',
          message: commit.subject ?? commit.message ?? '',
        })),
      }))
    } catch {
      return []
    }
  }

  private formatSourceData(sourceData: string) {
    try {
      return JSON.stringify(JSON.parse(sourceData), null, 2)
    } catch {
      return sourceData
    }
  }

  private formatRepoName(repoName?: string) {
    const trimmedName = repoName?.trim() ?? ''
    if (!trimmedName) return 'unknown/'
    return trimmedName.endsWith('/') ? trimmedName : `${trimmedName}/`
  }

  private formatTimestamp(timestamp: number) {
    const date = new Date(timestamp)
    const year = date.getUTCFullYear()
    const month = String(date.getUTCMonth() + 1).padStart(2, '0')
    const day = String(date.getUTCDate()).padStart(2, '0')
    const hours = String(date.getUTCHours()).padStart(2, '0')
    const minutes = String(date.getUTCMinutes()).padStart(2, '0')
    return `${year}-${month}-${day} ${hours}:${minutes}`
  }
}
