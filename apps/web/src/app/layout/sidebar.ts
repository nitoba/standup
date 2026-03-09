import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core'
import { Router, RouterLink, RouterLinkActive } from '@angular/router'

import { SessionService } from '../services/session.service'

@Component({
  selector: 'app-sidebar-layout',
  imports: [RouterLink, RouterLinkActive],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="min-h-screen w-full bg-[var(--bg-page)] text-[var(--text-primary)] flex flex-col md:flex-row">
      <!-- Mobile top bar -->
      <header class="flex md:hidden items-center justify-between h-[56px] px-[20px] border-b border-[var(--border)]">
        <span class="text-[var(--accent-green)] font-[var(--font-jetbrains)] text-[18px] font-medium">> standup_bot</span>
        <button
          type="button"
          class="text-[var(--text-secondary)] font-[var(--font-jetbrains)] text-[14px] cursor-pointer"
          aria-label="Toggle navigation menu"
          [attr.aria-expanded]="mobileMenuOpen()"
          (click)="mobileMenuOpen.set(!mobileMenuOpen())"
        >
          $ [=]
        </button>
      </header>

      <!-- Mobile slide-out nav -->
      @if (mobileMenuOpen()) {
        <nav class="flex md:hidden flex-col gap-[4px] px-[20px] py-[12px] border-b border-[var(--border)] bg-[var(--bg-surface)]">
          <a
            routerLink="/dashboard"
            routerLinkActive
            #dashMobile="routerLinkActive"
            [class]="navItemClass(dashMobile.isActive)"
            [attr.aria-current]="dashMobile.isActive ? 'page' : null"
            (click)="mobileMenuOpen.set(false)"
          >
            <span [class]="navPrefixClass(dashMobile.isActive)">$</span>
            <span [class]="navLabelClass(dashMobile.isActive)">dashboard</span>
          </a>
          <a
            routerLink="/settings"
            routerLinkActive
            #settingsMobile="routerLinkActive"
            [class]="navItemClass(settingsMobile.isActive)"
            [attr.aria-current]="settingsMobile.isActive ? 'page' : null"
            (click)="mobileMenuOpen.set(false)"
          >
            <span [class]="navPrefixClass(settingsMobile.isActive)">$</span>
            <span [class]="navLabelClass(settingsMobile.isActive)">settings</span>
          </a>
          <button
            type="button"
            class="flex items-center gap-[8px] px-[12px] py-[8px] text-[var(--accent-red)] font-[var(--font-jetbrains)] text-[13px] cursor-pointer hover:bg-[var(--bg-surface)] transition-all duration-150"
            (click)="handleSignOut()"
          >
            <span>$</span>
            <span>logout</span>
          </button>
        </nav>
      }

      <!-- Desktop sidebar -->
      <aside class="hidden md:flex w-[240px] border-r border-[var(--border)] px-[24px] py-[32px] flex-col justify-between shrink-0">
        <div class="flex flex-col gap-[32px]">
          <div class="flex items-center gap-[8px]">
            <span class="text-[var(--accent-green)] font-[var(--font-jetbrains)] text-[20px] font-bold">>></span>
            <span class="text-[var(--text-primary)] font-[var(--font-jetbrains)] text-[18px] font-medium">standup_bot</span>
          </div>

          <nav class="flex flex-col gap-[4px]">
            <a
              routerLink="/dashboard"
              routerLinkActive
              #dashActive="routerLinkActive"
              [class]="navItemClass(dashActive.isActive)"
              [attr.aria-current]="dashActive.isActive ? 'page' : null"
            >
              <span [class]="navPrefixClass(dashActive.isActive)">$</span>
              <span [class]="navLabelClass(dashActive.isActive)">dashboard</span>
            </a>

            <a
              routerLink="/settings"
              routerLinkActive
              #settingsActive="routerLinkActive"
              [class]="navItemClass(settingsActive.isActive)"
              [attr.aria-current]="settingsActive.isActive ? 'page' : null"
            >
              <span [class]="navPrefixClass(settingsActive.isActive)">$</span>
              <span [class]="navLabelClass(settingsActive.isActive)">settings</span>
            </a>

            <button
              type="button"
              class="flex items-center gap-[8px] px-[12px] py-[8px] text-[var(--text-secondary)] font-[var(--font-jetbrains)] text-[13px] cursor-not-allowed opacity-50"
              aria-disabled="true"
            >
              <span>$</span>
              <span>reports</span>
            </button>
          </nav>
        </div>

        <footer class="flex flex-col gap-[16px]">
          <button
            type="button"
            class="flex items-center gap-[8px] px-[12px] py-[8px] text-[var(--accent-red)] font-[var(--font-jetbrains)] text-[13px] cursor-pointer hover:bg-[var(--bg-surface)] transition-all duration-150 w-full"
            (click)="handleSignOut()"
          >
            <span>$</span>
            <span>logout</span>
          </button>

          <div class="flex items-center gap-[8px]">
            <span class="h-[8px] w-[8px] rounded-full bg-[var(--accent-green)]"></span>
            <div class="flex flex-col gap-[2px]">
              <span class="text-[var(--text-primary)] font-[var(--font-jetbrains)] text-[13px]">{{ displayName() }}</span>
              <span class="text-[var(--text-secondary)] font-[var(--font-ibm)] text-[12px]">online</span>
            </div>
          </div>
        </footer>
      </aside>

      <main class="flex-1 overflow-auto">
        <ng-content></ng-content>
      </main>
    </div>
  `,
})
export class SidebarLayout {
  private readonly sessionService = inject(SessionService)
  private readonly router = inject(Router)

  readonly mobileMenuOpen = signal(false)

  readonly displayName = computed(() => {
    const user = this.sessionService.user()
    if (user?.name) return `${user.name}/`
    if (user?.email) return `${user.email}/`
    return 'user/'
  })

  async handleSignOut() {
    await this.sessionService.signOut()
    await this.router.navigate(['/login'])
  }

  private readonly navBaseClass =
    'flex items-center gap-[8px] px-[12px] py-[8px] cursor-pointer transition-all duration-150 hover:bg-[var(--bg-surface)]'
  private readonly navActiveClass =
    ' bg-[var(--bg-active)] hover:bg-[var(--bg-active)]'
  private readonly navPrefixBaseClass =
    'font-[var(--font-jetbrains)] text-[13px]'
  private readonly navLabelBaseClass =
    'font-[var(--font-jetbrains)] text-[13px]'

  navItemClass(isActive: boolean) {
    return isActive
      ? this.navBaseClass + this.navActiveClass
      : this.navBaseClass
  }

  navPrefixClass(isActive: boolean) {
    return `${this.navPrefixBaseClass} ${isActive ? 'text-[var(--accent-green)]' : 'text-[var(--text-secondary)]'}`
  }

  navLabelClass(isActive: boolean) {
    return `${this.navLabelBaseClass} ${isActive ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}`
  }
}
