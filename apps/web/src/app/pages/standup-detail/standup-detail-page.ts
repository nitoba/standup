import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
} from '@angular/core'
import { RouterLink } from '@angular/router'

import { SidebarLayout } from '../../layout/sidebar'
import { StandupService } from '../../services/standup.service'
import type { StandupSectionTone, StandupStatus } from '../../types/standup'

@Component({
  selector: 'app-standup-detail-page',
  imports: [SidebarLayout, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-sidebar-layout>
      <section class="min-h-screen bg-[var(--bg-page)] text-[var(--text-primary)] p-[20px] md:p-[40px] flex flex-col gap-[24px] md:gap-[32px]">
        <a routerLink="/dashboard" class="text-[var(--text-secondary)] font-[var(--font-jetbrains)] text-[12px] flex items-center gap-[12px] transition-colors duration-150 hover:text-[var(--text-primary)]">
          <span><<</span>
          <span>back to standups</span>
        </a>

        @if (standup.isLoading()) {
          <div class="text-[var(--text-secondary)] font-[var(--font-ibm)] text-[13px]">// loading standup detail...</div>
        } @else if (standup.error()) {
          <div class="text-[var(--accent-red)] font-[var(--font-ibm)] text-[13px]">// standup not found</div>
        } @else if (standup.value(); as detail) {
          <div class="flex flex-col gap-[16px]">
            <div class="flex items-center gap-[12px]">
              <span class="text-[var(--accent-green)] font-[var(--font-jetbrains)] text-[24px] md:text-[32px] font-bold">>></span>
              <span class="text-[var(--text-primary)] font-[var(--font-jetbrains)] text-[20px] md:text-[28px] font-bold">standup_detail</span>
            </div>
            <div class="flex flex-wrap items-center gap-[12px] md:gap-[24px]">
              <span class="text-[var(--text-secondary)] font-[var(--font-ibm)] text-[12px]">// {{ detail.date }}</span>
              <div class="flex items-center gap-[8px]">
                <span class="h-[6px] w-[6px] rounded-full" [class]="statusDotClass(detail.status)"></span>
                <span class="font-[var(--font-jetbrains)] text-[12px]" [class]="statusTextClass(detail.status)">
                  {{ formatStatus(detail.status) }}
                </span>
              </div>
              <span class="hidden md:inline text-[var(--text-secondary)] font-[var(--font-ibm)] text-[12px]">created: {{ detail.createdAt }}</span>
              <span class="hidden md:inline text-[var(--text-tertiary)] font-[var(--font-ibm)] text-[12px]">id: {{ detail.id }}</span>
            </div>
          </div>

          <div class="bg-[var(--bg-surface)] border border-[var(--border)] p-[16px] md:p-[24px] flex flex-col gap-[16px] md:gap-[20px]">
            @for (section of detail.sections; track section.title) {
              <div class="flex flex-col gap-[8px]">
                <div class="text-[var(--text-emphasis)] font-[var(--font-jetbrains)] text-[14px] font-bold">{{ section.title }}</div>
                @for (item of section.items; track item) {
                  <div class="font-[var(--font-ibm)] text-[13px] leading-[1.6]" [class]="sectionToneClass(section.tone)">
                    {{ item }}
                  </div>
                }
              </div>
            }
          </div>

          <div class="border border-[var(--border)] p-[20px] flex flex-col gap-[20px]">
            @for (repo of detail.sources; track repo.name) {
              <div class="flex flex-col gap-[8px]">
                <div class="text-[var(--accent-green)] font-[var(--font-jetbrains)] text-[13px] font-medium">{{ repo.name }}</div>
                @for (commit of repo.commits; track commit.hash) {
                  <div class="flex gap-[12px] pl-[16px]">
                    <span class="text-[var(--text-tertiary)] font-[var(--font-jetbrains)] text-[12px]">{{ commit.hash }}</span>
                    <span class="text-[var(--text-primary)] font-[var(--font-ibm)] text-[12px]">{{ commit.message }}</span>
                  </div>
                }
              </div>
            }
          </div>

          <div class="flex flex-col md:flex-row items-stretch md:items-center gap-[12px] md:gap-[16px]">
            <button
              type="button"
              class="h-[44px] md:h-auto bg-[var(--accent-green)] border border-[var(--accent-green)] px-[20px] py-[10px] text-[var(--bg-page)] font-[var(--font-jetbrains)] text-[12px] font-medium cursor-pointer transition-all duration-150 hover:brightness-110 hover:shadow-[0_0_12px_var(--accent-green)] active:brightness-90 flex items-center justify-center"
              (click)="approve(detail.id)"
            >
              $ approve
            </button>
            <button
              type="button"
              class="h-[44px] md:h-auto border border-[var(--accent-red)] px-[20px] py-[10px] text-[var(--accent-red)] font-[var(--font-jetbrains)] text-[12px] font-medium cursor-pointer transition-all duration-150 hover:bg-[var(--accent-red)] hover:text-[var(--bg-page)] active:brightness-90 flex items-center justify-center"
              (click)="reject(detail.id)"
            >
              $ reject
            </button>
            <button
              type="button"
              class="h-[44px] md:h-auto border border-[var(--accent-cyan)] px-[20px] py-[10px] text-[var(--accent-cyan)] font-[var(--font-jetbrains)] text-[12px] font-medium cursor-pointer transition-all duration-150 hover:bg-[var(--accent-cyan)] hover:text-[var(--bg-page)] active:brightness-90 flex items-center justify-center"
              (click)="regenerate(detail.id)"
            >
              $ regenerate
            </button>
          </div>
        } @else {
          <div class="text-[var(--text-secondary)] font-[var(--font-ibm)] text-[13px]">// standup not found</div>
        }
      </section>
    </app-sidebar-layout>
  `,
})
export class StandupDetailPage {
  private readonly standupService = inject(StandupService)

  readonly id = input.required<string>()
  readonly standup = this.standupService.getStandupById(this.id)

  async approve(id: string) {
    await this.standupService.approve(id)
    this.standup.reload()
  }

  async reject(id: string) {
    await this.standupService.reject(id)
    this.standup.reload()
  }

  async regenerate(id: string) {
    await this.standupService.regenerate(id)
    this.standup.reload()
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

  sectionToneClass(tone: StandupSectionTone) {
    if (tone === 'cyan') return 'text-[var(--accent-cyan)]'
    if (tone === 'muted') return 'text-[var(--text-secondary)]'
    return 'text-[var(--text-primary)]'
  }
}
