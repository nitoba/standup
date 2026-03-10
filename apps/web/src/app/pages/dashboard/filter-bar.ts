import {
  ChangeDetectionStrategy,
  Component,
  output,
  signal,
} from '@angular/core'
import { ZardButtonComponent } from '../../shared/components/button'
import { ZardInputDirective } from '../../shared/components/input'

type DateSelection = 'this_week' | 'today' | 'yesterday'

@Component({
  selector: 'app-filter-bar',
  imports: [ZardButtonComponent, ZardInputDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-col gap-[16px]">
      <div class="text-muted-foreground font-[var(--font-jetbrains)] text-[12px]">// filters</div>
      <div class="flex flex-wrap items-center gap-[8px] md:gap-[16px]">
        <button
          type="button"
          z-button
          zType="outline"
          zSize="sm"
          (click)="cycleStatus()"
        >
          <span class="text-muted-foreground">/</span>
          <span>status: {{ status() }}</span>
        </button>

        <button
          type="button"
          z-button
          zType="outline"
          zSize="sm"
          (click)="cycleDate()"
        >
          <span class="text-muted-foreground">/</span>
          <span>date: {{ displayDateLabel(date()) }}</span>
        </button>

        <div class="w-full md:flex-1 border border-border bg-card px-[12px] md:px-[16px] py-[6px] md:py-[8px] flex items-center gap-[8px] transition-colors duration-150 focus-within:border-[var(--accent-green)]">
          <span class="text-muted-foreground font-[var(--font-jetbrains)] text-[12px] md:text-[13px]">/</span>
          <input
            type="text"
            z-input
            zBorderless
            placeholder="search standups..."
            class="flex-1"
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
  readonly date = signal<DateSelection>('this_week')
  readonly search = signal('')

  formatDate(date: Date) {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')

    return `${year}-${month}-${day}`
  }

  startOfToday(now: Date) {
    const today = new Date(now)
    today.setHours(0, 0, 0, 0)

    return today
  }

  minusDays(date: Date, days: number) {
    const nextDate = new Date(date)
    nextDate.setDate(nextDate.getDate() - days)

    return nextDate
  }

  resolveDateValue(selection: DateSelection, now = new Date()) {
    if (selection === 'this_week') {
      return 'this_week'
    }

    const today = this.startOfToday(now)

    return selection === 'today'
      ? this.formatDate(today)
      : this.formatDate(this.minusDays(today, 1))
  }

  displayDateLabel(selection: DateSelection) {
    return selection === 'this_week'
      ? 'this_week'
      : this.resolveDateValue(selection)
  }

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
        ? 'today'
        : this.date() === 'today'
          ? 'yesterday'
          : 'this_week'

    this.date.set(next)
    this.dateChange.emit(this.resolveDateValue(next))
  }

  updateSearch(value: string) {
    this.search.set(value)
    this.searchChange.emit(value)
  }

  asInputValue(event: Event): string {
    return (event.target as HTMLInputElement).value
  }
}
