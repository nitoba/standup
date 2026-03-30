import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
  signal,
} from '@angular/core'

import { toast } from 'ngx-sonner'

import { ZardButtonComponent } from '../../../../shared/components/button'
import { ZardIconComponent } from '../../../../shared/components/icon/icon.component'
import type {
  Standup,
  StandupStatus,
} from '../../../../shared/models/standup-models'

/** Id do standup mais recente com status pending_review na lista atual */
function findNewestPendingId(standups: Standup[]): string | null {
  const pending = standups.filter((s) => s.status === 'pending_review')
  if (pending.length === 0) return null
  // A API retorna ordenado por createdAt DESC, logo o primeiro é o mais recente
  return pending[0]?.id ?? null
}

@Component({
  selector: 'app-standup-table',
  imports: [ZardButtonComponent, ZardIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="border border-border bg-card flex flex-col">
      <!-- Desktop table header -->
      <div class="hidden md:block bg-accent/40 border-b border-border px-[20px] py-[12px]">
        <div class="grid grid-cols-[120px_120px_1fr_140px] gap-x-[16px]">
          <span class="text-muted-foreground font-[var(--font-jetbrains)] text-[12px] font-medium">data</span>
          <span class="text-muted-foreground font-[var(--font-jetbrains)] text-[12px] font-medium">status</span>
          <span class="text-muted-foreground font-[var(--font-jetbrains)] text-[12px] font-medium">prévia_do_conteúdo</span>
          <span class="text-muted-foreground font-[var(--font-jetbrains)] text-[12px] font-medium">ações</span>
        </div>
      </div>

      @for (standup of standups(); track standup.id) {
        <!-- Desktop row -->
        <div
          class="hidden md:grid border-b border-border px-[20px] py-[16px] grid-cols-[120px_120px_1fr_140px] gap-x-[16px] items-center transition-colors duration-150 hover:bg-accent/30"
          [class.bg-[color-mix(in_srgb,var(--accent-yellow)_4%,transparent)]]="standup.id === newestPendingId()"
        >
          <span class="text-foreground font-[var(--font-jetbrains)] text-[13px]">{{ standup.date }}</span>
          <span class="font-[var(--font-jetbrains)] text-[12px] flex items-center gap-[6px]" [class]="statusBadgeClass(standup.status)">
            @if (standup.id === newestPendingId()) {
              <span
                class="inline-block h-[6px] w-[6px] rounded-full bg-[var(--accent-yellow)] animate-pulse"
                aria-hidden="true"
              ></span>
            }
            {{ formatStatus(standup.status) }}
          </span>
          <span class="text-muted-foreground font-[var(--font-ibm)] text-[13px] line-clamp-2">{{ standup.contentPreview }}</span>
          <div class="flex items-center gap-[6px]">
            <button
              type="button"
              z-button
              zType="link"
              zSize="sm"
              class="justify-start px-0 text-primary"
              (click)="viewStandup.emit(standup.id)"
            >
              $ ver >>
            </button>
            @if (standup.status === 'approved' && standup.content) {
              <button
                type="button"
                z-button
                zType="ghost"
                zSize="sm"
                class="px-[6px] text-muted-foreground hover:text-foreground"
                [attr.aria-label]="copiedId() === standup.id ? 'Copiado' : 'Copiar standup'"
                (click)="copyContent(standup)"
              >
                <z-icon [zType]="copiedId() === standup.id ? 'clipboard' : 'copy'" zSize="sm" />
              </button>
            }
          </div>
        </div>

        <!-- Mobile card -->
        <div
          class="md:hidden border-b border-border px-[16px] py-[14px] flex flex-col gap-[8px] transition-colors duration-150 hover:bg-accent/30"
          [class.bg-[color-mix(in_srgb,var(--accent-yellow)_4%,transparent)]]="standup.id === newestPendingId()"
        >
          <div class="flex items-center justify-between">
            <span class="text-foreground font-[var(--font-jetbrains)] text-[13px]">{{ standup.date }}</span>
            <span class="font-[var(--font-jetbrains)] text-[12px] flex items-center gap-[6px]" [class]="statusBadgeClass(standup.status)">
              @if (standup.id === newestPendingId()) {
                <span
                  class="inline-block h-[6px] w-[6px] rounded-full bg-[var(--accent-yellow)] animate-pulse"
                  aria-hidden="true"
                ></span>
              }
              {{ formatStatus(standup.status) }}
            </span>
          </div>
          <span class="text-muted-foreground font-[var(--font-ibm)] text-[12px] line-clamp-2">{{ standup.contentPreview }}</span>
          <div class="flex items-center gap-[8px]">
            <button
              type="button"
              z-button
              zType="link"
              zSize="sm"
              class="justify-start px-0 text-primary"
              (click)="viewStandup.emit(standup.id)"
            >
              $ ver >>
            </button>
            @if (standup.status === 'approved' && standup.content) {
              <button
                type="button"
                z-button
                zType="ghost"
                zSize="sm"
                class="px-[6px] text-muted-foreground hover:text-foreground"
                [attr.aria-label]="copiedId() === standup.id ? 'Copiado' : 'Copiar standup'"
                (click)="copyContent(standup)"
              >
                <z-icon [zType]="copiedId() === standup.id ? 'clipboard' : 'copy'" zSize="sm" />
              </button>
            }
          </div>
        </div>
      }

      <div class="px-[16px] md:px-[20px] py-[12px] md:py-[16px] flex flex-col gap-[12px] md:flex-row md:items-center md:justify-between">
        <div class="flex flex-col gap-[4px]">
          <span class="text-muted-foreground font-[var(--font-ibm)] text-[11px] md:text-[12px]">
            // exibindo {{ rangeStart() }}-{{ rangeEnd() }}
          </span>
          <div class="flex items-center gap-[10px] text-[11px] md:text-[12px] font-[var(--font-jetbrains)]">
            <span class="text-foreground">página {{ page() }} de {{ totalPages() || 1 }}</span>
            <span class="text-muted-foreground">{{ total() }} no total</span>
          </div>
        </div>

        <div class="flex items-center gap-[6px] md:gap-[8px]">
          <button type="button" z-button zType="ghost" zSize="sm" [zDisabled]="page() <= 1" (click)="previousPage()"><<</button>
          <div class="hidden md:flex items-center gap-[6px]">
            @for (item of pageItems(); track item.track) {
              @if (item.type === 'page') {
                <button
                  type="button"
                  z-button
                  [zType]="item.value === page() ? 'default' : 'ghost'"
                  zSize="sm"
                  class="min-w-[36px] px-[8px]"
                  [attr.aria-current]="item.value === page() ? 'page' : null"
                  (click)="goToPage(item.value)"
                >
                  {{ item.label }}
                </button>
              } @else {
                <span class="px-[4px] text-muted-foreground font-[var(--font-jetbrains)] text-[12px]">{{ item.label }}</span>
              }
            }
          </div>
          <span class="md:hidden text-foreground font-[var(--font-jetbrains)] text-[12px]">[{{ page() }}/{{ totalPages() || 1 }}]</span>
          <button type="button" z-button zType="ghost" zSize="sm" [zDisabled]="page() >= totalPages()" (click)="nextPage()">>></button>
        </div>
      </div>
    </div>
  `,
})
export class StandupTable {
  readonly standups = input.required<Standup[]>()
  readonly total = input.required<number>()
  readonly page = input.required<number>()
  readonly pageSize = input.required<number>()
  readonly totalPages = input.required<number>()
  readonly viewStandup = output<string>()
  readonly pageChange = output<number>()

  /** Tracks the id of the standup whose content was just copied, for icon feedback */
  readonly copiedId = signal<string | null>(null)

  /** Holds the pending reset timer so rapid clicks don't accumulate timeouts (TAS-67) */
  private copiedResetTimer: ReturnType<typeof setTimeout> | undefined

  readonly newestPendingId = computed(() =>
    findNewestPendingId(this.standups()),
  )

  readonly pageItems = computed(() => {
    const totalPages = this.totalPages()
    const currentPage = this.page()

    if (totalPages <= 1) {
      return [{ type: 'page' as const, value: 1, label: '1', track: 'page-1' }]
    }

    const pages = new Set<number>([
      1,
      totalPages,
      currentPage,
      currentPage - 1,
      currentPage + 1,
    ])
    const orderedPages = Array.from(pages)
      .filter((value) => value >= 1 && value <= totalPages)
      .sort((left, right) => left - right)

    const items: Array<
      | { type: 'page'; value: number; label: string; track: string }
      | { type: 'ellipsis'; label: string; track: string }
    > = []

    for (let index = 0; index < orderedPages.length; index += 1) {
      const value = orderedPages[index]
      if (value === undefined) continue

      const previous = orderedPages[index - 1]
      if (previous !== undefined && value - previous > 1) {
        items.push({
          type: 'ellipsis',
          label: '...',
          track: `ellipsis-${previous}-${value}`,
        })
      }

      items.push({
        type: 'page',
        value,
        label: String(value),
        track: `page-${value}`,
      })
    }

    return items
  })

  readonly rangeStart = computed(() => {
    if (this.total() === 0) return 0
    return (this.page() - 1) * this.pageSize() + 1
  })

  readonly rangeEnd = computed(() => {
    if (this.total() === 0) return 0
    return Math.min(this.page() * this.pageSize(), this.total())
  })

  previousPage() {
    if (this.page() <= 1) return
    this.pageChange.emit(this.page() - 1)
  }

  nextPage() {
    if (this.page() >= this.totalPages()) return
    this.pageChange.emit(this.page() + 1)
  }

  goToPage(page: number) {
    if (page === this.page() || page < 1 || page > this.totalPages()) return
    this.pageChange.emit(page)
  }

  async copyContent(standup: Standup) {
    const clipboard = globalThis.navigator?.clipboard
    if (!clipboard || !standup.content?.trim()) {
      toast.error('Clipboard indisponível')
      return
    }

    try {
      await clipboard.writeText(standup.content)
      this.copiedId.set(standup.id)
      toast.success('Standup copiado')
      // Cancel any pending reset before scheduling a new one (TAS-67)
      clearTimeout(this.copiedResetTimer)
      this.copiedResetTimer = setTimeout(() => this.copiedId.set(null), 2000)
    } catch {
      toast.error('Falha ao copiar')
    }
  }

  statusBadgeClass(status: StandupStatus) {
    if (status === 'approved') return 'text-primary'
    if (status === 'pending_review') return 'text-[var(--accent-yellow)]'
    return 'text-[var(--accent-red)]'
  }

  formatStatus(status: StandupStatus) {
    if (status === 'pending_review') return '[pendente]'
    if (status === 'approved') return '[aprovado]'
    return '[rejeitado]'
  }
}
