import { ChangeDetectionStrategy, Component, inject } from '@angular/core'
import { ZardButtonComponent } from '../../../../shared/components/button'
import {
  Z_MODAL_DATA,
  ZardDialogRef,
} from '../../../../shared/components/dialog'

export interface ResendDialogData {
  sentAt: string
  onConfirm: () => void
}

@Component({
  selector: 'app-resend-confirm-dialog',
  standalone: true,
  imports: [ZardButtonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-col gap-4 p-4">
      <p class="text-sm text-muted-foreground font-[var(--font-ibm)]">
        Standup já enviado em {{ data.sentAt }}. Deseja enviar novamente?
      </p>
      <div class="flex flex-col-reverse gap-[12px] md:flex-row md:justify-end pt-[4px]">
        <button type="button" z-button zType="outline" class="md:min-w-[140px]" (click)="onCancel()">
          $ cancelar
        </button>
        <button type="button" z-button zType="default" class="md:min-w-[180px]" (click)="onConfirm()">
          $ enviar novamente
        </button>
      </div>
    </div>
  `,
})
export class ResendConfirmDialog {
  private readonly dialogRef = inject(ZardDialogRef<ResendConfirmDialog>)
  readonly data = inject<ResendDialogData>(Z_MODAL_DATA)

  onCancel() {
    this.dialogRef.close()
  }

  onConfirm() {
    this.data.onConfirm()
    this.dialogRef.close()
  }
}
