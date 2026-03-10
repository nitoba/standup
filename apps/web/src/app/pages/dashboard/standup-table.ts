import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from '@angular/core'

import { ZardButtonComponent } from '../../shared/components/button'
import type { Standup, StandupStatus } from '../../types/standup'

@Component({
  selector: 'app-standup-table',
  imports: [ZardButtonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="border border-border bg-card flex flex-col">
      <!-- Desktop table header -->
      <div class="hidden md:block bg-accent/40 border-b border-border px-[20px] py-[12px]">
        <div class="grid grid-cols-[120px_120px_1fr_100px]">
          <span class="text-muted-foreground font-[var(--font-jetbrains)] text-[12px] font-medium">date</span>
          <span class="text-muted-foreground font-[var(--font-jetbrains)] text-[12px] font-medium">status</span>
          <span class="text-muted-foreground font-[var(--font-jetbrains)] text-[12px] font-medium">content_preview</span>
          <span class="text-muted-foreground font-[var(--font-jetbrains)] text-[12px] font-medium">actions</span>
        </div>
      </div>

      @for (standup of standups(); track standup.id) {
        <!-- Desktop row -->
        <div class="hidden md:grid border-b border-border px-[20px] py-[16px] grid-cols-[120px_120px_1fr_100px] items-center transition-colors duration-150 hover:bg-accent/30">
          <span class="text-foreground font-[var(--font-jetbrains)] text-[13px]">{{ standup.date }}</span>
          <span class="font-[var(--font-jetbrains)] text-[12px]" [class]="statusBadgeClass(standup.status)">
            {{ formatStatus(standup.status) }}
          </span>
          <span class="text-muted-foreground font-[var(--font-ibm)] text-[13px]">{{ standup.contentPreview }}</span>
          <button
            type="button"
            z-button
            zType="link"
            zSize="sm"
            class="justify-start px-0 text-[var(--accent-green)]"
            (click)="viewStandup.emit(standup.id)"
          >
            $ view >>
          </button>
        </div>

        <!-- Mobile card -->
        <div class="md:hidden border-b border-border px-[16px] py-[14px] flex flex-col gap-[8px] transition-colors duration-150 hover:bg-accent/30">
          <div class="flex items-center justify-between">
            <span class="text-foreground font-[var(--font-jetbrains)] text-[13px]">{{ standup.date }}</span>
            <span class="font-[var(--font-jetbrains)] text-[12px]" [class]="statusBadgeClass(standup.status)">
              {{ formatStatus(standup.status) }}
            </span>
          </div>
          <span class="text-muted-foreground font-[var(--font-ibm)] text-[12px] line-clamp-2">{{ standup.contentPreview }}</span>
          <button
            type="button"
            z-button
            zType="link"
            zSize="sm"
            class="justify-start px-0 text-[var(--accent-green)]"
            (click)="viewStandup.emit(standup.id)"
          >
            $ view >>
          </button>
        </div>
      }

      <div class="px-[16px] md:px-[20px] py-[12px] md:py-[16px] flex flex-col gap-[12px] md:flex-row md:items-center md:justify-between">
        <div class="flex flex-col gap-[4px]">
          <span class="text-muted-foreground font-[var(--font-ibm)] text-[11px] md:text-[12px]">
            // showing {{ rangeStart() }}-{{ rangeEnd() }}
          </span>
          <div class="flex items-center gap-[10px] text-[11px] md:text-[12px] font-[var(--font-jetbrains)]">
            <span class="text-foreground">page {{ page() }} of {{ totalPages() || 1 }}</span>
            <span class="text-muted-foreground">{{ total() }} total</span>
          </div>
        </div>

        <div class="flex items-center gap-[6px] md:gap-[8px]">
          <button type="button" z-button zType="ghost" zSize="sm" [zDisabled]="page() <= 1" (click)="previousPage()"><<</button>
          <div class="hidden md:flex items-center gap-[6px]">
            @for (item of pageItems(); track item.track) {
              @if (item.type === 'page') {
                <button
                  type="button"
                  z-button
                  [zType]="item.value === page() ? 'default' : 'ghost'"
                  zSize="sm"
                  class="min-w-[36px] px-[8px]"
                  [attr.aria-current]="item.value === page() ? 'page' : null"
                  (click)="goToPage(item.value)"
                >
                  {{ item.label }}
                </button>
              } @else {
                <span class="px-[4px] text-muted-foreground font-[var(--font-jetbrains)] text-[12px]">{{ item.label }}</span>
              }
            }
          </div>
          <span class="md:hidden text-foreground font-[var(--font-jetbrains)] text-[12px]">[{{ page() }}/{{ totalPages() || 1 }}]</span>
          <button type="button" z-button zType="ghost" zSize="sm" [zDisabled]="page() >= totalPages()" (click)="nextPage()">>></button>
        </div>
      </div>
    </div>
  `,
})
export class StandupTable {
  readonly standups = input.required<Standup[]>()
  readonly total = input.required<number>()
  readonly page = input.required<number>()
  readonly pageSize = input.required<number>()
  readonly totalPages = input.required<number>()
  readonly viewStandup = output<string>()
  readonly pageChange = output<number>()

  readonly pageItems = computed(() => {
    const totalPages = this.totalPages()
    const currentPage = this.page()

    if (totalPages <= 1) {
      return [{ type: 'page' as const, value: 1, label: '1', track: 'page-1' }]
    }

    const pages = new Set<number>([
      1,
      totalPages,
      currentPage,
      currentPage - 1,
      currentPage + 1,
    ])
    const orderedPages = Array.from(pages)
      .filter((value) => value >= 1 && value <= totalPages)
      .sort((left, right) => left - right)

    const items: Array<
      | { type: 'page'; value: number; label: string; track: string }
      | { type: 'ellipsis'; label: string; track: string }
    > = []

    for (let index = 0; index < orderedPages.length; index += 1) {
      const value = orderedPages[index]
      if (value === undefined) continue

      const previous = orderedPages[index - 1]
      if (previous !== undefined && value - previous > 1) {
        items.push({
          type: 'ellipsis',
          label: '...',
          track: `ellipsis-${previous}-${value}`,
        })
      }

      items.push({
        type: 'page',
        value,
        label: String(value),
        track: `page-${value}`,
      })
    }

    return items
  })

  readonly rangeStart = computed(() => {
    if (this.total() === 0) return 0
    return (this.page() - 1) * this.pageSize() + 1
  })

  readonly rangeEnd = computed(() => {
    if (this.total() === 0) return 0
    return Math.min(this.page() * this.pageSize(), this.total())
  })

  previousPage() {
    if (this.page() <= 1) return
    this.pageChange.emit(this.page() - 1)
  }

  nextPage() {
    if (this.page() >= this.totalPages()) return
    this.pageChange.emit(this.page() + 1)
  }

  goToPage(page: number) {
    if (page === this.page() || page < 1 || page > this.totalPages()) return
    this.pageChange.emit(page)
  }

  statusBadgeClass(status: StandupStatus) {
    if (status === 'approved') return 'text-[var(--accent-green)]'
    if (status === 'pending_review') return 'text-[var(--accent-cyan)]'
    return 'text-[var(--accent-amber)]'
  }

  formatStatus(status: StandupStatus) {
    if (status === 'pending_review') return '[pending]'
    return status === 'approved' ? '[approved]' : '[rejected]'
  }
}
