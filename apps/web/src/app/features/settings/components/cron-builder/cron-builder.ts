import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
  output,
  signal,
} from '@angular/core'

type CronDayKey = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'

interface CronBuilderDraft {
  hour: number
  minute: number
  days: CronDayKey[]
}

interface CronDayOption {
  key: CronDayKey
  label: string
  cronValue: number
}

const CRON_DAY_OPTIONS: CronDayOption[] = [
  { key: 'mon', label: 'seg', cronValue: 1 },
  { key: 'tue', label: 'ter', cronValue: 2 },
  { key: 'wed', label: 'qua', cronValue: 3 },
  { key: 'thu', label: 'qui', cronValue: 4 },
  { key: 'fri', label: 'sex', cronValue: 5 },
  { key: 'sat', label: 'sáb', cronValue: 6 },
  { key: 'sun', label: 'dom', cronValue: 0 },
]

const DEFAULT_DRAFT: CronBuilderDraft = {
  hour: 17,
  minute: 30,
  days: ['mon', 'tue', 'wed', 'thu', 'fri'],
}

const WEEKDAY_KEYS: CronDayKey[] = ['mon', 'tue', 'wed', 'thu', 'fri']
const WEEKEND_KEYS: CronDayKey[] = ['sat', 'sun']
const ALL_DAY_KEYS = CRON_DAY_OPTIONS.map((day) => day.key)

@Component({
  selector: 'app-cron-builder',
  imports: [],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'block w-full',
  },
  template: `
    <section class="w-full text-white">
      <div class="flex flex-col gap-4 p-6">
        <header class="flex flex-col gap-1">
          <div class="flex items-center gap-2">
            <span
              class="font-[var(--font-jetbrains)] text-[14px] text-[#6b7280]"
            >
              //
            </span>
            <span
              class="font-[var(--font-jetbrains)] text-[14px] font-medium text-white"
            >
              construtor_de_cron
            </span>
          </div>
          <p class="font-[var(--font-ibm)] text-[12px] text-[#6b7280]">
            monte seu agendamento visualmente
          </p>
        </header>

        <div class="flex items-center gap-3">
          <div class="flex min-w-0 flex-1 flex-col gap-1.5">
            <span class="font-[var(--font-jetbrains)] text-[12px] text-[#6b7280]">
              hora
            </span>
            <div class="flex items-center gap-2">
              <button
                type="button"
                class="font-[var(--font-jetbrains)] text-[12px] text-[#6b7280] transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#10b981]"
                aria-label="Aumentar hora"
                (click)="incrementHour()"
              >
                ++
              </button>
              <div
                class="min-w-[50px] border border-[#2a2a2a] px-4 py-2 text-center font-[var(--font-jetbrains)] text-[22px] tabular-nums text-white"
              >
                {{ hourLabel() }}
              </div>
              <button
                type="button"
                class="font-[var(--font-jetbrains)] text-[12px] text-[#6b7280] transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#10b981]"
                aria-label="Diminuir hora"
                (click)="decrementHour()"
              >
                --
              </button>
            </div>
          </div>

          <div class="pt-5 font-[var(--font-jetbrains)] text-[28px] text-white">
            :
          </div>

          <div class="flex min-w-0 flex-1 flex-col gap-1.5">
            <span class="font-[var(--font-jetbrains)] text-[12px] text-[#6b7280]">
              minuto
            </span>
            <div class="flex items-center gap-2">
              <button
                type="button"
                class="font-[var(--font-jetbrains)] text-[12px] text-[#6b7280] transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#10b981]"
                aria-label="Aumentar minuto"
                (click)="incrementMinute()"
              >
                ++
              </button>
              <div
                class="min-w-[50px] border border-[#2a2a2a] px-4 py-2 text-center font-[var(--font-jetbrains)] text-[22px] tabular-nums text-white"
              >
                {{ minuteLabel() }}
              </div>
              <button
                type="button"
                class="font-[var(--font-jetbrains)] text-[12px] text-[#6b7280] transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#10b981]"
                aria-label="Diminuir minuto"
                (click)="decrementMinute()"
              >
                --
              </button>
            </div>
          </div>
        </div>

        <div class="flex flex-col gap-3">
          <span class="font-[var(--font-jetbrains)] text-[12px] text-[#6b7280]">
            dias
          </span>
          <div class="grid grid-cols-7 gap-1">
            @for (day of dayOptions; track day.key) {
              <button
                type="button"
                class="h-9 border font-[var(--font-jetbrains)] text-[12px] lowercase transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#10b981]"
                [class]="dayButtonClasses(day.key)"
                [attr.aria-pressed]="isDaySelected(day.key)"
                (click)="toggleDay(day.key)"
              >
                {{ day.label }}
              </button>
            }
          </div>
        </div>

        <div class="flex flex-col gap-2">
          <span class="font-[var(--font-jetbrains)] text-[12px] text-[#6b7280]">
            saída
          </span>
          <div
            class="border border-[#2a2a2a] px-4 py-3 font-[var(--font-jetbrains)] text-[14px] text-white"
          >
            <span class="text-[#10b981]">></span>
            <span class="ml-2">{{ cronPreview() }}</span>
          </div>
          <p class="font-[var(--font-ibm)] text-[12px] text-[#6b7280]">
            // {{ scheduleDescription() }}
          </p>
        </div>
      </div>

      <footer
        class="flex items-center justify-end gap-3 border-t border-[#2a2a2a] px-6 py-4"
      >
        <button
          type="button"
          class="inline-flex h-10 items-center justify-center gap-2 border border-[#2a2a2a] px-4 font-[var(--font-jetbrains)] text-[12px] text-[#a1a1aa] transition-colors hover:border-[#3f3f46] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#10b981]"
          (click)="cancelSelection()"
        >
          <span>[x]</span>
          <span>cancelar</span>
        </button>
        <button
          type="button"
          class="inline-flex h-10 items-center justify-center gap-2 bg-[#10b981] px-4 font-[var(--font-jetbrains)] text-[12px] font-medium text-[#0a0a0a] transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#10b981] disabled:cursor-not-allowed disabled:opacity-50"
          [disabled]="!canApply()"
          (click)="applySelection()"
        >
          <span>></span>
          <span>aplicar</span>
        </button>
      </footer>
    </section>
  `,
})
export class CronBuilderComponent {
  readonly value = input('')
  readonly applied = output<string>()
  readonly canceled = output<void>()

