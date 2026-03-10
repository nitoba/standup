import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  Injector,
  inject,
  signal,
  viewChild,
} from '@angular/core'
import { ZardButtonComponent } from '../../../../shared/components/button'
import {
  Z_MODAL_DATA,
  ZardDialogRef,
} from '../../../../shared/components/dialog'
import { ZardInputDirective } from '../../../../shared/components/input'

export interface AdjustDialogData {
  onSubmit(instruction: string): void
}

@Component({
  selector: 'app-adjust-dialog-content',
  imports: [ZardButtonComponent, ZardInputDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-col gap-[16px]">
      <textarea
        #instructionField
        z-input
        class="min-h-[180px] w-full resize-y"
        placeholder="tell the generator what should change..."
        aria-label="Adjust standup instructions"
        [value]="instruction()"
        (input)="instruction.set(asInstruction($event))"
      ></textarea>

      <div class="flex flex-col-reverse gap-[12px] md:flex-row md:justify-end">
        <button type="button" z-button zType="outline" (click)="onCancel()">
          $ cancel
        </button>

        <button
          type="button"
          z-button
          zType="secondary"
          [zDisabled]="!canSubmit()"
          (click)="onSubmit()"
        >
          $ submit
        </button>
      </div>
    </div>
  `,
})
export class AdjustDialogContent {
  private readonly injector = inject(Injector)
  private readonly dialogRef = inject(ZardDialogRef<AdjustDialogContent>)
  private readonly data = inject<AdjustDialogData>(Z_MODAL_DATA)

  readonly instruction = signal('')
  readonly canSubmit = computed(() => this.instruction().trim().length > 0)
  readonly instructionField =
    viewChild<ElementRef<HTMLTextAreaElement>>('instructionField')

  constructor() {
    afterNextRender(
      () => {
        this.instructionField()?.nativeElement.focus()
      },
      { injector: this.injector },
    )
  }

  onCancel() {
    this.resetInstruction()
    this.dialogRef.close()
  }

  onSubmit() {
    if (!this.canSubmit()) {
      return
    }

    const nextInstruction = this.instruction().trim()
    this.resetInstruction()
    this.dialogRef.close()
    this.data.onSubmit(nextInstruction)
  }

  asInstruction(event: Event): string {
    return (event.target as HTMLTextAreaElement).value
  }

  private resetInstruction() {
    this.instruction.set('')
  }
}
