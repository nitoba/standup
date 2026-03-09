import { ChangeDetectionStrategy, Component, input } from '@angular/core'

@Component({
  selector: 'app-metric-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class:
      'metric-card border border-[var(--border)] p-[24px] flex flex-col gap-[12px]',
  },
  template: `
    <div class="flex items-center gap-[8px]">
      <span class="h-[6px] w-[6px] rounded-full" [class]="dotColor()"></span>
      <span class="text-[var(--text-secondary)] font-[var(--font-jetbrains)] text-[12px]">{{ label() }}</span>
    </div>
    <div class="font-[var(--font-jetbrains)] text-[28px] font-bold" [class]="valueColor()">
      {{ value() }}
    </div>
    <div class="font-[var(--font-ibm)] text-[12px]" [class]="changeColor()">
      {{ change() }}
    </div>
  `,
})
export class MetricCard {
  readonly label = input.required<string>()
  readonly value = input.required<number>()
  readonly change = input.required<string>()
  readonly dotColor = input.required<string>()
  readonly valueColor = input.required<string>()
  readonly changeColor = input.required<string>()
}
