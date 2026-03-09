import { ChangeDetectionStrategy, Component } from '@angular/core'
import { RouterLink, RouterLinkActive } from '@angular/router'

@Component({
  selector: 'app-sidebar-layout',
  imports: [RouterLink, RouterLinkActive],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="min-h-screen w-full bg-[var(--bg-page)] text-[var(--text-primary)] flex">
      <aside class="w-[240px] border-r border-[var(--border)] px-[24px] py-[32px] flex flex-col justify-between">
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
          <div class="border border-[var(--border)] p-[16px] flex flex-col gap-[8px]">
            <span class="text-[var(--accent-amber)] font-[var(--font-jetbrains)] text-[12px]">[!] upgrade available</span>
            <span class="text-[var(--text-secondary)] font-[var(--font-ibm)] text-[12px]">// premium features unlocked</span>
          </div>

          <div class="flex items-center gap-[8px]">
            <span class="h-[8px] w-[8px] rounded-full bg-[var(--accent-green)]"></span>
            <div class="flex flex-col gap-[2px]">
              <span class="text-[var(--text-primary)] font-[var(--font-jetbrains)] text-[13px]">nitoba/</span>
              <span class="text-[var(--text-secondary)] font-[var(--font-ibm)] text-[12px]">online</span>
            </div>
          </div>
          </footer>
      </aside>

      <main class="flex-1">
        <ng-content></ng-content>
      </main>
    </div>
  `,
})
export class SidebarLayout {
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
