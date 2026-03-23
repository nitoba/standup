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
import { ZardIconComponent } from '../../shared/components/icon'
import { JsonViewerComponent } from '../../shared/components/json-viewer/json-viewer.component'
import type {
  Standup,
  StandupCustomEntriesDto,
  StandupStatus,
} from '../../shared/models/standup-models'
import { formatTimestampPtBr } from '../../shared/utils'
import { StandupService } from '../dashboard/services/standup-service'
import { AdjustDialogContent } from './components/adjust-dialog/adjust-dialog-content'
import { ApproveDialogContent } from './components/approve-dialog/approve-dialog-content'
import { ResendConfirmDialog } from './components/resend-confirm-dialog/resend-confirm-dialog'
import { StandupDetailSkeleton } from './components/standup-detail-skeleton/standup-detail-skeleton'
import { DiscordFormatPipe } from './pipes/discord-format.pipe'

@Component({
  selector: 'app-standup-detail-page',
  imports: [
    SidebarLayout,
    RouterLink,
    ZardButtonComponent,
    ZardIconComponent,
    JsonViewerComponent,
    StandupDetailSkeleton,
    DiscordFormatPipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-sidebar-layout>
      <section class="bg-background text-foreground p-[20px] md:p-[40px] flex flex-col gap-[24px] md:gap-[32px]">
        <a routerLink="/dashboard" class="text-muted-foreground font-[var(--font-jetbrains)] text-[12px] flex items-center gap-[12px] transition-colors duration-150 hover:text-foreground">
          <span><<</span>
          <span>voltar para standups</span>
        </a>

        @if (standup.isLoading()) {
          <app-standup-detail-skeleton />
        } @else if (standup.error()) {
          <div class="text-[var(--accent-red)] font-[var(--font-ibm)] text-[13px]">// standup não encontrado</div>
        } @else if (standup.value(); as detail) {
          <div class="flex flex-col gap-[16px]">
            <div class="flex items-center gap-[12px]">
              <span class="text-primary font-[var(--font-jetbrains)] text-[24px] md:text-[32px] font-bold">>></span>
              <span class="text-foreground font-[var(--font-jetbrains)] text-[20px] md:text-[28px] font-bold">detalhes_do_standup</span>
            </div>
            <div class="flex flex-wrap items-center gap-[12px] md:gap-[24px]">
              <span class="text-muted-foreground font-[var(--font-ibm)] text-[12px]">// {{ detail.date }}</span>
              <div class="flex items-center gap-[8px]">
                <span class="h-[6px] w-[6px] rounded-full" [class]="statusDotClass(detail.status)"></span>
                <span class="font-[var(--font-jetbrains)] text-[12px]" [class]="statusTextClass(detail.status)">
                  {{ formatStatus(detail.status) }}
                </span>
              </div>
              <span class="hidden md:inline text-muted-foreground font-[var(--font-ibm)] text-[12px]">criado em: {{ detail.createdAt }}</span>
              <span class="hidden md:inline text-muted-foreground/70 font-[var(--font-ibm)] text-[12px]">id: {{ detail.id }}</span>
            </div>
          </div>

          <div class="bg-card border border-border p-[16px] md:p-[24px] flex flex-col gap-[16px] md:gap-[20px]">
            <div class="flex flex-col gap-[8px] md:flex-row md:items-center md:justify-between">
              <div class="text-card-foreground font-[var(--font-jetbrains)] text-[14px] font-bold">conteúdo_gerado</div>
              <button
                type="button"
                z-button
                zType="outline"
                zSize="sm"
                [zDisabled]="actionLoading()"
                (click)="copyToClipboard(detail.content ?? '', 'conteúdo gerado copiado')"
              >
                $ copiar conteúdo
              </button>
            </div>
            <pre class="m-0 whitespace-pre-wrap break-words font-[var(--font-ibm)] text-[13px] leading-[1.7] text-foreground max-w-4xl" [innerHTML]="detail.content | discordFormat"></pre>
          </div>

          <div class="border border-border p-[20px] flex flex-col gap-[20px]">
            <div class="flex flex-col gap-[8px] md:flex-row md:items-center md:justify-between">
              <div class="text-card-foreground font-[var(--font-jetbrains)] text-[14px] font-bold">fonte_de_dados</div>
              <button
                type="button"
                z-button
                zType="outline"
                zSize="sm"
                [zDisabled]="actionLoading()"
                (click)="copyToClipboard(detail.sourceData ?? '', 'fonte de dados copiada')"
              >
                $ copiar fonte
              </button>
            </div>

            @if (detail.sources.length > 0) {
              <div class="flex flex-col gap-[20px]">
                @for (repo of detail.sources; track repo.name) {
                  <div class="flex flex-col gap-[8px]">
                    <div class="text-primary font-[var(--font-jetbrains)] text-[13px] font-medium">{{ repo.name }}</div>
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
                    {{ showFullDatasource() ? 'json completo' : 'prévia' }}
                  </span>
                  <span
                    class="font-[var(--font-ibm)] text-[12px] text-muted-foreground/70 transition-opacity duration-300"
                    [style.opacity]="showFullDatasource() ? '0' : '1'"
                    aria-hidden="true"
                  >
                    {{ datasourceLineCount(detail.sourceData ?? '') }} linhas
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
                  {{ showFullDatasource() ? '$ recolher' : '$ expandir' }}
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
                    ariaLabel="JSON completo da fonte de dados"
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
                    ariaLabel="Prévia do JSON da fonte de dados"
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
                $ aprovar
              </button>
              <button
                type="button"
                z-button
                zType="destructive"
                class="w-full md:w-auto"
                [zDisabled]="actionLoading()"
                (click)="reject(detail.id)"
              >
                $ rejeitar
              </button>
              <button
                type="button"
                z-button
                zType="secondary"
                class="w-full md:w-auto"
                [zDisabled]="actionLoading()"
                (click)="openAdjustModal()"
              >
                $ ajustar
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
                $ regenerar
              </button>
            }
            @if (isApproved(detail.status)) {
              <button
                type="button"
                z-button
                zType="default"
                class="w-full md:w-auto"
                [zLoading]="actionLoading()"
                [zDisabled]="actionLoading()"
                (click)="handleSendToDiscord(detail)"
              >
                @if (!actionLoading()) {
                  <z-icon zType="send" zSize="sm" class="mr-2" />
                }
                {{
                  actionLoading()
                    ? 'Enviando...'
                    : detail.sentToDiscordAt
                      ? 'Reenviar para Discord'
                      : 'Enviar para Discord'
                }}
              </button>
            }
          </div>
        } @else {
          <div class="text-muted-foreground font-[var(--font-ibm)] text-[13px]">// standup não encontrado</div>
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
      zTitle: '// ajustar standup',
      zDescription: '// instruções de reescrita',
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
      zDescription:
        '// opcionalmente adicione reuniões extras e chamadas diretas',
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
        '// o conteúdo atual será descartado e um novo standup será gerado a partir dos commits do dia',
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
    void this.standupService.regenerate(id).then(
      () => toast.success('Solicitação aceita'),
      () => toast.error('Falha ao solicitar regeneração'),
    )
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
      toast.error('Clipboard indisponível')
      return
    }

    try {
      await clipboard.writeText(content)
      toast.success(feedback)
    } catch {
      toast.error('Clipboard indisponível')
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
    if (status === 'approved') return 'bg-primary'
    if (status === 'pending_review') return 'bg-[var(--accent-yellow)]'
    return 'bg-[var(--accent-red)]'
  }

  statusTextClass(status: StandupStatus) {
    if (status === 'approved') return 'text-primary'
    if (status === 'pending_review') return 'text-[var(--accent-yellow)]'
    return 'text-[var(--accent-red)]'
  }

  formatStatus(status: StandupStatus) {
    if (status === 'pending_review') return '[pendente]'
    return status === 'approved' ? '[aprovado]' : '[rejeitado]'
  }

  isApproved(status: StandupStatus) {
    return status === 'approved'
  }

  handleSendToDiscord(detail: Standup) {
    if (detail.sentToDiscordAt) {
      const sentDate = formatTimestampPtBr(detail.sentToDiscordAt)
      this.dialogService.create({
        zTitle: '// reenviar para discord',
        zContent: ResendConfirmDialog,
        zHideFooter: true,
        zData: {
          sentAt: sentDate,
          onConfirm: () => this.executeSendToDiscord(detail.id),
        },
      })
    } else {
      void this.executeSendToDiscord(detail.id)
    }
  }

  private async executeSendToDiscord(id: string) {
    this.actionLoading.set(true)
    try {
      await this.standupService.sendToDiscordAction(id)
      toast.success('Standup enviado para o Discord')
      this.standup.reload()
    } catch {
      toast.error('Falha ao enviar para o Discord')
    } finally {
      this.actionLoading.set(false)
    }
  }
}
