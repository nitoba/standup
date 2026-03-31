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
  sendToDiscord,
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
import type {
  DashboardMetricChangesDto,
  DashboardMetrics,
  Standup,
  StandupCustomEntriesDto,
  StandupEvent,
  StandupFailedEvent,
  StandupGeneratedEvent,
  StandupPage,
  StandupProgressEvent,
  StandupStatusChangedEvent,
} from '../../../shared/models/standup-models'
import { StandupEventsService } from './standup-events-service'
import { mapStandupRecordDtoToStandup } from './standup-view-mappers'

type TriggerAck = { ok: boolean; accepted: boolean; error?: string }

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
  private readonly sort = signal<ListStandupsParams['sort']>('date')
  private readonly sortDir = signal<ListStandupsParams['sortDir']>('desc')
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
      params.sort = this.sort()
      params.sortDir = this.sortDir()
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
          metricChanges: {
            total: { current: 0, previous: 0, delta: 0 },
            approved: { current: 0, previous: 0, delta: 0 },
            pending: { current: 0, previous: 0, delta: 0 },
            rejected: { current: 0, previous: 0, delta: 0 },
          },
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

  private readonly sendToDiscordMutation = injectMutation(() => ({
    mutationKey: ['sendToDiscord'],
    mutationFn: async (vars: { id: string }) => {
      return sendToDiscord(this.http, vars.id)
    },
    onSuccess: (_data: unknown, vars: { id: string }) => {
      void this.queryClient.invalidateQueries({
        queryKey: getGetStandupByIdQueryKey(vars.id),
      })
      void this.queryClient.invalidateQueries({
        queryKey: getListStandupsQueryKey(),
      })
    },
  }))

  readonly metrics = computed<DashboardMetrics>(() => {
    const metrics = this.standups.value().metricChanges
    const formatChange = (value: number) => {
      if (value > 0) return `++ ${value} esta_semana`
      if (value < 0) return `-- ${Math.abs(value)} vs_semana_passada`
      return '= 0 vs_semana_passada'
    }

    return {
      total: {
        count: metrics.total.current,
        change: formatChange(metrics.total.delta),
      },
      approved: {
        count: metrics.approved.current,
        change: formatChange(metrics.approved.delta),
      },
      pending: {
        count: metrics.pending.current,
        change: formatChange(metrics.pending.delta),
      },
      rejected: {
        count: metrics.rejected.current,
        change: formatChange(metrics.rejected.delta),
      },
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

  async sendToDiscordAction(id: string) {
    return this.sendToDiscordMutation.mutateAsync({ id })
  }

  // --- Private mapping helpers ---

  private mapStandupPage(response: StandupListResponseDto): StandupPage {
    return {
      items: response.data.map((dto) => this.mapStandup(dto)),
      pagination: response.pagination,
      summary: response.summary,
      metricChanges: response.metricChanges,
    }
  }

  private mapStandup(dto: StandupRecordDto): Standup {
    return mapStandupRecordDtoToStandup(dto)
  }
}
