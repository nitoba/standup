import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
} from '@angular/core'
import { ZardSwitchComponent } from '../../../../shared/components/switch'

@Component({
  selector: 'app-automation-section',
  imports: [ZardSwitchComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="border border-border bg-card p-[16px] md:p-[24px] flex flex-col gap-[16px]">
      <div class="flex items-center gap-[8px]">
        <span class="text-muted-foreground/70 font-[var(--font-jetbrains)] text-[14px]">//</span>
        <span class="text-card-foreground font-[var(--font-jetbrains)] text-[14px] font-medium">
          automação
        </span>
      </div>
      <div class="flex items-center justify-between">
        <div class="flex flex-col gap-[2px]">
          <span class="text-foreground font-[var(--font-jetbrains)] text-[13px]">ativo</span>
          <span class="text-muted-foreground font-[var(--font-ibm)] text-[12px]">
            habilitar geração automática de standup
          </span>
        </div>
        <z-switch
          aria-label="Alternar ativo"
          [zChecked]="active()"
          (zCheckedChange)="activeChange.emit($event)"
        />
      </div>
    </div>
  `,
})
export class AutomationSection {
  active = input.required<boolean>()
  activeChange = output<boolean>()
}
