import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core'
import { Router } from '@angular/router'
import { toast } from 'ngx-sonner'

import { SidebarLayout } from '../../core/layout/sidebar'
import { ZardButtonComponent } from '../../shared/components/button'
import { ZardDialogService } from '../../shared/components/dialog'
import { formatLocalDate, minusDays, startOfLocalDay } from '../../shared/utils'
import { DashboardSkeleton } from './components/dashboard-skeleton/dashboard-skeleton'
import { FilterBar } from './components/filter-bar/filter-bar'
import { GenerateDialogContent } from './components/generate-dialog/generate-dialog-content'
import { MetricCard } from './components/metric-card/metric-card'
import { StandupTable } from './components/standup-table/standup-table'
import { StandupService } from './services/standup-service'

function resolveDateFilter(value: string, now = new Date()) {
  if (value === 'all_time') return undefined
  if (value === 'this_week') return 'this_week'

  const today = startOfLocalDay(now)
  if (value === 'today') return formatLocalDate(today)
  if (value === 'yesterday') return formatLocalDate(minusDays(today, 1))

  return value
}

@Component({
  selector: 'app-dashboard-page',
  imports: [
    SidebarLayout,
    MetricCard,
    StandupTable,
    FilterBar,
    ZardButtonComponent,
    DashboardSkeleton,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-sidebar-layout>
      <section class="bg-background text-foreground p-[20px] md:p-[40px] flex flex-col gap-[24px] md:gap-[40px]">
        <div class="flex flex-col gap-[8px]">
          <div class="flex items-center justify-between gap-[12px]">
            <div class="flex items-center gap-[12px]">
              <span class="text-primary font-[var(--font-jetbrains)] text-[24px] md:text-[32px] font-bold">>></span>
              <span class="text-foreground font-[var(--font-jetbrains)] text-[20px] md:text-[28px] font-bold">standups</span>
            </div>
            <button
              type="button"
              z-button
              class="cursor-pointer"
              zType="default"
              (click)="openGenerateModal()"
            >
              $ gerar standup
            </button>
          </div>
          <div class="text-muted-foreground font-[var(--font-ibm)] text-[14px]">
            // visão geral dos relatórios diários de standup
          </div>
        </div>

        @if (standupService.activeProgress(); as progress) {
          <div class="rounded-[12px] border border-border bg-card px-[16px] py-[14px] flex flex-col gap-[6px]">
            <div class="flex items-center gap-[10px]">
              <span class="inline-flex h-[10px] w-[10px] rounded-full bg-[var(--accent-yellow)] animate-pulse"></span>
              <span class="text-foreground font-[var(--font-jetbrains)] text-[12px] md:text-[13px]">
                {{ progress.mode }} :: {{ progress.step }}
              </span>
            </div>
            <span class="text-muted-foreground font-[var(--font-ibm)] text-[13px] leading-[1.6]">
              {{ progress.message }}
            </span>
          </div>
        }

        @if (standupService.standups.isLoading()) {
          <app-dashboard-skeleton />
        } @else if (standupService.standups.error()) {
          <div class="text-[var(--accent-red)] font-[var(--font-ibm)] text-[13px]">// falha ao carregar standups</div>
        } @else if (showFirstAccessEmptyState()) {
          <div class="border border-border bg-card p-[24px] md:p-[32px] flex flex-col gap-[12px]">
            <div class="text-foreground font-[var(--font-jetbrains)] text-[14px] md:text-[16px]">
              // seu dashboard ainda está vazio
            </div>
            <div class="text-muted-foreground font-[var(--font-ibm)] text-[13px] leading-[1.7]">
              configure seus repositórios e gere seu primeiro standup para começar a acompanhar suas métricas e histórico.
            </div>
            <div class="flex items-center gap-[12px]">
              <button type="button" z-button zType="default" (click)="openGenerateModal()">
                $ gerar primeiro standup
              </button>
              <button type="button" z-button zType="ghost" (click)="openSettings()">
                $ abrir configurações
              </button>
            </div>
          </div>
        } @else {
          <div class="grid grid-cols-2 md:grid-cols-4 gap-[16px] md:gap-[24px]">
            @for (card of metricCards(); track card.label) {
              <app-metric-card
                [label]="card.label"
                [value]="card.value"
                [change]="card.change"
                [dotColor]="card.dotColor"
                [valueColor]="card.valueColor"
                [changeColor]="card.changeColor"
              />
            }
          </div>

          <app-filter-bar
            [status]="selectedStatus()"
            [date]="selectedDate()"
            [search]="searchFilter()"
            [pageSize]="selectedPageSize()"
            (statusChange)="onStatusChange($event)"
            (dateChange)="onDateChange($event)"
            (searchChange)="onSearchChange($event)"
            (pageSizeChange)="onPageSizeChange($event)"
          />

          <app-standup-table
            [standups]="visibleStandups()"
            [total]="pagination().total"
            [page]="pagination().page"
            [pageSize]="pagination().pageSize"
            [totalPages]="pagination().totalPages"
            (viewStandup)="openStandup($event)"
            (pageChange)="onPageChange($event)"
          />
        }
      </section>
    </app-sidebar-layout>
  `,
})
export class DashboardPage {
  readonly standupService = inject(StandupService)
  private readonly router = inject(Router)
  private readonly dialogService = inject(ZardDialogService)

  readonly statusFilter = signal<string | undefined>(undefined)
  readonly dateFilter = signal<string | undefined>(undefined)
  readonly searchFilter = signal('')
  readonly pageSizeFilter = signal(20)

  readonly selectedStatus = computed(
    () =>
      (this.statusFilter() as
        | 'delivery_pending'
        | 'pending_review'
        | 'approved'
        | 'rejected'
        | undefined) ?? 'all',
  )
  readonly selectedDate = computed(() => {
    const date = this.dateFilter()
    if (!date) return 'all_time' as const
    if (date === 'this_week') return 'this_week' as const

    const today = resolveDateFilter('today')
    const yesterday = resolveDateFilter('yesterday')
    if (date === today) return 'today' as const
    if (date === yesterday) return 'yesterday' as const
    return 'all_time' as const
  })
  readonly selectedPageSize = this.pageSizeFilter.asReadonly()

  readonly visibleStandups = computed(
    () => this.standupService.standups.value().items,
  )
  readonly pagination = this.standupService.pagination
  readonly showFirstAccessEmptyState = computed(() => {
    const hasNoStandups =
      this.visibleStandups().length === 0 && this.pagination().total === 0
    const hasActiveFilters =
      this.statusFilter() !== undefined ||
      this.dateFilter() !== undefined ||
      this.searchFilter().trim().length > 0

    return hasNoStandups && !hasActiveFilters
  })

  readonly metricCards = computed(() => {
    const metrics = this.standupService.metrics()

    return [
      {
        label: 'total de standups',
        value: metrics.total.count,
        change: metrics.total.change,
        dotColor: 'bg-muted-foreground',
        valueColor: 'text-foreground',
        changeColor: 'text-muted-foreground',
      },
      {
        label: 'aprovados',
        value: metrics.approved.count,
        change: metrics.approved.change,
        dotColor: 'bg-primary',
        valueColor: 'text-primary',
        changeColor: 'text-primary',
      },
      {
        label: 'pendentes',
        value: metrics.pending.count,
        change: metrics.pending.change,
        dotColor: 'bg-[var(--accent-yellow)]',
        valueColor: 'text-[var(--accent-yellow)]',
        changeColor: 'text-muted-foreground',
      },
      {
        label: 'rejeitados',
        value: metrics.rejected.count,
        change: metrics.rejected.change,
        dotColor: 'bg-[var(--accent-red)]',
        valueColor: 'text-[var(--accent-red)]',
        changeColor: 'text-muted-foreground',
      },
    ]
  })

  openGenerateModal() {
    this.dialogService.create({
      zTitle: '// gerar standup',
      zContent: GenerateDialogContent,
      zHideFooter: true,
      zWidth: '640px',
      zData: {
        onSubmit: (extraContext?: string) => {
          void this.triggerGeneration(extraContext)
        },
      },
    })
  }

  async triggerGeneration(extraContext?: string) {
    if (this.standupService.activeProgress()) {
      toast.info('Já existe um standup em processamento.')
      return
    }

    try {
      const result = await this.standupService.trigger(extraContext)
      if (result.accepted && result.ok) {
        toast.success(
          'Solicitação aceita — você será notificado quando o standup estiver pronto.',
        )
        await this.router.navigate(['/dashboard'])
      } else {
        toast.error(result.error ?? 'Falha ao disparar geração do standup')
      }
    } catch {
      toast.error('Falha ao disparar geração do standup')
    }
  }

  openStandup(id: string) {
    void this.router.navigate(['/standups', id])
  }

  openSettings() {
    void this.router.navigate(['/settings'])
  }

  onStatusChange(value: string) {
    const nextStatus = value === 'all' ? undefined : value
    this.statusFilter.set(nextStatus)
    this.standupService.setDashboardFilters({
      status: this.statusFilter(),
      date: this.dateFilter(),
      search: this.searchFilter(),
    })
  }

  onDateChange(value: string) {
    this.dateFilter.set(resolveDateFilter(value))
    this.standupService.setDashboardFilters({
      status: this.statusFilter(),
      date: this.dateFilter(),
      search: this.searchFilter(),
    })
  }

  onSearchChange(value: string) {
    this.searchFilter.set(value)
    this.standupService.setDashboardFilters({
      status: this.statusFilter(),
      date: this.dateFilter(),
      search: this.searchFilter(),
    })
  }

  onPageChange(page: number) {
    this.standupService.setDashboardPage(page)
  }

  onPageSizeChange(pageSize: number) {
    this.pageSizeFilter.set(pageSize)
    this.standupService.setDashboardPageSize(pageSize)
    this.standupService.setDashboardFilters({
      status: this.statusFilter(),
      date: this.dateFilter(),
      search: this.searchFilter(),
    })
  }
}
