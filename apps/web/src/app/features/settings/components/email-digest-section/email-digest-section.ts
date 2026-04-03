import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
} from '@angular/core'

@Component({
  selector: 'app-email-digest-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="border border-border bg-card p-[16px] md:p-[24px] flex flex-col gap-[16px]">
      <div class="flex items-center gap-[8px]">
        <span class="text-muted-foreground/70 font-[var(--font-jetbrains)] text-[14px]">//</span>
        <span class="text-card-foreground font-[var(--font-jetbrains)] text-[14px] font-medium">
          resumo_por_email
        </span>
      </div>
      <div class="flex items-center justify-between gap-[16px]">
        <div class="flex flex-col gap-[2px]">
          <span class="text-foreground font-[var(--font-jetbrains)] text-[13px]">tema_do_email</span>
          <span class="text-muted-foreground font-[var(--font-ibm)] text-[12px]">
            tema visual para os emails de resumo semanal
          </span>
        </div>
        <div class="flex items-center" role="group" aria-label="Tema do email">
          <button
            type="button"
            aria-label="Tema escuro"
            class="px-[14px] py-[7px] font-[var(--font-jetbrains)] text-[12px] border transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            [class]="
              emailTheme() === 'dark'
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border text-muted-foreground hover:text-foreground hover:border-foreground/40'
            "
            [attr.aria-pressed]="emailTheme() === 'dark'"
            (click)="emailThemeChange.emit('dark')"
          >
            escuro
          </button>
          <button
            type="button"
            aria-label="Tema claro"
            class="px-[14px] py-[7px] font-[var(--font-jetbrains)] text-[12px] border-y border-r transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            [class]="
              emailTheme() === 'light'
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border text-muted-foreground hover:text-foreground hover:border-foreground/40'
            "
            [attr.aria-pressed]="emailTheme() === 'light'"
            (click)="emailThemeChange.emit('light')"
          >
            claro
          </button>
        </div>
      </div>
    </div>
  `,
})
export class EmailDigestSection {
  emailTheme = input.required<'light' | 'dark'>()
  emailThemeChange = output<'light' | 'dark'>()
}
