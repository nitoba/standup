import {
  ChangeDetectionStrategy,
  Component,
  computed,
  output,
  signal,
} from '@angular/core'
import {
  ZardComboboxComponent,
  type ZardComboboxOption,
} from '../../shared/components/combobox'
import { ZardInputDirective } from '../../shared/components/input'

type DateSelection = 'all_time' | 'this_week' | 'today' | 'yesterday'
type StatusSelection = 'all' | 'pending_review' | 'approved' | 'rejected'

@Component({
  selector: 'app-filter-bar',
  imports: [ZardComboboxComponent, ZardInputDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-col gap-[16px]">
      <div class="text-muted-foreground font-[var(--font-jetbrains)] text-[12px]">// filters</div>
      <div class="flex flex-wrap items-center gap-[10px] md:gap-[12px]">
        <z-combobox
          zWidth="full"
          class="w-full md:w-[210px]"
          [options]="statusOptions"
          [value]="status()"
          [searchable]="false"
          placeholder="select status"
          ariaLabel="Standup status filter"
          emptyText="No status available."
          (zValueChange)="onStatusSelected($event)"
        />

        <z-combobox
          zWidth="full"
          class="w-full md:w-[210px]"
          [options]="dateOptions"
          [value]="date()"
          [searchable]="false"
          placeholder="select date"
          ariaLabel="Standup date filter"
          emptyText="No date filter available."
          (zValueChange)="onDateSelected($event)"
        />

        <div class="h-[44px] w-full border border-border bg-card px-[12px] md:w-[250px] md:px-[14px] lg:w-[280px] flex items-center gap-[8px] transition-colors duration-150 focus-within:border-[var(--accent-green)]">
          <span class="text-muted-foreground font-[var(--font-jetbrains)] text-[12px] md:text-[13px]">/</span>
          <input
            type="text"
            z-input
            zBorderless
            placeholder="search standups..."
            class="flex-1 text-[12px] md:text-[13px]"
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
  readonly statusChange = output<StatusSelection>()
  readonly dateChange = output<DateSelection>()
  readonly searchChange = output<string>()

  readonly status = signal<StatusSelection>('all')
  readonly date = signal<DateSelection>('all_time')
  readonly search = signal('')
  readonly statusOptions: ZardComboboxOption[] = [
    { value: 'all', label: 'status: all' },
    { value: 'pending_review', label: 'status: pending_review' },
    { value: 'approved', label: 'status: approved' },
    { value: 'rejected', label: 'status: rejected' },
  ]
  readonly dateOptions: ZardComboboxOption[] = [
    { value: 'all_time', label: 'date: all_time' },
    { value: 'this_week', label: 'date: this_week' },
    { value: 'today', label: `date: ${this.resolveDateValue('today')}` },
    {
      value: 'yesterday',
      label: `date: ${this.resolveDateValue('yesterday')}`,
    },
  ]

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
    if (selection === 'all_time') {
      return 'all_time'
    }

    if (selection === 'this_week') {
      return 'this_week'
    }

    const today = this.startOfToday(now)

    return selection === 'today'
      ? this.formatDate(today)
      : this.formatDate(this.minusDays(today, 1))
  }

  displayDateLabel(selection: DateSelection) {
    return selection === 'all_time'
      ? 'all_time'
      : selection === 'this_week'
        ? 'this_week'
        : this.resolveDateValue(selection)
  }

  onStatusSelected(value: string | null) {
    if (value === null) {
      this.status.set('all')
      this.statusChange.emit('all')
      return
    }

    if (
      value !== 'all' &&
      value !== 'pending_review' &&
      value !== 'approved' &&
      value !== 'rejected'
    ) {
      return
    }

    this.status.set(value)
    this.statusChange.emit(value)
  }

  onDateSelected(value: string | null) {
    if (value === null) {
      this.date.set('all_time')
      this.dateChange.emit('all_time')
      return
    }

    if (
      value !== 'all_time' &&
      value !== 'this_week' &&
      value !== 'today' &&
      value !== 'yesterday'
    ) {
      return
    }

    this.date.set(value)
    this.dateChange.emit(value)
  }

  updateSearch(value: string) {
    this.search.set(value)
    this.searchChange.emit(value)
  }

  asInputValue(event: Event): string {
    return (event.target as HTMLInputElement).value
  }
}