  protected readonly dayOptions = CRON_DAY_OPTIONS

  private readonly draftState = signal<CronBuilderDraft>(DEFAULT_DRAFT)

  protected readonly draft = this.draftState.asReadonly()
  protected readonly hourLabel = computed(() =>
    this.draft().hour.toString().padStart(2, '0'),
  )
  protected readonly minuteLabel = computed(() =>
    this.draft().minute.toString().padStart(2, '0'),
  )
  protected readonly canApply = computed(() => this.draft().days.length > 0)
  protected readonly cronExpression = computed(() =>
    formatCronExpression(this.draft()),
  )
  protected readonly cronPreview = computed(() =>
    this.canApply() ? this.cronExpression() : 'selecione pelo menos um dia',
  )
  protected readonly scheduleDescription = computed(() =>
    this.canApply()
      ? describeDraft(this.draft())
      : 'selecione pelo menos um dia para montar a expressão cron',
  )

  constructor() {
    effect(() => {
      this.draftState.set(parseCronExpression(this.value()))
    })
  }

  protected incrementHour() {
    this.updateTime('hour', 1, 24)
  }

  protected decrementHour() {
    this.updateTime('hour', -1, 24)
  }

  protected incrementMinute() {
    this.updateTime('minute', 1, 60)
  }

  protected decrementMinute() {
    this.updateTime('minute', -1, 60)
  }

  protected toggleDay(dayKey: CronDayKey) {
    this.draftState.update((draft) => {
      const days = draft.days.includes(dayKey)
        ? draft.days.filter((value) => value !== dayKey)
        : [...draft.days, dayKey]

      return {
        ...draft,
        days: sortDayKeys(days),
      }
    })
  }

  protected isDaySelected(dayKey: CronDayKey) {
    return this.draft().days.includes(dayKey)
  }

  protected dayButtonClasses(dayKey: CronDayKey) {
    return this.isDaySelected(dayKey)
      ? 'border-[#10b981] bg-[#10b981] text-[#0a0a0a]'
      : 'border-[#2a2a2a] bg-transparent text-[#6b7280] hover:border-[#3f3f46] hover:text-white'
  }

  protected cancelSelection() {
    this.draftState.set(parseCronExpression(this.value()))
    this.canceled.emit()
  }

  protected applySelection() {
    if (!this.canApply()) {
      return
    }

    this.applied.emit(this.cronExpression())
  }

  private updateTime(
    field: keyof Pick<CronBuilderDraft, 'hour' | 'minute'>,
    delta: number,
    total: number,
  ) {
    this.draftState.update((draft) => {
      const nextValue = (((draft[field] + delta) % total) + total) % total
      return { ...draft, [field]: nextValue }
    })
  }
}

