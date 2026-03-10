import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  signal,
} from '@angular/core'
import { RouterLink } from '@angular/router'
import { toast } from 'ngx-sonner'
import { SidebarLayout } from '../../core/layout/sidebar'
import { ZardButtonComponent } from '../../shared/components/button'
import { ZardDialogService } from '../../shared/components/dialog'
import { JsonViewerComponent } from '../../shared/components/json-viewer/json-viewer.component'
import type {
  Standup,
  StandupCustomEntriesDto,
  StandupStatus,
} from '../../shared/models/standup-models'
import { StandupService } from '../dashboard/services/standup-service'
import { AdjustDialogContent } from './components/adjust-dialog/adjust-dialog-content'
import { ApproveDialogContent } from './components/approve-dialog/approve-dialog-content'
import { StandupDetailSkeleton } from './components/standup-detail-skeleton/standup-detail-skeleton'

@Component({
  selector: 'app-standup-detail-page',
  imports: [
    SidebarLayout,
    RouterLink,
    ZardButtonComponent,
    JsonViewerComponent,
    StandupDetailSkeleton,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-sidebar-layout>
      <section class="min-h-full bg-background text-foreground p-[20px] md:p-[40px] flex flex-col gap-[24px] md:gap-[32px]">
        <a routerLink="/dashboard" class="text-muted-foreground font-[var(--font-jetbrains)] text-[12px] flex items-center gap-[12px] transition-colors duration-150 hover:text-foreground">
          <span><<</span>
          <span>back to standups</span>
        </a>

        @if (standup.isLoading()) {
          <app-standup-detail-skeleton />
        } @else if (standup.error()) {
          <div class="text-[var(--accent-red)] font-[var(--font-ibm)] text-[13px]">// standup not found</div>
        } @else if (standup.value(); as detail) {
          <div class="flex flex-col gap-[16px]">
            <div class="flex items-center gap-[12px]">
              <span class="text-[var(--accent-green)] font-[var(--font-jetbrains)] text-[24px] md:text-[32px] font-bold">>></span>
              <span class="text-foreground font-[var(--font-jetbrains)] text-[20px] md:text-[28px] font-bold">standup_detail</span>
            </div>
            <div class="flex flex-wrap items-center gap-[12px] md:gap-[24px]">
              <span class="text-muted-foreground font-[var(--font-ibm)] text-[12px]">// {{ detail.date }}</span>
              <div class="flex items-center gap-[8px]">
                <span class="h-[6px] w-[6px] rounded-full" [class]="statusDotClass(detail.status)"></span>
                <span class="font-[var(--font-jetbrains)] text-[12px]" [class]="statusTextClass(detail.status)">
                  {{ formatStatus(detail.status) }}
                </span>
              </div>
              <span class="hidden md:inline text-muted-foreground font-[var(--font-ibm)] text-[12px]">created: {{ detail.createdAt }}</span>
              <span class="hidden md:inline text-muted-foreground/70 font-[var(--font-ibm)] text-[12px]">id: {{ detail.id }}</span>
            </div>
          </div>

          <div class="bg-card border border-border p-[16px] md:p-[24px] flex flex-col gap-[16px] md:gap-[20px]">
            <div class="flex flex-col gap-[8px] md:flex-row md:items-center md:justify-between">
              <div class="text-card-foreground font-[var(--font-jetbrains)] text-[14px] font-bold">generated_content</div>
              <button
                type="button"
                z-button
                zType="outline"
                zSize="sm"
                [zDisabled]="actionLoading()"
                (click)="copyToClipboard(detail.content ?? '', 'generated content copied')"
              >
                $ copy generated
              </button>
            </div>
            <pre class="m-0 whitespace-pre-wrap break-words font-[var(--font-ibm)] text-[13px] leading-[1.7] text-foreground">{{ detail.content }}</pre>
          </div>

          <div class="border border-border p-[20px] flex flex-col gap-[20px]">
            <div class="flex flex-col gap-[8px] md:flex-row md:items-center md:justify-between">
              <div class="text-card-foreground font-[var(--font-jetbrains)] text-[14px] font-bold">datasource</div>
              <button
                type="button"
                z-button
                zType="outline"
                zSize="sm"
                [zDisabled]="actionLoading()"
                (click)="copyToClipboard(detail.sourceData ?? '', 'datasource copied')"
              >
                $ copy datasource
              </button>
            </div>

            @if (detail.sources.length > 0) {
              <div class="flex flex-col gap-[20px]">
                @for (repo of detail.sources; track repo.name) {
                  <div class="flex flex-col gap-[8px]">
                    <div class="text-[var(--accent-green)] font-[var(--font-jetbrains)] text-[13px] font-medium">{{ repo.name }}</div>
                    @for (commit of repo.commits; track commit.hash) {
                      <div class="flex gap-[12px] pl-[16px]">
                        <span class="text-muted-foreground/70 font-[var(--font-jetbrains)] text-[12px]">{{ commit.hash }}</span>
                        <span class="text-foreground font-[var(--font-ibm)] text-[12px]">{{ commit.message }}</span>
                      </div>
                    }
                  </div>
                }
              </div>
            }

            <div class="border border-border bg-card p-[16px] flex flex-col gap-[12px]">
              <div class="flex items-center justify-between gap-[12px]">
                <div class="flex items-center gap-[12px]">
                  <span class="font-[var(--font-jetbrains)] text-[11px] uppercase tracking-[0.18em] text-muted-foreground/70">
                    {{ showFullDatasource() ? 'full json' : 'preview' }}
                  </span>
                  <span
                    class="font-[var(--font-ibm)] text-[12px] text-muted-foreground/70 transition-opacity duration-300"
                    [style.opacity]="showFullDatasource() ? '0' : '1'"
                    aria-hidden="true"
                  >
                    {{ datasourceLineCount(detail.sourceData ?? '') }} lines
                  </span>
                </div>
                <button
                  type="button"
                  z-button
                  zType="outline"
                  zSize="sm"
                  [zDisabled]="actionLoading()"
                  (click)="toggleDatasource()"
                >
                  {{ showFullDatasource() ? '$ collapse' : '$ expand' }}
                </button>
              </div>

              <!-- grid-rows trick: animates height from 0 to auto smoothly -->
              <div
                class="grid transition-[grid-template-rows] duration-300 ease-in-out"
                [style.grid-template-rows]="showFullDatasource() ? '1fr' : '0fr'"
              >
                <div class="overflow-hidden">
                  <app-json-viewer
                    [value]="detail.sourceData"
                    ariaLabel="datasource JSON completo"
                  />
                </div>
              </div>

              <div
                class="grid transition-[grid-template-rows] duration-300 ease-in-out"
                [style.grid-template-rows]="showFullDatasource() ? '0fr' : '1fr'"
              >
                <div class="overflow-hidden">
                  <app-json-viewer
                    [value]="previewDatasource(detail.sourceData ?? '')"
                    ariaLabel="datasource JSON preview"
                  />
                </div>
              </div>
            </div>
          </div>

          <div class="flex flex-col md:flex-row items-stretch md:items-center gap-[12px] md:gap-[16px]">
            @if (isPendingReview(detail.status)) {
              <button
                type="button"
                z-button
                zType="default"
                class="w-full md:w-auto"
                [zDisabled]="actionLoading()"
                (click)="openApproveModal(detail)"
              >
                $ approve
              </button>
              <button
                type="button"
                z-button
                zType="destructive"
                class="w-full md:w-auto"
                [zDisabled]="actionLoading()"
                (click)="reject(detail.id)"
              >
                $ reject
              </button>
              <button
                type="button"
                z-button
                zType="secondary"
                class="w-full md:w-auto"
                [zDisabled]="actionLoading()"
                (click)="openAdjustModal()"
              >
                $ adjust
              </button>
            }
            @if (canRegenerate(detail.status)) {
              <button
                type="button"
                z-button
                zType="secondary"
                class="w-full md:w-auto"
                [zDisabled]="actionLoading()"
                (click)="openRegenerateModal(detail.id)"
              >
                $ regenerate
              </button>
            }
          </div>
        } @else {
          <div class="text-muted-foreground font-[var(--font-ibm)] text-[13px]">// standup not found</div>
        }
      </section>
    </app-sidebar-layout>
  `,
})
export class StandupDetailPage {
  private readonly dialogService = inject(ZardDialogService)
  private readonly standupService = inject(StandupService)

  readonly id = input.required<string>()
  readonly standup = this.standupService.selectedStandup
  readonly actionLoading = signal(false)
  readonly showFullDatasource = signal(false)

  constructor() {
    effect(() => {
      this.showFullDatasource.set(false)
      this.standupService.selectStandup(this.id())
    })
  }

  openAdjustModal() {
    this.dialogService.create({
      zTitle: '// adjust standup',
      zDescription: '// rewrite instructions',
      zContent: AdjustDialogContent,
      zHideFooter: true,
      zWidth: '720px',
      zData: {
        onSubmit: (instruction: string) => {
          void this.submitAdjustInstruction(instruction)
        },
      },
    })
  }

  toggleDatasource() {
    this.showFullDatasource.update((current) => !current)
  }

  openApproveModal(detail: Standup) {
    if (this.actionLoading()) {
      return
    }

    this.dialogService.create({
      zTitle: '// aprovar standup',
      zDescription: '// opcionalmente adicione reunioes extras e calls diretas',
      zContent: ApproveDialogContent,
      zHideFooter: true,
      zWidth: '720px',
      zData: {
        initialEntries: detail.customEntries ?? null,
        onSubmit: (payload: {
          customEntries: StandupCustomEntriesDto | null
        }) => {
          void this.approve(detail.id, payload.customEntries)
        },
      },
    })
  }

  async approve(id: string, customEntries?: StandupCustomEntriesDto | null) {
    if (this.actionLoading()) {
      return
    }

    this.actionLoading.set(true)

    try {
      const result = await this.standupService.approve(
        id,
        customEntries ?? null,
      )
      toast.success(result.warning ?? 'Standup aprovado')
      this.standup.reload()
    } finally {
      this.actionLoading.set(false)
    }
  }

  async reject(id: string) {
    if (this.actionLoading()) {
      return
    }

    this.actionLoading.set(true)

    try {
      await this.standupService.reject(id)
      toast.success('Standup rejeitado')
      this.standup.reload()
    } finally {
      this.actionLoading.set(false)
    }
  }

  openRegenerateModal(id: string) {
    this.dialogService.create({
      zTitle: '// regenerar standup',
      zDescription:
        '// o conteudo atual sera descartado e um novo standup sera gerado a partir dos commits do dia',
      zContent: 'Tem certeza que deseja regenerar o standup?',
      zOkText: '$ confirmar',
      zCancelText: '$ cancelar',
      zOkDestructive: true,
      zOnOk: () => {
        void this.regenerate(id)
      },
    })
  }

  regenerate(id: string) {
    // fire-and-forget: SSE event will trigger selectedStandup.reload() when ready
    void this.standupService.regenerate(id)
    toast.success('Solicitação aceita')
  }

  submitAdjustInstruction(instruction: string) {
    const id = this.id()
    if (!id) return

    // fire-and-forget: SSE event will trigger selectedStandup.reload() when ready
    void this.standupService.adjust(id, instruction)
    toast.success('Solicitação aceita')
  }

  async copyToClipboard(content: string, feedback: string) {
    const clipboard = globalThis.navigator?.clipboard
    if (!clipboard || !content.trim()) {
      toast.error('Clipboard indisponivel')
      return
    }

    try {
      await clipboard.writeText(content)
      toast.success(feedback)
    } catch {
      toast.error('Clipboard indisponivel')
    }
  }

  isPendingReview(status: StandupStatus) {
    return status === 'pending_review'
  }

  canRegenerate(status: StandupStatus) {
    return status === 'pending_review' || status === 'rejected'
  }

  previewDatasource(sourceData: string) {
    const trimmed = sourceData.trim()
    if (!trimmed) {
      return '{}'
    }

    const lines = trimmed.split('\n')
    if (lines.length <= 8) {
      return trimmed
    }

    return `${lines.slice(0, 8).join('\n')}\n...`
  }

  datasourceLineCount(sourceData: string) {
    const trimmed = sourceData.trim()
    if (!trimmed) {
      return 0
    }

    return trimmed.split('\n').length
  }

  statusDotClass(status: StandupStatus) {
    if (status === 'approved') return 'bg-[var(--accent-green)]'
    if (status === 'pending_review') return 'bg-[var(--accent-yellow)]'
    return 'bg-[var(--accent-red)]'
  }

  statusTextClass(status: StandupStatus) {
    if (status === 'approved') return 'text-[var(--accent-green)]'
    if (status === 'pending_review') return 'text-[var(--accent-yellow)]'
    return 'text-[var(--accent-red)]'
  }

  formatStatus(status: StandupStatus) {
    if (status === 'pending_review') return '[pending_review]'
    return status === 'approved' ? '[approved]' : '[rejected]'
  }
}
