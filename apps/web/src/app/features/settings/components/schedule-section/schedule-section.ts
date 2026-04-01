import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
  TemplateRef,
  viewChild,
} from '@angular/core'
import {
  ZardComboboxComponent,
  type ZardComboboxOption,
} from '../../../../shared/components/combobox'
import { ZardInputDirective } from '../../../../shared/components/input'
import {
  ZardPopoverComponent,
  ZardPopoverDirective,
} from '../../../../shared/components/popover'
import { CronBuilderComponent } from '../cron-builder/cron-builder'
import { type CronFieldKey } from './types'

interface FormFieldState {
  touched: () => boolean
  invalid: () => boolean
  errors: () => Array<{ message?: string }>
}

@Component({
  selector: 'app-schedule-section',
  imports: [
    ZardPopoverComponent,
    ZardPopoverDirective,
    ZardInputDirective,
    ZardComboboxComponent,
    CronBuilderComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-col gap-[16px]">
      @for (field of cronFields; track field.key) {
        <div class="flex flex-col gap-[6px]">
          <label [for]="field.key" class="text-muted-foreground font-[var(--font-jetbrains)] text-[12px]">
            {{ field.label }}
          </label>
          <div class="relative">
            <input
              [id]="field.key"
              type="text"
              z-input
              zPopover
              readonly
              title="Clique para abrir o construtor visual de cron"
              class="cursor-pointer pr-[86px]"
              [value]="cronValue(field.key)"
              [zContent]="getPopoverTemplate(field.key)"
              [zVisible]="popoverVisibility()[field.key]"
              [attr.aria-haspopup]="'dialog'"
              [attr.aria-expanded]="popoverVisibility()[field.key]"
              (click)="onCronFieldClick(field.key)"
              (zVisibleChange)="onPopoverVisibilityChange(field.key, $event)"
            />
            <span
              class="pointer-events-none absolute right-[12px] top-1/2 -translate-y-1/2 font-[var(--font-jetbrains)] text-[11px] text-primary"
            >
              // montar
            </span>
          </div>
          <span class="text-muted-foreground/70 font-[var(--font-ibm)] text-[11px]">
            // clique para montar o agendamento visualmente
          </span>
          @if (cronField(field.key).touched() && cronField(field.key).invalid()) {
            <span class="text-[var(--accent-red)] font-[var(--font-ibm)] text-[11px]">
              {{ cronField(field.key).errors()[0]?.message }}
            </span>
          }
        </div>
      }

      <div class="flex flex-col gap-[6px]">
        <label class="text-muted-foreground font-[var(--font-jetbrains)] text-[12px]">
          timezone
        </label>
        <z-combobox
          id="timezone"
          zWidth="full"
          placeholder="selecionar fuso horário"
          searchPlaceholder="buscar fuso horário..."
          [options]="timezoneOptions()"
          [value]="timezone()"
          [ariaLabel]="'Fuso horário'"
          (zValueChange)="onTimezoneChange($event)"
        />
        @if (timezoneField().touched() && timezoneField().invalid()) {
          <span class="text-[var(--accent-red)] font-[var(--font-ibm)] text-[11px]">
            {{ timezoneField().errors()[0]?.message }}
          </span>
        }
      </div>
    </div>

    <ng-template #standupCronPopover>
      <z-popover
        [class]="'max-w-[calc(100vw-32px)] w-[340px] border-[#2a2a2a] bg-[#0a0a0a] p-0 text-white shadow-[0_20px_60px_rgba(0,0,0,0.65)]'"
      >
        <app-cron-builder
          [value]="standupCron()"
          (applied)="onCronBuilderApply('standupCron', $event)"
          (canceled)="cronBuilderCancel.emit()"
        />
      </z-popover>
    </ng-template>

    <ng-template #reminderCronPopover>
      <z-popover
        [class]="'max-w-[calc(100vw-32px)] w-[340px] border-[#2a2a2a] bg-[#0a0a0a] p-0 text-white shadow-[0_20px_60px_rgba(0,0,0,0.65)]'"
      >
        <app-cron-builder
          [value]="reminderCron()"
          (applied)="onCronBuilderApply('reminderCron', $event)"
          (canceled)="cronBuilderCancel.emit()"
        />
      </z-popover>
    </ng-template>

    <ng-template #recoveryCronPopover>
      <z-popover
        [class]="'max-w-[calc(100vw-32px)] w-[340px] border-[#2a2a2a] bg-[#0a0a0a] p-0 text-white shadow-[0_20px_60px_rgba(0,0,0,0.65)]'"
      >
        <app-cron-builder
          [value]="recoveryCron()"
          (applied)="onCronBuilderApply('recoveryCron', $event)"
          (canceled)="cronBuilderCancel.emit()"
        />
      </z-popover>
    </ng-template>
  `,
})
export class ScheduleSection {
  standupCron = input.required<string>()
  reminderCron = input.required<string>()
  recoveryCron = input.required<string>()
  timezone = input.required<string>()
  timezoneOptions = input.required<ZardComboboxOption[]>()
  popoverVisibility = input.required<Record<CronFieldKey, boolean>>()
  standupCronField = input.required<FormFieldState>()
  reminderCronField = input.required<FormFieldState>()
  recoveryCronField = input.required<FormFieldState>()
  timezoneField = input.required<FormFieldState>()

  standupCronChange = output<string>()
  reminderCronChange = output<string>()
  recoveryCronChange = output<string>()
  timezoneChange = output<string | null>()
  popoverVisibilityChange = output<Record<CronFieldKey, boolean>>()
  cronBuilderApply = output<{ field: CronFieldKey; value: string }>()
  cronBuilderCancel = output<void>()

  protected readonly cronFields = [
    { key: 'standupCron' as CronFieldKey, label: 'standup_cron' },
    { key: 'reminderCron' as CronFieldKey, label: 'reminder_cron' },
    { key: 'recoveryCron' as CronFieldKey, label: 'recovery_cron' },
  ]

  protected readonly standupCronPopover =
    viewChild.required<TemplateRef<unknown>>('standupCronPopover')
  protected readonly reminderCronPopover = viewChild.required<
    TemplateRef<unknown>
  >('reminderCronPopover')
  protected readonly recoveryCronPopover = viewChild.required<
    TemplateRef<unknown>
  >('recoveryCronPopover')

  protected cronValue(key: CronFieldKey): string {
    switch (key) {
      case 'standupCron':
        return this.standupCron()
      case 'reminderCron':
        return this.reminderCron()
      case 'recoveryCron':
        return this.recoveryCron()
    }
  }

  protected cronField(key: CronFieldKey): FormFieldState {
    switch (key) {
      case 'standupCron':
        return this.standupCronField()
      case 'reminderCron':
        return this.reminderCronField()
      case 'recoveryCron':
        return this.recoveryCronField()
    }
  }

  protected getPopoverTemplate(key: CronFieldKey): TemplateRef<unknown> {
    switch (key) {
      case 'standupCron':
        return this.standupCronPopover()
      case 'reminderCron':
        return this.reminderCronPopover()
      case 'recoveryCron':
        return this.recoveryCronPopover()
    }
  }

  protected onCronFieldClick(key: CronFieldKey) {
    const current = this.popoverVisibility()
    this.popoverVisibilityChange.emit({ ...current, [key]: !current[key] })
  }

  protected onPopoverVisibilityChange(key: CronFieldKey, visible: boolean) {
    const current = this.popoverVisibility()
    this.popoverVisibilityChange.emit({ ...current, [key]: visible })
  }

  onCronBuilderApply(key: CronFieldKey, value: string) {
    this.cronBuilderApply.emit({ field: key, value })
    switch (key) {
      case 'standupCron':
        this.standupCronChange.emit(value)
        break
      case 'reminderCron':
        this.reminderCronChange.emit(value)
        break
      case 'recoveryCron':
        this.recoveryCronChange.emit(value)
        break
    }
  }

  protected onTimezoneChange(value: string | null) {
    this.timezoneChange.emit(value)
  }
}