function parseCronExpression(value: string): CronBuilderDraft {
  const [minutePart, hourPart, , , dayPart] = value.trim().split(/\s+/)

  const minute = parseBoundedNumber(minutePart, 0, 59) ?? DEFAULT_DRAFT.minute
  const hour = parseBoundedNumber(hourPart, 0, 23) ?? DEFAULT_DRAFT.hour
  const days = parseDayPart(dayPart)

  return {
    hour,
    minute,
    days: days.length > 0 ? days : DEFAULT_DRAFT.days,
  }
}

function parseDayPart(dayPart?: string): CronDayKey[] {
  if (!dayPart || dayPart === '*') {
    return ALL_DAY_KEYS
  }

  const values = new Set<number>()

  for (const segment of dayPart.split(',')) {
    const trimmedSegment = segment.trim()
    if (!trimmedSegment) {
      continue
    }

    const [startPart, endPart] = trimmedSegment.split('-')
    if (!startPart) {
      continue
    }

    if (endPart !== undefined) {
      const startValue = normalizeDayNumber(startPart)
      const endValue = normalizeDayNumber(endPart)
      if (startValue === null || endValue === null || startValue > endValue) {
        continue
      }

      for (let current = startValue; current <= endValue; current += 1) {
        values.add(current)
      }
      continue
    }

    const value = normalizeDayNumber(startPart)
    if (value !== null) {
      values.add(value)
    }
  }

  return sortDayKeys(
    Array.from(values)
      .map(
        (value) => CRON_DAY_OPTIONS.find((day) => day.cronValue === value)?.key,
      )
      .filter((dayKey): dayKey is CronDayKey => dayKey !== undefined),
  )
}

function normalizeDayNumber(value: string): number | null {
  const parsed = Number(value)
  if (!Number.isInteger(parsed)) {
    return null
  }

  if (parsed === 7) {
    return 0
  }

  return parsed >= 0 && parsed <= 6 ? parsed : null
}

function parseBoundedNumber(
  value: string | undefined,
  min: number,
  max: number,
): number | null {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    return null
  }

  return parsed
}

function sortDayKeys(days: CronDayKey[]): CronDayKey[] {
  const weightMap = new Map(
    CRON_DAY_OPTIONS.map((day, index) => [day.key, index]),
  )
  return Array.from(new Set(days)).sort(
    (left, right) => (weightMap.get(left) ?? 0) - (weightMap.get(right) ?? 0),
  )
}

function formatCronExpression(draft: CronBuilderDraft): string {
  const dayValues = sortCronDayValues(
    draft.days
      .map(
        (dayKey) =>
          CRON_DAY_OPTIONS.find((day) => day.key === dayKey)?.cronValue,
      )
      .filter((value): value is number => value !== undefined),
  )

  const dayExpression = formatDayValues(dayValues)
  return `${draft.minute} ${draft.hour} * * ${dayExpression}`
}

function sortCronDayValues(values: number[]): number[] {
  return Array.from(new Set(values)).sort((left, right) => left - right)
}

function formatDayValues(values: number[]): string {
  if (values.length === 0) {
    return '*'
  }

  if (values.length === 7) {
    return '*'
  }

  const segments: string[] = []
  const firstValue = values[0]
  if (firstValue === undefined) {
    return '*'
  }

  let rangeStart = firstValue
  let previous = firstValue

  for (const current of values.slice(1)) {
    if (current === previous + 1) {
      previous = current
      continue
    }

    segments.push(formatRange(rangeStart, previous))
    rangeStart = current
    previous = current
  }

  segments.push(formatRange(rangeStart, previous))
  return segments.join(',')
}

function formatRange(start: number, end: number): string {
  return start === end ? start.toString() : `${start}-${end}`
}

function describeDraft(draft: CronBuilderDraft): string {
  const timeLabel = `${draft.hour.toString().padStart(2, '0')}:${draft.minute
    .toString()
    .padStart(2, '0')}`

  return `${describeDays(draft.days)} às ${timeLabel}`
}

function describeDays(days: CronDayKey[]): string {
  if (matchesDaySet(days, ALL_DAY_KEYS)) {
    return 'todos os dias'
  }

  if (matchesDaySet(days, WEEKDAY_KEYS)) {
    return 'todos os dias úteis'
  }

  if (matchesDaySet(days, WEEKEND_KEYS)) {
    return 'todo fim de semana'
  }

  return `dias: ${formatDayLabels(days)}`
}

function formatDayLabels(days: CronDayKey[]): string {
  return days
    .map(
      (day) => CRON_DAY_OPTIONS.find((option) => option.key === day)?.label ?? day,
    )
    .join(', ')
}

function matchesDaySet(current: CronDayKey[], expected: CronDayKey[]): boolean {
  return (
    current.length === expected.length &&
    current.every((day, index) => day === expected[index])
  )
}
