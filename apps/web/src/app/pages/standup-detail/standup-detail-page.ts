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
import { SidebarLayout } from '../../layout/sidebar'
import { StandupService } from '../../services/standup.service'
import { ZardButtonComponent } from '../../shared/components/button'
import { ZardDialogService } from '../../shared/components/dialog'
import type {
  Standup,
  StandupCustomEntriesDto,
  StandupStatus,
} from '../../types/standup'
import { AdjustDialogContent } from './adjust-dialog-content'
import { ApproveDialogContent } from './approve-dialog-content'

@Component({
  selector: 'app-standup-detail-page',
  imports: [SidebarLayout, RouterLink, ZardButtonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-sidebar-layout>
      <section class="min-h-full bg-background text-foreground p-[20px] md:p-[40px] flex flex-col gap-[24px] md:gap-[32px]">
        <a routerLink="/dashboard" class="text-muted-foreground font-[var(--font-jetbrains)] text-[12px] flex items-center gap-[12px] transition-colors duration-150 hover:text-foreground">
          <span><<</span>
          <span>back to standups</span>
        </a>

        @if (standup.isLoading()) {
          <div class="text-muted-foreground font-[var(--font-ibm)] text-[13px]">// loading standup detail...</div>
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
              <div class="flex flex-col gap-[8px] md:flex-row">
                <button
                  type="button"
                  z-button
                  zType="outline"
                  zSize="sm"
                  [zDisabled]="actionLoading()"
                  (click)="toggleDatasource()"
                >
                  {{ showFullDatasource() ? '$ collapse datasource' : '$ expand datasource' }}
                </button>
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
                <span class="font-[var(--font-jetbrains)] text-[11px] uppercase tracking-[0.18em] text-muted-foreground/70">
                  {{ showFullDatasource() ? 'full json' : 'preview' }}
                </span>
                @if (!showFullDatasource()) {
                  <span class="font-[var(--font-ibm)] text-[12px] text-muted-foreground/70">
                    {{ datasourceLineCount(detail.sourceData ?? '') }} lines
                  </span>
                }
              </div>

              <pre class="m-0 whitespace-pre-wrap break-words font-[var(--font-ibm)] text-[12px] leading-[1.7] text-muted-foreground">{{ showFullDatasource() ? detail.sourceData : previewDatasource(detail.sourceData ?? '') }}</pre>
            </div>
          </div>

          <div class="flex flex-col md:flex-row items-stretch md:items-center gap-[12px] md:gap-[16px]">
            @if (!isApproved(detail.status)) {
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
            <button
              type="button"
              z-button
              zType="secondary"
              class="w-full md:w-auto"
              [zDisabled]="actionLoading()"
              (click)="regenerate(detail.id)"
            >
              $ regenerate
            </button>
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
    if (this.actionLoading()) {
      return
    }

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
      toast(result.warning ?? 'Standup aprovado')
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
      toast('Standup rejeitado')
      this.standup.reload()
    } finally {
      this.actionLoading.set(false)
    }
  }

  async regenerate(id: string) {
    if (this.actionLoading()) {
      return
    }

    this.actionLoading.set(true)

    try {
      await this.standupService.regenerate(id)
      toast('Standup enviado para regeneracao')
      this.standup.reload()
    } finally {
      this.actionLoading.set(false)
    }
  }

  async submitAdjustInstruction(instruction: string) {
    const id = this.id()
    if (!id || this.actionLoading()) {
      return
    }

    this.actionLoading.set(true)

    try {
      await this.standupService.adjust(id, instruction)
      toast('Ajuste enviado para regeneracao')
      this.standup.reload()
    } finally {
      this.actionLoading.set(false)
    }
  }

  async copyToClipboard(content: string, feedback: string) {
    const clipboard = globalThis.navigator?.clipboard
    if (!clipboard || !content.trim()) {
      toast('Clipboard indisponivel')
      return
    }

    try {
      await clipboard.writeText(content)
      toast(feedback)
    } catch {
      toast('Clipboard indisponivel')
    }
  }

  isApproved(status: StandupStatus) {
    return status === 'approved'
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
    if (status === 'pending_review') return 'bg-[var(--accent-cyan)]'
    return 'bg-[var(--accent-amber)]'
  }

  statusTextClass(status: StandupStatus) {
    if (status === 'approved') return 'text-[var(--accent-green)]'
    if (status === 'pending_review') return 'text-[var(--accent-cyan)]'
    return 'text-[var(--accent-amber)]'
  }

  formatStatus(status: StandupStatus) {
    if (status === 'pending_review') return '[pending_review]'
    return status === 'approved' ? '[approved]' : '[rejected]'
  }
}
