import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
} from '@angular/core'
import { ZardInputDirective } from '../../../../shared/components/input'

interface FormFieldState {
  touched: () => boolean
  invalid: () => boolean
  errors: () => Array<{ message?: string }>
}

@Component({
  selector: 'app-git-config-section',
  imports: [ZardInputDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="border border-border bg-card p-[16px] md:p-[24px] flex flex-col gap-[16px]">
      <div class="flex items-center gap-[8px]">
        <span class="text-muted-foreground/70 font-[var(--font-jetbrains)] text-[14px]">//</span>
        <span class="text-card-foreground font-[var(--font-jetbrains)] text-[14px] font-medium">
          configuração_git
        </span>
      </div>

      <div class="flex flex-col gap-[6px]">
        <label
          for="git-author"
          class="text-muted-foreground font-[var(--font-jetbrains)] text-[12px]"
        >
          autor_do_git
        </label>
        <input
          id="git-author"
          type="text"
          z-input
          [value]="gitAuthor()"
          (input)="gitAuthorChange.emit($any($event.target).value)"
        />
        <span class="text-muted-foreground/70 font-[var(--font-ibm)] text-[11px]">
          // informe o autor exatamente como configurado nos commits git. Este nome é usado para filtrar sua atividade nos repositórios.
        </span>
        @if (gitAuthorField().touched() && gitAuthorField().invalid()) {
          <span class="text-[var(--accent-red)] font-[var(--font-ibm)] text-[11px]">
            {{ gitAuthorField().errors()[0]?.message }}
          </span>
        }
      </div>

      <div class="flex flex-col gap-[6px]">
        <label
          for="git-since-period"
          class="text-muted-foreground font-[var(--font-jetbrains)] text-[12px]"
        >
          periodo_de_coleta_git
        </label>
        <input
          id="git-since-period"
          type="text"
          z-input
          [value]="gitSincePeriod()"
          (input)="gitSincePeriodChange.emit($any($event.target).value)"
        />
        <span class="text-muted-foreground/70 font-[var(--font-ibm)] text-[11px]">
          // ex: 8 hours ago, 24 hours ago, 2 days ago. Esse valor define o recorte da coleta de commits.
        </span>
      </div>

      <div class="flex flex-col gap-[6px]">
        <label
          for="azure-devops-user"
          class="text-muted-foreground font-[var(--font-jetbrains)] text-[12px]"
        >
          azure_devops_user
        </label>
        <input
          id="azure-devops-user"
          type="text"
          z-input
          [value]="azureDevopsUser()"
          (input)="azureDevopsUserChange.emit($any($event.target).value)"
        />
        <span class="text-muted-foreground/70 font-[var(--font-ibm)] text-[11px]">
          // informe seu nome de exibição exatamente como aparece no Azure DevOps. Este nome é usado para buscar sua atividade no board.
        </span>
        @if (azureDevopsUserField().touched() && azureDevopsUserField().invalid()) {
          <span class="text-[var(--accent-red)] font-[var(--font-ibm)] text-[11px]">
            {{ azureDevopsUserField().errors()[0]?.message }}
          </span>
        }
      </div>
    </div>
  `,
})
export class GitConfigSection {
  gitAuthor = input.required<string>()
  gitSincePeriod = input.required<string>()
  azureDevopsUser = input.required<string>()
  gitAuthorField = input.required<FormFieldState>()
  azureDevopsUserField = input.required<FormFieldState>()

  gitAuthorChange = output<string>()
  gitSincePeriodChange = output<string>()
  azureDevopsUserChange = output<string>()
}
