import { HttpClient, HttpErrorResponse } from '@angular/common/http'
import { computed, Injectable, inject, signal } from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import type { CreateQueryResult } from '@tanstack/angular-query-experimental'
import {
  injectMutation,
  injectQuery,
  QueryClient,
} from '@tanstack/angular-query-experimental'
import { toast } from 'ngx-sonner'
import {
  approveStandup,
  getGetStandupByIdQueryKey,
  getListStandupsQueryKey,
  getStandupById,
  listStandups,
  triggerStandup,
  updateStandupStatus,
} from '../../../api/endpoints/standups/standups'
import type {
  ApproveStandupResponseDto,
  ListStandupsParams,
  StandupDetailResponseDto,
  StandupListResponseDto,
  StandupRecordDto,
  TriggerAcceptedDto,
  TriggerStandupDto,
} from '../../../api/model'
import { METRIC_CHANGES } from '../../../shared/models/mock-data'
import type {
  DashboardMetrics,
  Standup,
  StandupCustomEntriesDto,
  StandupEvent,
  StandupFailedEvent,
  StandupGeneratedEvent,
  StandupPage,
  StandupProgressEvent,
  StandupSection,
  StandupSourceRepo,
  StandupStatus,
  StandupStatusChangedEvent,
} from '../../../shared/models/standup-models'
import { formatTimestampPtBr } from '../../../shared/utils'
import { StandupEventsService } from './standup-events-service'

type TriggerAck = { ok: boolean; accepted: boolean; error?: string }

type SourceDataDto = {
  repos?: Array<{
    repoName?: string
    commits?: Array<{ hash?: string; subject?: string; message?: string }>
  }>
}

@Injectable({ providedIn: 'root' })
export class StandupService {
  private readonly http = inject(HttpClient)
  private readonly eventsService = inject(StandupEventsService)
  private readonly queryClient = inject(QueryClient)

  private readonly DEFAULT_PAGE_SIZE = 20

  private readonly statusFilter = signal<string | undefined>(undefined)
  private readonly dateFilter = signal<string | undefined>(undefined)
  private readonly searchFilter = signal<string | undefined>(undefined)
  private readonly page = signal(1)
  private readonly pageSize = signal(this.DEFAULT_PAGE_SIZE)
  readonly activeProgress = signal<StandupProgressEvent | undefined>(undefined)

  // --- TanStack Query: list standups (uses Orval-generated listStandups) ---
  private readonly standupsQuery: CreateQueryResult<StandupPage, unknown> =
    injectQuery(() => {
      const params: ListStandupsParams = {
        page: this.page(),
        pageSize: this.pageSize(),
      }
      const status = this.statusFilter()
      const date = this.dateFilter()
      const search = this.searchFilter()
      if (status && status !== 'all')
        params.status = status as ListStandupsParams['status']
      if (date && date !== 'all') params.date = date
      if (search) params.search = search

      return {
        queryKey: getListStandupsQueryKey(params),
        queryFn: async ({ signal: abortSignal }) => {
          const response = await listStandups(this.http, params, {
            signal: abortSignal,
          })
          return this.mapStandupPage(response)
        },
      }
    })

  readonly standups = {
    isLoading: computed(() => this.standupsQuery.isPending()),
    error: computed(() => this.standupsQuery.error()),
    value: computed<StandupPage>(
      () =>
        this.standupsQuery.data() ?? {
          items: [],
          pagination: {
            page: 1,
            pageSize: this.DEFAULT_PAGE_SIZE,
            total: 0,
            totalPages: 0,
          },
          summary: { total: 0, approved: 0, pending: 0, rejected: 0 },
        },
    ),
    reload: () => {
      void this.queryClient.invalidateQueries({
        queryKey: getListStandupsQueryKey(),
      })
    },
  }

  // --- TanStack Query: single standup (uses Orval-generated getStandupById) ---
  private readonly selectedStandupId = signal<string | undefined>(undefined)

  private readonly standupDetailQuery: CreateQueryResult<
    Standup | undefined,
    unknown
  > = injectQuery(() => {
    const id = this.selectedStandupId()
    return {
      queryKey: getGetStandupByIdQueryKey(id ?? ''),
      enabled: !!id,
      queryFn: async ({ signal: abortSignal }) => {
        const response: StandupDetailResponseDto = await getStandupById(
          this.http,
          id!,
          { signal: abortSignal },
        )
        return this.mapStandup(response.data)
      },
    }
  })

