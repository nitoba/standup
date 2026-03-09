import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
} from '@angular/core'

import type { Standup, StandupStatus } from '../../types/standup'

@Component({
  selector: 'app-standup-table',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="border border-[var(--border)] flex flex-col">
      <!-- Desktop table header -->
      <div class="hidden md:block bg-[var(--bg-surface)] border-b border-[var(--border)] px-[20px] py-[12px]">
        <div class="grid grid-cols-[120px_120px_1fr_100px]">
          <span class="text-[var(--text-secondary)] font-[var(--font-jetbrains)] text-[12px] font-medium">date</span>
          <span class="text-[var(--text-secondary)] font-[var(--font-jetbrains)] text-[12px] font-medium">status</span>
          <span class="text-[var(--text-secondary)] font-[var(--font-jetbrains)] text-[12px] font-medium">content_preview</span>
          <span class="text-[var(--text-secondary)] font-[var(--font-jetbrains)] text-[12px] font-medium">actions</span>
        </div>
      </div>

      @for (standup of standups(); track standup.id) {
        <!-- Desktop row -->
        <div class="hidden md:grid border-b border-[var(--border)] px-[20px] py-[16px] grid-cols-[120px_120px_1fr_100px] items-center transition-colors duration-150 hover:bg-[var(--bg-surface)]">
          <span class="text-[var(--text-primary)] font-[var(--font-jetbrains)] text-[13px]">{{ standup.date }}</span>
          <span class="font-[var(--font-jetbrains)] text-[12px]" [class]="statusBadgeClass(standup.status)">
            {{ formatStatus(standup.status) }}
          </span>
          <span class="text-[var(--text-secondary)] font-[var(--font-ibm)] text-[13px]">{{ standup.contentPreview }}</span>
          <button
            type="button"
            class="text-left text-[var(--accent-green)] font-[var(--font-jetbrains)] text-[12px] cursor-pointer transition-colors duration-150 hover:text-[var(--text-primary)] hover:underline"
            (click)="viewStandup.emit(standup.id)"
          >
            $ view >>
          </button>
        </div>

        <!-- Mobile card -->
        <div class="md:hidden border-b border-[var(--border)] px-[16px] py-[14px] flex flex-col gap-[8px] transition-colors duration-150 hover:bg-[var(--bg-surface)]">
          <div class="flex items-center justify-between">
            <span class="text-[var(--text-primary)] font-[var(--font-jetbrains)] text-[13px]">{{ standup.date }}</span>
            <span class="font-[var(--font-jetbrains)] text-[12px]" [class]="statusBadgeClass(standup.status)">
              {{ formatStatus(standup.status) }}
            </span>
          </div>
          <span class="text-[var(--text-secondary)] font-[var(--font-ibm)] text-[12px] line-clamp-2">{{ standup.contentPreview }}</span>
          <button
            type="button"
            class="text-left text-[var(--accent-green)] font-[var(--font-jetbrains)] text-[12px] cursor-pointer transition-colors duration-150 hover:text-[var(--text-primary)] hover:underline"
            (click)="viewStandup.emit(standup.id)"
          >
            $ view >>
          </button>
        </div>
      }

      <div class="px-[16px] md:px-[20px] py-[12px] md:py-[16px] flex items-center justify-between">
        <span class="text-[var(--text-secondary)] font-[var(--font-ibm)] text-[11px] md:text-[12px]">
          // showing 1-{{ standups().length }} of {{ total() }} standups
        </span>
        <div class="flex items-center gap-[8px]">
          <span class="text-[var(--text-secondary)] font-[var(--font-jetbrains)] text-[12px]"><<</span>
          <span class="text-[var(--text-primary)] font-[var(--font-jetbrains)] text-[12px]">[1]</span>
          <span class="text-[var(--text-secondary)] font-[var(--font-jetbrains)] text-[12px]">[2]</span>
          <span class="text-[var(--text-secondary)] font-[var(--font-jetbrains)] text-[12px]">[3]</span>
          <span class="text-[var(--text-secondary)] font-[var(--font-jetbrains)] text-[12px]">>></span>
        </div>
      </div>
    </div>
  `,
})
export class StandupTable {
  readonly standups = input.required<Standup[]>()
  readonly total = input.required<number>()
  readonly viewStandup = output<string>()

  statusBadgeClass(status: StandupStatus) {
    if (status === 'approved') return 'text-[var(--accent-green)]'
    if (status === 'pending_review') return 'text-[var(--accent-cyan)]'
    return 'text-[var(--accent-amber)]'
  }

  formatStatus(status: StandupStatus) {
    if (status === 'pending_review') return '[pending]'
    return status === 'approved' ? '[approved]' : '[rejected]'
  }
}
