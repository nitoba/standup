import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from '@angular/core'
import {
  ZardComboboxComponent,
  type ZardComboboxOption,
} from '../../../../shared/components/combobox'
import { ZardInputDirective } from '../../../../shared/components/input'
import {
  formatLocalDate,
  minusDays,
  startOfLocalDay,
} from '../../../../shared/utils'

type DateSelection = 'all_time' | 'this_week' | 'today' | 'yesterday'
type StatusSelection = 'all' | 'pending_review' | 'approved' | 'rejected'

@Component({
  selector: 'app-filter-bar',
  imports: [ZardComboboxComponent, ZardInputDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-col gap-[16px]">
      <div class="text-muted-foreground font-[var(--font-jetbrains)] text-[12px]">// filtros</div>
      <div class="flex flex-wrap items-center gap-[10px] md:gap-[12px]">
        <z-combobox
          zWidth="full"
          class="w-full md:w-[210px]"
          [options]="statusOptions"
          [value]="status()"
          [searchable]="false"
          placeholder="selecionar status"
          ariaLabel="Filtro de status do standup"
          emptyText="Nenhum status disponível."
          (zValueChange)="onStatusSelected($event)"
        />

        <z-combobox
          zWidth="full"
          class="w-full md:w-[210px]"
          [options]="dateOptions"
          [value]="date()"
          [searchable]="false"
          placeholder="selecionar data"
          ariaLabel="Filtro de data do standup"
          emptyText="Nenhum filtro de data disponível."
          (zValueChange)="onDateSelected($event)"
        />

        <z-combobox
          zWidth="full"
          class="w-full md:w-[170px]"
          [options]="pageSizeOptions"
          [value]="pageSizeValue()"
          [searchable]="false"
          placeholder="itens por página"
          ariaLabel="Itens por página do standup"
          emptyText="Nenhuma opção de página disponível."
          (zValueChange)="onPageSizeSelected($event)"
        />

        <div class="h-[44px] w-full border border-border bg-card px-[12px] md:w-[250px] md:px-[14px] lg:w-[280px] flex items-center gap-[8px] transition-colors duration-150 focus-within:border-primary">
          <span class="text-muted-foreground font-[var(--font-jetbrains)] text-[12px] md:text-[13px]">/</span>
          <input
            type="text"
            z-input
            zBorderless
            placeholder="buscar standups..."
            class="flex-1 text-[12px] md:text-[13px]"
            aria-label="Buscar standups"
            [value]="search()"
            (input)="updateSearch(asInputValue($event))"
          />
        </div>
      </div>
    </div>
  `,
})
export class FilterBar {
  readonly status = input<StatusSelection>('all')
  readonly date = input<DateSelection>('all_time')
  readonly search = input('')
  readonly pageSize = input(20)

  readonly statusChange = output<StatusSelection>()
  readonly dateChange = output<DateSelection>()
  readonly searchChange = output<string>()
  readonly pageSizeChange = output<number>()
  readonly pageSizeValue = computed(() => `${this.pageSize()}`)
  readonly statusOptions: ZardComboboxOption[] = [
    { value: 'all', label: 'status: todos' },
    { value: 'pending_review', label: 'status: pendentes' },
    { value: 'approved', label: 'status: aprovados' },
    { value: 'rejected', label: 'status: rejeitados' },
  ]
  readonly dateOptions: ZardComboboxOption[] = [
    { value: 'all_time', label: 'data: todo o período' },
    { value: 'this_week', label: 'data: esta semana' },
    { value: 'today', label: `data: ${this.resolveDateValue('today')}` },
    {
      value: 'yesterday',
      label: `data: ${this.resolveDateValue('yesterday')}`,
    },
  ]
  readonly pageSizeOptions: ZardComboboxOption[] = [
    { value: '10', label: 'itens por página: 10' },
    { value: '20', label: 'itens por página: 20' },
    { value: '50', label: 'itens por página: 50' },
  ]

  formatDate(date: Date) {
    return formatLocalDate(date)
  }

  startOfToday(now: Date) {
    return startOfLocalDay(now)
  }

  minusDays(date: Date, days: number) {
    return minusDays(date, days)
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

    this.statusChange.emit(value)
  }

  onDateSelected(value: string | null) {
    if (value === null) {
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

    this.dateChange.emit(value)
  }

  updateSearch(value: string) {
    this.searchChange.emit(value)
  }

  onPageSizeSelected(value: string | null) {
    const resolved = value === null ? 20 : Number(value)
    if (![10, 20, 50].includes(resolved)) {
      return
    }

    this.pageSizeChange.emit(resolved)
  }

  asInputValue(event: Event): string {
    return (event.target as HTMLInputElement).value
  }
}