  readonly selectedStandup = {
    isLoading: computed(() => this.standupDetailQuery.isPending()),
    error: computed(() => this.standupDetailQuery.error()),
    value: computed<Standup | undefined>(() => this.standupDetailQuery.data()),
    reload: () => {
      const id = this.selectedStandupId()
      if (id) {
        void this.queryClient.invalidateQueries({
          queryKey: getGetStandupByIdQueryKey(id),
        })
      }
    },
  }

  // --- TanStack Mutations (all using Orval-generated functions) ---

  private readonly approveMutation = injectMutation(() => ({
    mutationKey: ['approveStandup'],
    mutationFn: async (vars: {
      id: string
      customEntries?: StandupCustomEntriesDto | null
    }): Promise<{ standup: Standup; warning?: string | null }> => {
      const response: ApproveStandupResponseDto = await approveStandup(
        this.http,
        vars.id,
        { customEntries: vars.customEntries ?? null },
      )
      return {
        standup: this.mapStandup(response.data),
        warning: response.warning,
      }
    },
    onSuccess: (
      _data: unknown,
      vars: { id: string; customEntries?: StandupCustomEntriesDto | null },
    ) => {
      void this.queryClient.invalidateQueries({
        queryKey: getListStandupsQueryKey(),
      })
      void this.queryClient.invalidateQueries({
        queryKey: getGetStandupByIdQueryKey(vars.id),
      })
    },
  }))

  private readonly rejectMutation = injectMutation(() => ({
    mutationKey: ['updateStandupStatus'],
    mutationFn: async (vars: { id: string }): Promise<Standup> => {
      const response = await updateStandupStatus(this.http, vars.id, {
        status: 'rejected',
      })
      return this.mapStandup(response.data)
    },
    onSuccess: (_data: unknown, vars: { id: string }) => {
      void this.queryClient.invalidateQueries({
        queryKey: getListStandupsQueryKey(),
      })
      void this.queryClient.invalidateQueries({
        queryKey: getGetStandupByIdQueryKey(vars.id),
      })
    },
  }))

  private readonly triggerMutation = injectMutation(() => ({
    mutationKey: ['triggerStandup'],
    mutationFn: (vars: { data: TriggerStandupDto }) =>
      triggerStandup(this.http, vars.data),
    onSuccess: () => {
      void this.queryClient.invalidateQueries({
        queryKey: getListStandupsQueryKey(),
      })
    },
  }))

  readonly metrics = computed<DashboardMetrics>(() => {
    const counts = this.standups.value().summary
    return {
      total: { count: counts.total, change: METRIC_CHANGES.total },
      approved: { count: counts.approved, change: METRIC_CHANGES.approved },
      pending: { count: counts.pending, change: METRIC_CHANGES.pending },
      rejected: { count: counts.rejected, change: METRIC_CHANGES.rejected },
    }
  })

  constructor() {
    this.eventsService.standupEvents$
      .pipe(takeUntilDestroyed())
      .subscribe((event) => this.handleStandupEvent(event))
  }

  private handleStandupEvent(event: StandupEvent) {
    if (event.type === 'standup_progress') {
      this.handleProgressEvent(event)
      return
    }
    if (event.type === 'standup_generated') {
      this.handleGeneratedEvent(event)
      return
    }
    if (event.type === 'standup_status_changed') {
      this.handleStatusChangedEvent(event)
      return
    }
    this.handleFailedEvent(event)
  }

  private handleProgressEvent(event: StandupProgressEvent) {
    this.activeProgress.set(event)
    if (event.step === 'no_activity') {
      this.activeProgress.set(undefined)
      toast.info('Nenhuma atividade encontrada para gerar o standup de hoje.')
      this.standups.reload()
    }
  }

  private handleGeneratedEvent(_event: StandupGeneratedEvent) {
    this.activeProgress.set(undefined)
    this.standups.reload()
    if (this.selectedStandupId()) this.selectedStandup.reload()
    toast.success('Standup gerado e pronto para revisão!')
  }

  private handleStatusChangedEvent(_event: StandupStatusChangedEvent) {
    this.standups.reload()
    if (this.selectedStandupId()) this.selectedStandup.reload()
  }

  private handleFailedEvent(event: StandupFailedEvent) {
    this.activeProgress.set(undefined)
    toast.error(`Falha ao gerar standup: ${event.message}`)
  }

