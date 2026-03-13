import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core'
import { RouterLink } from '@angular/router'

import {
  ZardPopoverComponent,
  ZardPopoverDirective,
} from '../../shared/components/popover'

@Component({
  selector: 'app-user-popover',
  imports: [RouterLink, ZardPopoverComponent, ZardPopoverDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button
      type="button"
      class="flex w-full items-center justify-between gap-[10px] border border-transparent px-[12px] py-[8px] text-left transition-colors duration-150 hover:border-border hover:bg-accent/20 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
      zPopover
      [zContent]="popoverContent"
      zPlacement="right"
      [zVisible]="isOpen()"
      [attr.aria-expanded]="isOpen()"
      aria-haspopup="menu"
      aria-label="Open user menu"
      (zVisibleChange)="isOpen.set($event)"
    >
      <div class="flex min-w-0 items-center gap-[10px]">
        <div
          class="flex h-[32px] w-[32px] shrink-0 items-center justify-center overflow-hidden rounded-[16px] border border-border bg-accent text-[11px] font-[var(--font-jetbrains)] text-foreground"
          [style.background-image]="avatarBackgroundImage()"
          [style.background-size]="avatarBackgroundImage() ? 'cover' : null"
          [style.background-position]="avatarBackgroundImage() ? 'center' : null"
        >
          @if (!avatarImage()) {
            <span>{{ avatarInitials() }}</span>
          }
        </div>

        <div class="flex min-w-0 flex-1 flex-col gap-[2px]">
          <span class="truncate font-[var(--font-jetbrains)] text-[13px] text-foreground">
            {{ primaryLabel() }}
          </span>
          <span class="flex items-center gap-[6px]">
            <span class="h-[6px] w-[6px] rounded-full bg-[#10B981]"></span>
            <span class="font-[var(--font-ibm)] text-[11px] text-muted-foreground">
              online
            </span>
          </span>
        </div>
      </div>

      <span class="shrink-0 font-[var(--font-jetbrains)] text-[12px] text-[#4B5563]">
        >>
      </span>
    </button>

    <ng-template #popoverContent>
      <z-popover
        [class]="'w-[260px] border-[#2a2a2a] bg-[#0a0a0a] p-0 text-white shadow-[0_20px_60px_rgba(0,0,0,0.65)]'"
      >
        <div class="flex flex-col">
          <div class="flex items-center gap-[12px] px-[20px] pb-[16px] pt-[20px]">
            <div
              class="flex h-[40px] w-[40px] shrink-0 items-center justify-center overflow-hidden rounded-[20px] border border-[#2a2a2a] bg-accent text-[14px] font-[var(--font-jetbrains)] text-foreground"
              [style.background-image]="avatarBackgroundImage()"
              [style.background-size]="avatarBackgroundImage() ? 'cover' : null"
              [style.background-position]="avatarBackgroundImage() ? 'center' : null"
            >
              @if (!avatarImage()) {
                <span>{{ avatarInitials() }}</span>
              }
            </div>

            <div class="flex min-w-0 flex-1 flex-col gap-[4px]">
              <span class="truncate font-[var(--font-jetbrains)] text-[14px] font-medium text-[#FAFAFA]">
                {{ primaryLabel() }}
              </span>
              <span class="truncate font-[var(--font-ibm)] text-[12px] text-[#6B7280]">
                {{ secondaryLabel() }}
              </span>
              <span class="flex items-center gap-[6px]">
                <span class="h-[6px] w-[6px] rounded-full bg-[#10B981]"></span>
                <span class="font-[var(--font-jetbrains)] text-[12px] text-[#10B981]">
                  online
                </span>
              </span>
            </div>
          </div>

          <div class="h-px w-full bg-[#2a2a2a]"></div>

          <div class="flex flex-col px-[8px] py-[4px]" role="menu" aria-label="User actions">
            <button
              type="button"
              class="flex w-full items-center gap-[8px] px-[12px] py-[8px] text-left opacity-50"
              disabled
              aria-disabled="true"
            >
              <span class="font-[var(--font-jetbrains)] text-[12px] text-[#6B7280]">$</span>
              <span class="font-[var(--font-jetbrains)] text-[13px] text-[#FAFAFA]">profile</span>
            </button>

            <a
              routerLink="/settings"
              class="flex w-full items-center gap-[8px] px-[12px] py-[8px] text-left transition-colors duration-150 hover:bg-white/5"
              role="menuitem"
              (click)="close()"
            >
              <span class="font-[var(--font-jetbrains)] text-[12px] text-[#6B7280]">$</span>
              <span class="font-[var(--font-jetbrains)] text-[13px] text-[#FAFAFA]">settings</span>
            </a>
          </div>

          <div class="h-px w-full bg-[#2a2a2a]"></div>

          <div class="px-[8px] pb-[8px] pt-[4px]">
            <button
              type="button"
              class="flex w-full items-center gap-[8px] px-[12px] py-[8px] text-left transition-colors duration-150 hover:bg-white/5"
              role="menuitem"
              (click)="requestSignOut()"
            >
              <span class="font-[var(--font-jetbrains)] text-[12px] text-[#EF4444]">[x]</span>
              <span class="font-[var(--font-jetbrains)] text-[13px] text-[#EF4444]">logout</span>
            </button>
          </div>
        </div>
      </z-popover>
    </ng-template>
  `,
})
export class UserPopoverComponent {
  readonly userName = input<string | null>(null)
  readonly userEmail = input<string | null>(null)
  readonly userImage = input<string | null>(null)
  readonly logoutRequested = output<void>()

  protected readonly isOpen = signal(false)

  protected readonly primaryLabel = computed(
    () => this.userName()?.trim() || this.userEmail()?.trim() || 'user',
  )

  protected readonly secondaryLabel = computed(() => {
    const email = this.userEmail()?.trim()
    if (email) {
      return email
    }

    return 'session active'
  })

  protected readonly avatarImage = computed(() => {
    const image = this.userImage()?.trim()
    return image ? image : null
  })

  protected readonly avatarBackgroundImage = computed(() => {
    const image = this.avatarImage()
    return image ? `url("${image}")` : null
  })

  protected readonly avatarInitials = computed(() => {
    const source = this.primaryLabel()
    const [first = '', second = ''] = source
      .split(/[\s@._-]+/)
      .filter(Boolean)

    return `${first[0] ?? ''}${second[0] ?? first[1] ?? ''}`
      .trim()
      .toUpperCase()
  })

  protected close() {
    this.isOpen.set(false)
  }

  protected requestSignOut() {
    this.close()
    this.logoutRequested.emit()
  }
}
