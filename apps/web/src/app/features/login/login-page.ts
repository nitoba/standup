import { ChangeDetectionStrategy, Component, inject } from '@angular/core'
import { ActivatedRoute } from '@angular/router'
import { SessionService } from '../../core/auth/session-service'
import { ZardButtonComponent } from '../../shared/components/button'

@Component({
  selector: 'app-login-page',
  imports: [ZardButtonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'block h-screen w-screen overflow-hidden',
  },
  template: `
    <div class="relative h-full w-full bg-background text-foreground">
      <!-- Background decorative comments (hidden on mobile) -->
      <span
        class="hidden md:block absolute left-[4.17%] top-[8.89%] text-muted-foreground/70 font-[var(--font-ibm)] text-[12px]"
        aria-hidden="true"
      >
        // authenticating user...
      </span>
      <span
        class="hidden md:block absolute left-[62.5%] top-[13.33%] text-muted-foreground/70 font-[var(--font-ibm)] text-[12px]"
        aria-hidden="true"
      >
        $ git log --oneline --since=today
      </span>
      <span
        class="hidden md:block absolute left-[5.56%] top-[44.44%] text-muted-foreground/70 font-[var(--font-ibm)] text-[12px]"
        aria-hidden="true"
      >
        // awaiting credentials...
      </span>
      <span
        class="hidden md:block absolute left-[76.39%] top-[48.89%] text-muted-foreground/70 font-[var(--font-ibm)] text-[12px]"
        aria-hidden="true"
      >
        $ cd ~/repos && git fetch --all
      </span>
      <span
        class="hidden md:block absolute left-[8.33%] top-[80%] text-muted-foreground/70 font-[var(--font-ibm)] text-[12px]"
        aria-hidden="true"
      >
        // loading standup pipeline...
      </span>
      <span
        class="hidden md:block absolute left-[66.67%] top-[84.44%] text-muted-foreground/70 font-[var(--font-ibm)] text-[12px]"
        aria-hidden="true"
      >
        $ standup --generate --publish
      </span>

      <!-- Blinking cursors (hidden on mobile) -->
      <span
        class="hidden md:block absolute left-[17.01%] top-[8.89%] h-[14px] w-[7px] bg-[var(--accent-green)] opacity-60 animate-pulse"
        aria-hidden="true"
      ></span>
      <span
        class="hidden md:block absolute left-[92.22%] top-[48.89%] h-[14px] w-[7px] bg-[var(--accent-green)] opacity-60 animate-pulse"
        aria-hidden="true"
      ></span>

      <!-- Login card -->
      <div
        class="absolute left-1/2 top-[26%] md:top-[24.44%] w-[calc(100%-48px)] md:w-[420px] -translate-x-1/2 rounded-lg border border-border bg-card p-[24px] md:p-[40px] flex flex-col gap-[24px] md:gap-[32px] items-center shadow-[0_20px_60px_rgba(0,0,0,0.35)]"
      >
        <!-- Logo section -->
        <div class="flex flex-col gap-[8px] items-center w-full">
          <div class="flex items-center gap-[8px]">
            <span
              class="text-[var(--accent-green)] font-[var(--font-jetbrains)] text-[20px] md:text-[28px] font-bold"
              >></span
            >
            <span
              class="text-foreground font-[var(--font-jetbrains)] text-[20px] md:text-[28px] font-bold"
              >standup_bot</span
            >
          </div>
          <div
            class="text-center text-muted-foreground font-[var(--font-ibm)] text-[13px] w-full"
          >
            automate your daily standups from git commits
          </div>
        </div>

        <!-- Divider -->
        <div class="h-[1px] w-full bg-border"></div>

        <!-- How it works -->
        <div class="flex flex-col gap-[12px] items-center w-full">
          <div
            class="text-muted-foreground font-[var(--font-jetbrains)] text-[12px]"
          >
            // how it works
          </div>
          <div
            class="text-center text-muted-foreground/80 font-(--font-ibm) text-[12px] leading-[1.6] w-full"
          >
            collect commits → enrich with azure devops → generate standup via ai
            → review and publish on discord
          </div>
        </div>

        <!-- Sign in button -->
        <div class="flex flex-col gap-[16px] items-center w-full">
          <button
            type="button"
            z-button
            zType="default"
            zFull
            zSize="lg"
            (click)="signIn()"
            class="w-full"
          >
            <span>$</span>
            <span>sign in with discord</span>
          </button>
          <div
            class="text-muted-foreground/80 font-[var(--font-ibm)] text-[11px]"
          >
            // discord oauth2 — no password required
          </div>
        </div>

        <!-- Version -->
        <div
          class="text-muted-foreground/80 font-[var(--font-ibm)] text-[11px]"
        >
          v1.0.0 — built with bun + hono + drizzle
        </div>
      </div>

      <!-- Bottom prompt (hidden on mobile) -->
      <span
        class="hidden md:block absolute left-[4.17%] top-[93.33%] text-muted-foreground/80 font-[var(--font-jetbrains)] text-[11px]"
        aria-hidden="true"
      >
        visitor@standup-bot:~$
      </span>
      <span
        class="hidden md:block absolute left-[14.58%] top-[93.44%] h-[14px] w-[7px] bg-muted-foreground opacity-50"
        aria-hidden="true"
      ></span>
    </div>
  `,
})
export class LoginPage {
  private readonly sessionService = inject(SessionService)
  private readonly route = inject(ActivatedRoute)

  signIn() {
    const returnUrl =
      this.route.snapshot.queryParamMap.get('returnUrl') ?? '/dashboard'
    this.sessionService.signIn(returnUrl)
  }
}