  setDashboardFilters(filters: {
    status?: string | null
    date?: string | null
    search?: string | null
  }) {
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

  selectStandup(id: string | undefined) {
    this.selectedStandupId.set(id)
  }

  // --- Public mutation API ---

  async approve(id: string, customEntries?: StandupCustomEntriesDto | null) {
    const result = await this.approveMutation.mutateAsync({ id, customEntries })
    return result as { standup: Standup; warning?: string | null }
  }

  async reject(id: string) {
    const result = await this.rejectMutation.mutateAsync({ id })
    return result as Standup
  }

  async adjust(id: string, instruction: string) {
    return this.triggerMutation.mutateAsync({
      data: {
        forceRegenerate: true,
        rewriteFromStandupId: id,
        rewriteInstruction: instruction,
        replaceStandupId: id,
      },
    })
  }

  async regenerate(id: string) {
    return this.triggerMutation.mutateAsync({
      data: {
        forceRegenerate: true,
        replaceStandupId: id,
        reuseExistingSource: true,
      },
    })
  }

  async trigger(extraContext?: string): Promise<TriggerAck> {
    const dto: TriggerStandupDto = { forceRegenerate: true }
    if (extraContext?.trim()) dto.extraContext = extraContext.trim()

    try {
      const result = (await this.triggerMutation.mutateAsync({
        data: dto,
      })) as TriggerAcceptedDto
      return { ok: result.ok, accepted: result.accepted }
    } catch (error) {
      const httpError = error as HttpErrorResponse
      const body = httpError.error as
        | { message?: string; error?: string }
        | undefined
      return {
        ok: false,
        accepted: false,
        error:
          body?.message ??
          body?.error ??
          'Falha ao disparar geração do standup',
      }
    }
  }

  // --- Private mapping helpers ---

  private mapStandupPage(response: StandupListResponseDto): StandupPage {
    return {
      items: response.data.map((dto) => this.mapStandup(dto)),
      pagination: response.pagination,
      summary: response.summary,
    }
  }

  private mapStandup(dto: StandupRecordDto): Standup {
    return {
      id: dto.id,
      date: dto.date,
      status: this.mapStatus(dto.status),
      createdAt: this.formatTimestamp(dto.createdAt),
      content: dto.content,
      sourceData: this.formatSourceData(dto.sourceData),
      contentPreview: this.buildContentPreview(dto.content),
      customEntries: this.parseCustomEntries(dto.customEntries),
      sections: this.parseSections(dto.content),
      sources: this.parseSources(dto.sourceData),
    }
  }

  private parseCustomEntries(
    customEntries: unknown,
  ): StandupCustomEntriesDto | null {
    if (!customEntries || typeof customEntries !== 'object') return null
    const maybeEntries = customEntries as {
      scheduledMeetings?: unknown
      directCalls?: unknown
    }
    const scheduledMeetings = Array.isArray(maybeEntries.scheduledMeetings)
      ? maybeEntries.scheduledMeetings.filter(
          (v): v is string => typeof v === 'string',
        )
      : []
    const directCalls = Array.isArray(maybeEntries.directCalls)
      ? maybeEntries.directCalls.filter(
          (v): v is string => typeof v === 'string',
        )
      : []
    if (scheduledMeetings.length === 0 && directCalls.length === 0) return null
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
      .map((l) => l.trim())
      .find((l) => l.startsWith('- '))
    return preview ? preview.slice(2) : content.trim()
  }

  private parseSections(content: string): StandupSection[] {
    const lines = content.split('\n').map((l) => l.trim())
    const sections: StandupSection[] = []
    let cur: StandupSection | null = null
    for (const line of lines) {
      if (!line) continue
      if (line.startsWith('## ')) {
        cur = { title: line, tone: this.resolveSectionTone(line), items: [] }
        sections.push(cur)
        continue
      }
      if (line.startsWith('- ')) {
        if (!cur) {
          cur = { title: '## resumo', tone: 'default', items: [] }
          sections.push(cur)
        }
        cur.items.push(line)
      }
    }
    return sections
  }

  private resolveSectionTone(title: string): StandupSection['tone'] {
    const t = title.toLowerCase()
    if (t.includes('andamento')) return 'cyan'
    if (t.includes('bloqueio')) return 'muted'
    return 'default'
  }

  private parseSources(sourceData: string): StandupSourceRepo[] {
    try {
      const parsed = JSON.parse(sourceData) as SourceDataDto
      return (parsed.repos ?? []).map((repo) => ({
        name: this.formatRepoName(repo.repoName),
        commits: (repo.commits ?? []).map((c) => ({
          hash: c.hash ?? '',
          message: c.subject ?? c.message ?? '',
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

  private formatRepoName(name?: string) {
    const n = name?.trim() ?? ''
    if (!n) return 'unknown/'
    return n.endsWith('/') ? n : `${n}/`
  }

  private formatTimestamp(ts: number) {
    return formatTimestampPtBr(ts)
  }
}
