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

export interface GenerateDialogData {
  onSubmit(extraContext?: string): void
}

@Component({
  selector: 'app-generate-dialog-content',
  imports: [ZardButtonComponent, ZardInputDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-col gap-[16px]">
      <div class="flex flex-col gap-[8px]">
        <span class="text-muted-foreground/70 font-[var(--font-ibm)] text-[12px] leading-[1.6]">
          // isso vai coletar seus commits de hoje, enriquecer com dados do Azure DevOps e gerar o standup via IA
        </span>
      </div>

      <div class="flex flex-col gap-[8px]">
        <label
          for="extra-context"
          class="text-muted-foreground font-[var(--font-jetbrains)] text-[12px]"
        >
          extra_context
        </label>
        <textarea
          #contextField
          id="extra-context"
          z-input
          class="min-h-[120px] w-full resize-y"
          placeholder="contexto adicional para orientar a geracao... (opcional)"
          aria-label="Extra context for standup generation"
          [value]="extraContext()"
          (input)="extraContext.set(asTextValue($event))"
        ></textarea>
        <span class="text-muted-foreground/70 font-[var(--font-ibm)] text-[11px]">
          // ex: "hoje foquei em code review" ou "tive reuniao com o time de QA"
        </span>
      </div>

      <div class="flex flex-col-reverse gap-[12px] md:flex-row md:justify-end pt-[4px]">
        <button
          type="button"
          z-button
          zType="outline"
          class="md:min-w-[140px]"
          (click)="onCancel()"
        >
          $ cancelar
        </button>

        <button
          type="button"
          z-button
          zType="default"
          class="md:min-w-[180px]"
          (click)="onSubmit()"
        >
          $ gerar standup
        </button>
      </div>
    </div>
  `,
})
export class GenerateDialogContent {
  private readonly injector = inject(Injector)
  private readonly dialogRef = inject(ZardDialogRef<GenerateDialogContent>)
  private readonly data = inject<GenerateDialogData>(Z_MODAL_DATA)

  readonly extraContext = signal('')
  readonly hasContext = computed(() => this.extraContext().trim().length > 0)
  readonly contextField =
    viewChild<ElementRef<HTMLTextAreaElement>>('contextField')

  constructor() {
    afterNextRender(
      () => {
        this.contextField()?.nativeElement.focus()
      },
      { injector: this.injector },
    )
  }

  onCancel() {
    this.extraContext.set('')
    this.dialogRef.close()
  }

  onSubmit() {
    const context = this.extraContext().trim() || undefined
    this.extraContext.set('')
    this.dialogRef.close()
    this.data.onSubmit(context)
  }

  asTextValue(event: Event): string {
    return (event.target as HTMLTextAreaElement).value
  }
}
