import {
  ChangeDetectionStrategy,
  Component,
  output,
  signal,
} from '@angular/core'

@Component({
  selector: 'app-filter-bar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-col gap-[16px]">
      <div class="text-[var(--text-secondary)] font-[var(--font-jetbrains)] text-[12px]">// filters</div>
      <div class="flex items-center gap-[16px]">
        <button
          type="button"
          class="border border-[var(--border)] px-[16px] py-[8px] flex items-center gap-[8px] font-[var(--font-jetbrains)] text-[13px] text-[var(--text-primary)] cursor-pointer transition-colors duration-150 hover:border-[var(--text-secondary)] hover:bg-[var(--bg-surface)]"
          (click)="cycleStatus()"
        >
          <span class="text-[var(--text-secondary)]">/</span>
          <span>status: {{ status() }}</span>
        </button>

        <button
          type="button"
          class="border border-[var(--border)] px-[16px] py-[8px] flex items-center gap-[8px] font-[var(--font-jetbrains)] text-[13px] text-[var(--text-primary)] cursor-pointer transition-colors duration-150 hover:border-[var(--text-secondary)] hover:bg-[var(--bg-surface)]"
          (click)="cycleDate()"
        >
          <span class="text-[var(--text-secondary)]">/</span>
          <span>date: {{ date() }}</span>
        </button>

        <div class="flex-1 border border-[var(--border)] px-[16px] py-[8px] flex items-center gap-[8px] transition-colors duration-150 focus-within:border-[var(--accent-green)]">
          <span class="text-[var(--text-secondary)] font-[var(--font-jetbrains)] text-[13px]">/</span>
          <input
            type="text"
            placeholder="search standups..."
            class="flex-1 bg-transparent font-[var(--font-jetbrains)] text-[13px] text-[var(--text-tertiary)] outline-none"
            aria-label="Search standups"
            [value]="search()"
            (input)="updateSearch(asInputValue($event))"
          />
        </div>
      </div>
    </div>
  `,
})
export class FilterBar {
  readonly statusChange = output<string>()
  readonly dateChange = output<string>()
  readonly searchChange = output<string>()

  readonly status = signal<'all' | 'pending_review' | 'approved' | 'rejected'>(
    'all',
  )
  readonly date = signal<'this_week' | '2026-03-09' | '2026-03-08'>('this_week')
  readonly search = signal('')

  cycleStatus() {
    const next =
      this.status() === 'all'
        ? 'pending_review'
        : this.status() === 'pending_review'
          ? 'approved'
          : this.status() === 'approved'
            ? 'rejected'
            : 'all'

    this.status.set(next)
    this.statusChange.emit(next)
  }

  cycleDate() {
    const next =
      this.date() === 'this_week'
        ? '2026-03-09'
        : this.date() === '2026-03-09'
          ? '2026-03-08'
          : 'this_week'

    this.date.set(next)
    this.dateChange.emit(next)
  }

  updateSearch(value: string) {
    this.search.set(value)
    this.searchChange.emit(value)
  }

  asInputValue(event: Event): string {
    return (event.target as HTMLInputElement).value
  }
}
