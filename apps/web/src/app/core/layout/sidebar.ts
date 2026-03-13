import { DOCUMENT } from '@angular/common'
import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  signal,
} from '@angular/core'
import { Router, RouterLink, RouterLinkActive } from '@angular/router'
import { ZardButtonComponent } from '../../shared/components/button'
import { ThemeToggleComponent } from '../../shared/components/theme-toggle'
import { SessionService } from '../auth/session-service'
import { UserPopoverComponent } from './user-popover'

@Component({
  selector: 'app-sidebar-layout',
  imports: [
    RouterLink,
    RouterLinkActive,
    ZardButtonComponent,
    ThemeToggleComponent,
    UserPopoverComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="h-dvh w-full overflow-hidden bg-background text-foreground flex flex-col md:flex-row">
      <!-- Mobile top bar -->
      <header class="relative z-50 flex shrink-0 md:hidden items-center justify-between h-[56px] px-[20px] border-b border-border bg-background">
        <span class="text-primary font-[var(--font-jetbrains)] text-[18px] font-medium">> standup_bot</span>
        <button
          type="button"
          z-button
          zType="ghost"
          zSize="sm"
          class="px-2"
          aria-label="Toggle navigation menu"
          [attr.aria-expanded]="mobileMenuOpen()"
          (click)="mobileMenuOpen.set(!mobileMenuOpen())"
        >
          $ [=]
        </button>
      </header>

      <!-- Mobile slide-out nav -->
      @if (mobileMenuOpen()) {
        <nav class="fixed inset-x-0 top-[56px] bottom-0 z-40 flex shrink-0 md:hidden flex-col gap-[4px] overflow-y-auto border-b border-border bg-background/95 px-[20px] py-[12px] backdrop-blur-sm">
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
          <app-theme-toggle showLabel fullWidth class="mt-2" />
          <button
            type="button"
            z-button
            zType="destructive"
            zSize="sm"
            class="justify-start"
            (click)="handleSignOut()"
          >
            <span>$</span>
            <span>logout</span>
          </button>
        </nav>
      }

      <!-- Desktop sidebar -->
      <aside class="hidden md:flex h-full w-[240px] border-r border-border bg-background px-[24px] py-[32px] flex-col justify-between shrink-0">
        <div class="flex flex-col gap-[32px]">
          <div class="flex items-center gap-[8px]">
            <span class="text-primary font-[var(--font-jetbrains)] text-[20px] font-bold">>></span>
            <span class="text-foreground font-[var(--font-jetbrains)] text-[18px] font-medium">standup_bot</span>
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
              z-button
              zType="outline"
              zSize="sm"
              [zDisabled]="true"
              class="justify-start opacity-50"
              aria-disabled="true"
            >
              <span>$</span>
              <span>reports</span>
            </button>

            <app-theme-toggle showLabel fullWidth class="pt-2" />
          </nav>
        </div>

        <footer>
          <app-user-popover
            [userName]="currentUser()?.name ?? null"
            [userEmail]="currentUser()?.email ?? null"
            [userImage]="currentUser()?.image ?? null"
            (logoutRequested)="handleSignOut()"
          />
        </footer>
      </aside>

      <main class="flex-1 min-h-0 overflow-y-auto overflow-x-hidden bg-background">
        <ng-content></ng-content>
      </main>
    </div>
  `,
})
export class SidebarLayout {
  private readonly document = inject(DOCUMENT)
  private readonly sessionService = inject(SessionService)
  private readonly router = inject(Router)

  readonly mobileMenuOpen = signal(false)
  readonly currentUser = this.sessionService.user

  constructor() {
    effect((onCleanup) => {
      if (!this.mobileMenuOpen()) {
        return
      }

      const previousOverflow = this.document.body.style.overflow
      this.document.body.style.overflow = 'hidden'

      onCleanup(() => {
        this.document.body.style.overflow = previousOverflow
      })
    })
  }

  async handleSignOut() {
    await this.sessionService.signOut()
    await this.router.navigate(['/login'])
  }

  private readonly navBaseClass =
    'flex items-center gap-[8px] px-[12px] py-[8px] cursor-pointer transition-all duration-150 hover:bg-accent/30'
  private readonly navActiveClass = ' bg-accent hover:bg-accent'
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
    return `${this.navPrefixBaseClass} ${isActive ? 'text-primary' : 'text-muted-foreground'}`
  }

  navLabelClass(isActive: boolean) {
    return `${this.navLabelBaseClass} ${isActive ? 'text-foreground' : 'text-muted-foreground'}`
  }
}
