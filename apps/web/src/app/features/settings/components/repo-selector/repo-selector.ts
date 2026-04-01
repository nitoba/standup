import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
} from '@angular/core'
import { ZardCheckboxComponent } from '../../../../shared/components/checkbox'

export interface RepoOption {
  name: string
  id: string
  project: string
}

@Component({
  selector: 'app-repo-selector',
  imports: [ZardCheckboxComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="border border-border bg-card p-[16px] md:p-[24px] flex flex-col gap-[16px] w-full">
      <div class="flex items-center gap-[8px]">
        <span class="text-muted-foreground/70 font-[var(--font-jetbrains)] text-[14px]">//</span>
        <span class="text-card-foreground font-[var(--font-jetbrains)] text-[14px] font-medium">
          repositórios_selecionados
        </span>
      </div>

      @if (reposByProject().length === 0) {
        <div class="text-muted-foreground/70 font-[var(--font-ibm)] text-[12px] py-[8px]">
          // nenhum repositório disponível
        </div>
      } @else {
        <div class="grid grid-cols-1 md:grid-cols-2 gap-[16px]">
          @for (group of reposByProject(); track group.project) {
            <div class="flex flex-col gap-[8px]">
              <div class="flex items-center gap-[6px] pb-[4px] border-b border-border">
                <span class="text-primary font-[var(--font-jetbrains)] text-[11px]">~/</span>
                <span
                  class="text-muted-foreground font-[var(--font-jetbrains)] text-[11px] uppercase tracking-wider"
                >
                  {{ group.project }}
                </span>
                <span
                  class="text-muted-foreground/50 font-[var(--font-ibm)] text-[10px] ml-auto"
                >
                  {{ group.repos.length }} repositórios
                </span>
              </div>
              <div class="flex flex-col gap-[4px] max-h-[480px] overflow-y-auto pr-[2px]">
                @for (repo of group.repos; track repo.id) {
                  <z-checkbox
                    zSize="lg"
                    [zChecked]="isRepoSelected(repo.project + '/' + repo.name)"
                    (zCheckedChange)="onRepoChecked(repo.project + '/' + repo.name, $event)"
                    class="border border-border px-[12px] py-[10px] transition-colors duration-150 hover:bg-accent/30"
                  >
                    <span
                      class="font-[var(--font-jetbrains)] text-[13px] text-foreground flex-1 truncate"
                    >
                      {{ repo.name }}
                    </span>
                  </z-checkbox>
                }
              </div>
            </div>
          }
        </div>
      }
    </div>
  `,
})
export class RepoSelector {
  reposByProject = input.required<{ project: string; repos: RepoOption[] }[]>()
  selectedRepos = input.required<string[]>()
  selectionChange = output<string[]>()

  isRepoSelected(repoName: string): boolean {
    return this.selectedRepos().includes(repoName)
  }

  onRepoChecked(repoName: string, checked: boolean) {
    const current = this.selectedRepos()
    const next = checked
      ? Array.from(new Set([...current, repoName]))
      : current.filter((name) => name !== repoName)
    this.selectionChange.emit(next)
  }
}
