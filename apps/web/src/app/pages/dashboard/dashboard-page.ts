import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core'
import { Router } from '@angular/router'

import { SidebarLayout } from '../../layout/sidebar'
import { StandupService } from '../../services/standup.service'
import { FilterBar } from './filter-bar'
import { MetricCard } from './metric-card'
import { StandupTable } from './standup-table'

function formatDate(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

function startOfToday(now: Date) {
  const today = new Date(now)
  today.setHours(0, 0, 0, 0)

  return today
}

function minusDays(date: Date, days: number) {
  const nextDate = new Date(date)
  nextDate.setDate(nextDate.getDate() - days)

  return nextDate
}

function resolveDateFilter(value: string, now = new Date()) {
  if (value === 'all_time') return undefined
  if (value === 'this_week') return 'this_week'

  const today = startOfToday(now)
  if (value === 'today') return formatDate(today)
  if (value === 'yesterday') return formatDate(minusDays(today, 1))

  return value
}

@Component({
  selector: 'app-dashboard-page',
  imports: [SidebarLayout, MetricCard, StandupTable, FilterBar],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-sidebar-layout>
      <section class="min-h-full bg-background text-foreground p-[20px] md:p-[40px] flex flex-col gap-[24px] md:gap-[40px]">
        <div class="flex flex-col gap-[8px]">
          <div class="flex items-center gap-[12px]">
            <span class="text-[var(--accent-green)] font-[var(--font-jetbrains)] text-[24px] md:text-[32px] font-bold">>></span>
            <span class="text-foreground font-[var(--font-jetbrains)] text-[20px] md:text-[28px] font-bold">standups</span>
          </div>
          <div class="text-muted-foreground font-[var(--font-ibm)] text-[14px]">
            // daily standup reports overview
          </div>
        </div>

        @if (standupService.standups.isLoading()) {
          <div class="text-muted-foreground font-[var(--font-ibm)] text-[13px]">// loading standups...</div>
        } @else if (standupService.standups.error()) {
          <div class="text-[var(--accent-red)] font-[var(--font-ibm)] text-[13px]">// failed to load standups</div>
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
            (statusChange)="onStatusChange($event)"
            (dateChange)="onDateChange($event)"
            (searchChange)="onSearchChange($event)"
          />

          <app-standup-table
            [standups]="visibleStandups()"
            [total]="searchFilteredStandups().length"
            (viewStandup)="openStandup($event)"
          />
        }
      </section>
    </app-sidebar-layout>
  `,
})
export class DashboardPage {
  readonly standupService = inject(StandupService)
  private readonly router = inject(Router)

  readonly statusFilter = signal<string | undefined>(undefined)
  readonly dateFilter = signal<string | undefined>(undefined)
  readonly searchFilter = signal('')

  readonly searchFilteredStandups = computed(() => {
    const search = this.searchFilter().trim().toLowerCase()

    return this.standupService.standups.value().filter((standup) => {
      const matchesSearch =
        search.length === 0
          ? true
          : `${standup.id} ${standup.contentPreview}`
              .toLowerCase()
              .includes(search)

      return matchesSearch
    })
  })

  readonly visibleStandups = computed(() => this.searchFilteredStandups())

  readonly metricCards = computed(() => {
    const metrics = this.standupService.metrics()

    return [
      {
        label: 'total_standups',
        value: metrics.total.count,
        change: metrics.total.change,
        dotColor: 'bg-muted-foreground',
        valueColor: 'text-foreground',
        changeColor: 'text-muted-foreground',
      },
      {
        label: 'approved',
        value: metrics.approved.count,
        change: metrics.approved.change,
        dotColor: 'bg-[var(--accent-green)]',
        valueColor: 'text-[var(--accent-green)]',
        changeColor: 'text-[var(--accent-green)]',
      },
      {
        label: 'pending_review',
        value: metrics.pending.count,
        change: metrics.pending.change,
        dotColor: 'bg-[var(--accent-cyan)]',
        valueColor: 'text-[var(--accent-cyan)]',
        changeColor: 'text-muted-foreground',
      },
      {
        label: 'rejected',
        value: metrics.rejected.count,
        change: metrics.rejected.change,
        dotColor: 'bg-[var(--accent-amber)]',
        valueColor: 'text-[var(--accent-amber)]',
        changeColor: 'text-muted-foreground',
      },
    ]
  })

  openStandup(id: string) {
    void this.router.navigate(['/standups', id])
  }

  onStatusChange(value: string) {
    const nextStatus = value === 'all' ? undefined : value
    this.statusFilter.set(nextStatus)
    this.standupService.setDashboardFilters({
      status: this.statusFilter(),
      date: this.dateFilter(),
    })
  }

  onDateChange(value: string) {
    this.dateFilter.set(resolveDateFilter(value))
    this.standupService.setDashboardFilters({
      status: this.statusFilter(),
      date: this.dateFilter(),
    })
  }

  onSearchChange(value: string) {
    this.searchFilter.set(value)
  }
}
