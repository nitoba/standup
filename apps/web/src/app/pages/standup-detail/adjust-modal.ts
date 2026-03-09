import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  effect,
  Injector,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core'

@Component({
  selector: 'app-adjust-modal',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (open()) {
      <div
        class="fixed inset-0 z-50 flex items-center justify-center p-[20px]"
        style="background-color: color-mix(in srgb, var(--bg-page) 82%, transparent);"
      >
        <div
          class="absolute inset-0"
          aria-hidden="true"
          (click)="onCancel()"
        ></div>

        <section
          class="relative z-10 w-full max-w-[720px] border border-[var(--border)] bg-[var(--bg-surface)] p-[20px] md:p-[24px] flex flex-col gap-[16px] shadow-[0_0_24px_color-mix(in_srgb,var(--accent-cyan)_18%,transparent)]"
          role="dialog"
          aria-modal="true"
          [attr.aria-labelledby]="titleId"
        >
          <div class="flex items-center justify-between gap-[12px]">
            <h2
              [id]="titleId"
              class="text-[var(--accent-cyan)] font-[var(--font-jetbrains)] text-[16px] font-bold"
            >
              // adjust standup
            </h2>
            <span class="text-[var(--text-tertiary)] font-[var(--font-ibm)] text-[12px]">
              {{ loading() ? '// submitting...' : '// rewrite instructions' }}
            </span>
          </div>

          <textarea
            #instructionField
            class="min-h-[180px] w-full resize-y border border-[var(--border)] bg-[var(--bg-page)] px-[14px] py-[12px] font-[var(--font-ibm)] text-[13px] leading-[1.6] text-[var(--text-primary)] outline-none transition-colors duration-150 placeholder:text-[var(--text-tertiary)] focus:border-[var(--accent-cyan)]"
            placeholder="tell the generator what should change..."
            aria-label="Adjust standup instructions"
            [value]="instruction()"
            [disabled]="loading()"
            (input)="instruction.set(asInstruction($event))"
          ></textarea>

          <div class="flex flex-col-reverse gap-[12px] md:flex-row md:justify-end">
            <button
              type="button"
              class="h-[44px] md:h-auto border border-[var(--border)] px-[20px] py-[10px] text-[var(--text-secondary)] font-[var(--font-jetbrains)] text-[12px] font-medium transition-all duration-150 flex items-center justify-center"
              [disabled]="loading()"
              [class.cursor-not-allowed]="loading()"
              [class.opacity-50]="loading()"
              [class.cursor-pointer]="!loading()"
              [class.hover:border-[var(--text-secondary)]]="!loading()"
              [class.hover:text-[var(--text-primary)]]="!loading()"
              (click)="onCancel()"
            >
              $ cancel
            </button>

            <button
              type="button"
              class="h-[44px] md:h-auto border border-[var(--accent-cyan)] px-[20px] py-[10px] text-[var(--accent-cyan)] font-[var(--font-jetbrains)] text-[12px] font-medium transition-all duration-150 flex items-center justify-center"
              [disabled]="!canSubmit()"
              [class.cursor-not-allowed]="!canSubmit()"
              [class.opacity-50]="!canSubmit()"
              [class.cursor-pointer]="canSubmit()"
              [class.hover:bg-[var(--accent-cyan)]]="canSubmit()"
              [class.hover:text-[var(--bg-page)]]="canSubmit()"
              [class.hover:shadow-[0_0_12px_var(--accent-cyan)]]="canSubmit()"
              (click)="onSubmit()"
            >
              $ submit
            </button>
          </div>
        </section>
      </div>
    }
  `,
})
export class AdjustModal {
  private readonly injector = inject(Injector)

  readonly open = input(false)
  readonly loading = input(false)

  readonly submitInstruction = output<string>()
  readonly close = output<void>()

  readonly instruction = signal('')
  readonly canSubmit = computed(
    () => this.instruction().trim().length > 0 && !this.loading(),
  )
  readonly instructionField =
    viewChild<ElementRef<HTMLTextAreaElement>>('instructionField')
  readonly titleId = 'adjust-standup-title'

  constructor() {
    effect(() => {
      if (!this.open()) {
        this.resetInstruction()
        return
      }

      afterNextRender(
        () => {
          this.instructionField()?.nativeElement.focus()
        },
        { injector: this.injector },
      )
    })
  }

  onCancel() {
    this.resetInstruction()
    this.close.emit()
  }

  onSubmit() {
    if (!this.canSubmit()) {
      return
    }

    const nextInstruction = this.instruction().trim()
    this.submitInstruction.emit(nextInstruction)
    this.resetInstruction()
  }

  asInstruction(event: Event): string {
    return (event.target as HTMLTextAreaElement).value
  }

  private resetInstruction() {
    this.instruction.set('')
  }
}
