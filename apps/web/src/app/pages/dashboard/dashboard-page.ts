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

@Component({
  selector: 'app-dashboard-page',
  imports: [SidebarLayout, MetricCard, StandupTable, FilterBar],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-sidebar-layout>
      <section class="min-h-screen bg-[var(--bg-page)] text-[var(--text-primary)] p-[20px] md:p-[40px] flex flex-col gap-[24px] md:gap-[40px]">
        <div class="flex flex-col gap-[8px]">
          <div class="flex items-center gap-[12px]">
            <span class="text-[var(--accent-green)] font-[var(--font-jetbrains)] text-[24px] md:text-[32px] font-bold">>></span>
            <span class="text-[var(--text-primary)] font-[var(--font-jetbrains)] text-[20px] md:text-[28px] font-bold">standups</span>
          </div>
          <div class="text-[var(--text-secondary)] font-[var(--font-ibm)] text-[14px]">
            // daily standup reports overview
          </div>
        </div>

        @if (standupService.standups.isLoading()) {
          <div class="text-[var(--text-secondary)] font-[var(--font-ibm)] text-[13px]">// loading standups...</div>
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
            (statusChange)="statusFilter.set($event)"
            (dateChange)="dateFilter.set($event)"
            (searchChange)="searchFilter.set($event)"
          />

          <app-standup-table
            [standups]="visibleStandups()"
            [total]="filteredStandups().length"
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

  readonly statusFilter = signal('all')
  readonly dateFilter = signal('this_week')
  readonly searchFilter = signal('')

  readonly filteredStandups = computed(() => {
    const search = this.searchFilter().trim().toLowerCase()

    return this.standupService.standups.value().filter((standup) => {
      const matchesStatus =
        this.statusFilter() === 'all'
          ? true
          : standup.status === this.statusFilter()
      const matchesDate =
        this.dateFilter() === 'this_week'
          ? standup.date >= '2026-03-03'
          : standup.date === this.dateFilter()
      const matchesSearch =
        search.length === 0
          ? true
          : `${standup.id} ${standup.contentPreview}`
              .toLowerCase()
              .includes(search)

      return matchesStatus && matchesDate && matchesSearch
    })
  })

  readonly visibleStandups = computed(() => this.filteredStandups().slice(0, 5))

  readonly metricCards = computed(() => {
    const metrics = this.standupService.metrics()

    return [
      {
        label: 'total_standups',
        value: metrics.total.count,
        change: metrics.total.change,
        dotColor: 'bg-[var(--text-secondary)]',
        valueColor: 'text-[var(--text-primary)]',
        changeColor: 'text-[var(--text-secondary)]',
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
        changeColor: 'text-[var(--text-secondary)]',
      },
      {
        label: 'rejected',
        value: metrics.rejected.count,
        change: metrics.rejected.change,
        dotColor: 'bg-[var(--accent-amber)]',
        valueColor: 'text-[var(--accent-amber)]',
        changeColor: 'text-[var(--text-secondary)]',
      },
    ]
  })

  openStandup(id: string) {
    void this.router.navigate(['/standups', id])
  }
}
