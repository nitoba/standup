# Settings Page API Wiring Implementation Plan

**Goal:** Rewrite the SettingsPage to load data from `SettingsService` API, replace free-text repos with checkbox selection from available repos, add loading/error/saving states, and remove backend-unsupported fields (`discordDmPreview`, danger zone).

**Architecture:** The SettingsPage injects `SettingsService` and calls `loadSettings()` + `loadRepos()` in parallel on init. The form model is simplified to match `SaveSettingsInput` exactly. Repos are rendered as checkboxes from `SettingsService.repos()`. Save calls `SettingsService.saveSettings()` with feedback UI. Angular Signal Forms (`form()`, `required()`, `submit()`, `FormField`) are retained.

**Design:** User-provided design spec in the task prompt (no separate design file).

---

## Dependency Graph

```
Batch 1 (sequential): 1.1 [component rewrite]
Batch 2 (sequential): 2.1 [spec rewrite — depends on 1.1]
```

Only 2 files to modify, and the spec depends on the component's final API. Sequential batches.

---

## Batch 1: Component Rewrite (1 implementer)

### Task 1.1: Rewrite SettingsPage to use SettingsService API
**File:** `apps/web/src/app/pages/settings/settings-page.ts`
**Test:** Task 2.1 (separate batch — spec needs the final component shape)
**Depends:** none

**Context for implementer:**
- `SettingsService` is already implemented at `apps/web/src/app/services/settings.service.ts` — do NOT modify it.
- It exposes: `loadSettings(): Promise<SettingsRecord>`, `loadRepos(): Promise<RepoOption[]>`, `saveSettings(input: SaveSettingsInput): Promise<SettingsRecord>`
- It also exposes readonly signals: `settings()` → `SettingsRecord | null`, `repos()` → `RepoOption[]`
- Types `SettingsRecord`, `RepoOption`, `SaveSettingsInput` are exported from the service file.
- The component uses Angular Signal Forms: `form()`, `required()`, `submit()`, `FormField` from `@angular/forms/signals`.
- The `SidebarLayout` component is at `../../layout/sidebar`.
- Angular v21+ — standalone is the default, do NOT set `standalone: true`.
- Use `inject()` for DI, `ChangeDetectionStrategy.OnPush`, inline template.

**What changes from current code:**
1. Remove `SettingsModel` interface — replace with a model that matches `SaveSettingsInput` exactly (flat, no nested `notifications`).
2. Remove `discordDmPreview` toggle — backend doesn't have it.
3. Remove danger zone section — backend doesn't support it from settings endpoint.
4. Remove `repos: string[]` free-text inputs — replace with checkboxes from available repos.
5. Remove `addRepo()`, `removeRepo()`, `toggleNotification()` methods.
6. Add `toggleRepo(repoName: string)` method.
7. Add `toggleActive()` method (flat boolean toggle, not nested).
8. Inject `SettingsService` and load data on init.
9. Add loading/error/saving/feedback state signals.
10. Wire `onSubmit` to `settingsService.saveSettings()`.

```typescript
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core'
import { FormField, form, required, submit } from '@angular/forms/signals'

import { SidebarLayout } from '../../layout/sidebar'
import {
  type RepoOption,
  type SaveSettingsInput,
  SettingsService,
} from '../../services/settings.service'

@Component({
  selector: 'app-settings-page',
  imports: [SidebarLayout, FormField],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-sidebar-layout>
      <section
        class="min-h-screen bg-[var(--bg-page)] text-[var(--text-primary)] p-[20px] md:p-[40px] flex flex-col gap-[28px] md:gap-[40px]"
      >
        <div class="flex flex-col gap-[8px]">
          <div class="flex items-center gap-[12px]">
            <span
              class="text-[var(--accent-green)] font-[var(--font-jetbrains)] text-[28px] font-bold"
              >></span
            >
            <span
              class="text-[var(--text-primary)] font-[var(--font-jetbrains)] text-[28px] font-bold"
              >settings</span
            >
          </div>
          <div
            class="text-[var(--text-secondary)] font-[var(--font-ibm)] text-[14px]"
          >
            // configure your standup automation preferences
          </div>
        </div>

        @if (loading()) {
          <div
            class="text-[var(--text-secondary)] font-[var(--font-ibm)] text-[13px]"
          >
            // loading settings...
          </div>
        } @else if (loadError()) {
          <div class="flex flex-col gap-[12px]">
            <div
              class="text-[var(--accent-red)] font-[var(--font-ibm)] text-[13px]"
            >
              // failed to load settings
            </div>
            <button
              type="button"
              class="w-fit border border-[var(--border)] px-[12px] py-[6px] font-[var(--font-jetbrains)] text-[12px] text-[var(--text-secondary)] cursor-pointer transition-colors duration-150 hover:border-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface)]"
              (click)="retryLoad()"
            >
              $ retry
            </button>
          </div>
        } @else {
          <form (submit)="onSubmit($event)" class="flex flex-col gap-[32px]">
            <!-- Schedule section -->
            <div
              class="border border-[var(--border)] p-[16px] md:p-[24px] flex flex-col gap-[16px]"
            >
              <div class="flex items-center gap-[8px]">
                <span
                  class="text-[var(--text-tertiary)] font-[var(--font-jetbrains)] text-[14px]"
                  >//</span
                >
                <span
                  class="text-[var(--text-emphasis)] font-[var(--font-jetbrains)] text-[14px] font-medium"
                  >schedule</span
                >
              </div>
              <div class="flex flex-col gap-[16px]">
                <div
                  class="grid grid-cols-1 md:grid-cols-2 gap-[16px] md:gap-[24px]"
                >
                  <div class="flex flex-col gap-[6px]">
                    <label
                      for="standup-cron"
                      class="text-[var(--text-secondary)] font-[var(--font-jetbrains)] text-[12px]"
                      >standup_cron</label
                    >
                    <input
                      id="standup-cron"
                      type="text"
                      [formField]="settingsForm.standupCron"
                      class="border border-[var(--border)] bg-[var(--bg-page)] px-[12px] py-[10px] font-[var(--font-jetbrains)] text-[13px] text-[var(--text-primary)] outline-none transition-colors duration-150 focus:border-[var(--accent-green)]"
                    />
                    @if (
                      settingsForm.standupCron().touched() &&
                      settingsForm.standupCron().invalid()
                    ) {
                      <span
                        class="text-[var(--accent-red)] font-[var(--font-ibm)] text-[11px]"
                      >
                        {{ settingsForm.standupCron().errors()[0]?.message }}
                      </span>
                    }
                  </div>
                  <div class="flex flex-col gap-[6px]">
                    <label
                      for="reminder-cron"
                      class="text-[var(--text-secondary)] font-[var(--font-jetbrains)] text-[12px]"
                      >reminder_cron</label
                    >
                    <input
                      id="reminder-cron"
                      type="text"
                      [formField]="settingsForm.reminderCron"
                      class="border border-[var(--border)] bg-[var(--bg-page)] px-[12px] py-[10px] font-[var(--font-jetbrains)] text-[13px] text-[var(--text-primary)] outline-none transition-colors duration-150 focus:border-[var(--accent-green)]"
                    />
                    @if (
                      settingsForm.reminderCron().touched() &&
                      settingsForm.reminderCron().invalid()
                    ) {
                      <span
                        class="text-[var(--accent-red)] font-[var(--font-ibm)] text-[11px]"
                      >
                        {{ settingsForm.reminderCron().errors()[0]?.message }}
                      </span>
                    }
                  </div>
                </div>
                <div
                  class="grid grid-cols-1 md:grid-cols-2 gap-[16px] md:gap-[24px]"
                >
                  <div class="flex flex-col gap-[6px]">
                    <label
                      for="recovery-cron"
                      class="text-[var(--text-secondary)] font-[var(--font-jetbrains)] text-[12px]"
                      >recovery_cron</label
                    >
                    <input
                      id="recovery-cron"
                      type="text"
                      [formField]="settingsForm.recoveryCron"
                      class="border border-[var(--border)] bg-[var(--bg-page)] px-[12px] py-[10px] font-[var(--font-jetbrains)] text-[13px] text-[var(--text-primary)] outline-none transition-colors duration-150 focus:border-[var(--accent-green)]"
                    />
                    @if (
                      settingsForm.recoveryCron().touched() &&
                      settingsForm.recoveryCron().invalid()
                    ) {
                      <span
                        class="text-[var(--accent-red)] font-[var(--font-ibm)] text-[11px]"
                      >
                        {{ settingsForm.recoveryCron().errors()[0]?.message }}
                      </span>
                    }
                  </div>
                  <div class="flex flex-col gap-[6px]">
                    <label
                      for="timezone"
                      class="text-[var(--text-secondary)] font-[var(--font-jetbrains)] text-[12px]"
                      >timezone</label
                    >
                    <input
                      id="timezone"
                      type="text"
                      [formField]="settingsForm.timezone"
                      class="border border-[var(--border)] bg-[var(--bg-page)] px-[12px] py-[10px] font-[var(--font-jetbrains)] text-[13px] text-[var(--text-primary)] outline-none transition-colors duration-150 focus:border-[var(--accent-green)]"
                    />
                    @if (
                      settingsForm.timezone().touched() &&
                      settingsForm.timezone().invalid()
                    ) {
                      <span
                        class="text-[var(--accent-red)] font-[var(--font-ibm)] text-[11px]"
                      >
                        {{ settingsForm.timezone().errors()[0]?.message }}
                      </span>
                    }
                  </div>
                </div>
              </div>
            </div>

            <!-- Git configuration section -->
            <div
              class="border border-[var(--border)] p-[16px] md:p-[24px] flex flex-col gap-[16px]"
            >
              <div class="flex items-center gap-[8px]">
                <span
                  class="text-[var(--text-tertiary)] font-[var(--font-jetbrains)] text-[14px]"
                  >//</span
                >
                <span
                  class="text-[var(--text-emphasis)] font-[var(--font-jetbrains)] text-[14px] font-medium"
                  >git_configuration</span
                >
              </div>
              <div
                class="grid grid-cols-1 md:grid-cols-2 gap-[16px] md:gap-[24px]"
              >
                <div class="flex flex-col gap-[6px]">
                  <label
                    for="git-author"
                    class="text-[var(--text-secondary)] font-[var(--font-jetbrains)] text-[12px]"
                    >git_author</label
                  >
                  <input
                    id="git-author"
                    type="text"
                    [formField]="settingsForm.gitAuthor"
                    class="border border-[var(--border)] bg-[var(--bg-page)] px-[12px] py-[10px] font-[var(--font-jetbrains)] text-[13px] text-[var(--text-primary)] outline-none transition-colors duration-150 focus:border-[var(--accent-green)]"
                  />
                  @if (
                    settingsForm.gitAuthor().touched() &&
                    settingsForm.gitAuthor().invalid()
                  ) {
                    <span
                      class="text-[var(--accent-red)] font-[var(--font-ibm)] text-[11px]"
                    >
                      {{ settingsForm.gitAuthor().errors()[0]?.message }}
                    </span>
                  }
                </div>
                <div class="flex flex-col gap-[6px]">
                  <label
                    for="git-since-period"
                    class="text-[var(--text-secondary)] font-[var(--font-jetbrains)] text-[12px]"
                    >git_since_period</label
                  >
                  <input
                    id="git-since-period"
                    type="text"
                    [formField]="settingsForm.gitSincePeriod"
                    class="border border-[var(--border)] bg-[var(--bg-page)] px-[12px] py-[10px] font-[var(--font-jetbrains)] text-[13px] text-[var(--text-primary)] outline-none transition-colors duration-150 focus:border-[var(--accent-green)]"
                  />
                  @if (
                    settingsForm.gitSincePeriod().touched() &&
                    settingsForm.gitSincePeriod().invalid()
                  ) {
                    <span
                      class="text-[var(--accent-red)] font-[var(--font-ibm)] text-[11px]"
                    >
                      {{
                        settingsForm.gitSincePeriod().errors()[0]?.message
                      }}
                    </span>
                  }
                </div>
              </div>
            </div>

            <!-- Selected repositories section -->
            <div
              class="border border-[var(--border)] p-[16px] md:p-[24px] flex flex-col gap-[16px]"
            >
              <div class="flex items-center gap-[8px]">
                <span
                  class="text-[var(--text-tertiary)] font-[var(--font-jetbrains)] text-[14px]"
                  >//</span
                >
                <span
                  class="text-[var(--text-emphasis)] font-[var(--font-jetbrains)] text-[14px] font-medium"
                  >selected_repositories</span
                >
              </div>
              <div class="flex flex-col gap-[4px]">
                @for (repo of availableRepos(); track repo.id) {
                  <label
                    class="border border-[var(--border)] px-[12px] py-[10px] flex items-center gap-[10px] cursor-pointer transition-colors duration-150 hover:bg-[var(--bg-surface)]"
                  >
                    <input
                      type="checkbox"
                      [checked]="isRepoSelected(repo.name)"
                      (change)="toggleRepo(repo.name)"
                      class="accent-[var(--accent-green)] w-[14px] h-[14px] cursor-pointer"
                      [attr.aria-label]="'Select repository ' + repo.name"
                    />
                    <div class="flex items-center gap-[8px] flex-1">
                      <span
                        class="text-[var(--accent-green)] font-[var(--font-jetbrains)] text-[13px]"
                        >~/</span
                      >
                      <span
                        class="font-[var(--font-jetbrains)] text-[13px] text-[var(--text-primary)]"
                        >{{ repo.name }}</span
                      >
                    </div>
                    <span
                      class="text-[var(--text-tertiary)] font-[var(--font-ibm)] text-[11px]"
                      >{{ repo.project }}</span
                    >
                  </label>
                }
                @if (availableRepos().length === 0) {
                  <div
                    class="text-[var(--text-tertiary)] font-[var(--font-ibm)] text-[12px] py-[8px]"
                  >
                    // no repositories available
                  </div>
                }
              </div>
            </div>

            <!-- Automation section -->
            <div
              class="border border-[var(--border)] p-[16px] md:p-[24px] flex flex-col gap-[16px]"
            >
              <div class="flex items-center gap-[8px]">
                <span
                  class="text-[var(--text-tertiary)] font-[var(--font-jetbrains)] text-[14px]"
                  >//</span
                >
                <span
                  class="text-[var(--text-emphasis)] font-[var(--font-jetbrains)] text-[14px] font-medium"
                  >automation</span
                >
              </div>
              <div class="flex items-center justify-between">
                <div class="flex flex-col gap-[2px]">
                  <span
                    class="text-[var(--text-primary)] font-[var(--font-jetbrains)] text-[13px]"
                    >active</span
                  >
                  <span
                    class="text-[var(--text-secondary)] font-[var(--font-ibm)] text-[12px]"
                    >enable automatic standup generation</span
                  >
                </div>
                <button
                  type="button"
                  class="w-[40px] h-[22px] rounded-full px-[3px] flex items-center cursor-pointer transition-colors duration-150"
                  aria-label="Toggle active"
                  role="switch"
                  [attr.aria-checked]="settingsModel().active"
                  [class]="
                    settingsModel().active
                      ? 'w-[40px] h-[22px] rounded-full px-[3px] flex items-center justify-end bg-[var(--accent-green)] cursor-pointer transition-colors duration-150'
                      : 'w-[40px] h-[22px] rounded-full px-[3px] flex items-center justify-start bg-[var(--border)] cursor-pointer transition-colors duration-150'
                  "
                  (click)="toggleActive()"
                >
                  <span class="h-[16px] w-[16px] rounded-full bg-white"></span>
                </button>
              </div>
            </div>

            <!-- Save button + feedback -->
            <div class="flex flex-col gap-[12px] items-end">
              <button
                type="submit"
                class="w-full md:w-auto h-[44px] md:h-auto bg-[var(--accent-green)] px-[24px] py-[10px] text-[#0A0A0A] font-[var(--font-jetbrains)] text-[12px] font-medium cursor-pointer transition-all duration-150 hover:brightness-110 hover:shadow-[0_0_12px_var(--accent-green)] active:brightness-90"
                [class.opacity-50]="settingsForm().invalid() || saving()"
                [class.cursor-not-allowed]="
                  settingsForm().invalid() || saving()
                "
                [disabled]="settingsForm().invalid() || saving()"
              >
                {{ saving() ? '$ saving...' : '$ save_settings' }}
              </button>
              @if (saveFeedback(); as feedback) {
                <div
                  class="font-[var(--font-ibm)] text-[12px]"
                  [class]="
                    feedback.type === 'success'
                      ? 'text-[var(--accent-green)]'
                      : 'text-[var(--accent-red)]'
                  "
                >
                  {{ feedback.message }}
                </div>
              }
            </div>
          </form>
        }
      </section>
    </app-sidebar-layout>
  `,
})
export class SettingsPage {
  private readonly settingsService = inject(SettingsService)

  readonly loading = signal(true)
  readonly loadError = signal(false)
  readonly saving = signal(false)
  readonly saveFeedback = signal<{
    type: 'success' | 'error'
    message: string
  } | null>(null)

  readonly settingsModel = signal<SaveSettingsInput>({
    standupCron: '',
    reminderCron: '',
    recoveryCron: '',
    timezone: '',
    gitAuthor: '',
    gitSincePeriod: '',
    selectedRepos: [],
    active: false,
  })

  readonly availableRepos = computed<RepoOption[]>(() =>
    this.settingsService.repos(),
  )

  readonly settingsForm = form(this.settingsModel, (s) => {
    required(s.standupCron, { message: 'cron expression is required' })
    required(s.reminderCron, { message: 'cron expression is required' })
    required(s.recoveryCron, { message: 'cron expression is required' })
    required(s.timezone, { message: 'timezone is required' })
    required(s.gitAuthor, { message: 'git author is required' })
    required(s.gitSincePeriod, { message: 'git since period is required' })
  })

  constructor() {
    void this.loadData()
  }

  isRepoSelected(repoName: string): boolean {
    return this.settingsModel().selectedRepos.includes(repoName)
  }

  toggleRepo(repoName: string) {
    this.settingsModel.update((m) => {
      const selected = m.selectedRepos.includes(repoName)
        ? m.selectedRepos.filter((r) => r !== repoName)
        : [...m.selectedRepos, repoName]
      return { ...m, selectedRepos: selected }
    })
  }

  toggleActive() {
    this.settingsModel.update((m) => ({ ...m, active: !m.active }))
  }

  retryLoad() {
    this.loadError.set(false)
    this.loading.set(true)
    void this.loadData()
  }

  onSubmit(event: Event) {
    event.preventDefault()
    submit(this.settingsForm, async () => {
      this.saving.set(true)
      this.saveFeedback.set(null)
      try {
        await this.settingsService.saveSettings(this.settingsModel())
        this.saveFeedback.set({
          type: 'success',
          message: '// settings saved',
        })
        setTimeout(() => this.saveFeedback.set(null), 3000)
      } catch {
        this.saveFeedback.set({
          type: 'error',
          message: '// failed to save settings',
        })
      } finally {
        this.saving.set(false)
      }
    })
  }

  private async loadData() {
    try {
      const [settings] = await Promise.all([
        this.settingsService.loadSettings(),
        this.settingsService.loadRepos(),
      ])
      this.settingsModel.set({
        standupCron: settings.standupCron,
        reminderCron: settings.reminderCron,
        recoveryCron: settings.recoveryCron,
        timezone: settings.timezone,
        gitAuthor: settings.gitAuthor,
        gitSincePeriod: settings.gitSincePeriod,
        selectedRepos: settings.selectedRepos,
        active: settings.active,
      })
      this.loading.set(false)
    } catch {
      this.loading.set(false)
      this.loadError.set(true)
    }
  }
}
```

**Verify:** `cd apps/web && npx ng test --watch=false` (will fail until spec is updated — that's expected)
**Commit:** `feat(web): wire settings page to SettingsService API with loading/error/save states`

---

## Batch 2: Spec Rewrite (1 implementer)

### Task 2.1: Rewrite SettingsPage spec for real service integration
**File:** `apps/web/src/app/pages/settings/settings-page.spec.ts`
**Test:** self (this IS the test file)
**Depends:** 1.1

**Context for implementer:**
- The SettingsPage (from Task 1.1) now uses `SettingsService` which makes HTTP calls via `HttpClient`.
- On construction, the page calls `loadSettings()` → `GET /api/settings/me` and `loadRepos()` → `GET /api/repos` in parallel.
- Save calls `saveSettings()` → `PUT /api/settings/me`.
- Follow the `dashboard-page.spec.ts` pattern: use `provideHttpClient()` + `provideHttpClientTesting()` + `HttpTestingController` + `ApplicationRef`.
- Pattern for flushing: `TestBed.tick()` triggers pending requests, `httpMock.expectOne(url).flush(data)` responds, `await appRef.whenStable()` waits for async, `fixture.detectChanges()` updates DOM.
- The page fires 2 GET requests on init (settings + repos). Tests must flush both.
- Use Vitest (`describe`, `it`, `expect`, `vi` from `'vitest'`), NOT Jasmine.
- The component is standalone — import it directly in `TestBed.configureTestingModule({ imports: [SettingsPage] })`.

**Mock data factories:**

```typescript
import { provideHttpClient } from '@angular/common/http'
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing'
import { ApplicationRef } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { provideRouter } from '@angular/router'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { SettingsPage } from './settings-page'

function buildMockSettings() {
  return {
    standupCron: '30 17 * * 1-5',
    reminderCron: '20 17 * * 1-5',
    recoveryCron: '0 18 * * 1-5',
    timezone: 'america/sao_paulo',
    gitAuthor: 'nitoba',
    gitSincePeriod: '16 hours ago',
    selectedRepos: ['agrotrace-web', 'agrotrace-api'],
    active: true,
    snoozedUntil: null,
    cancelledDate: null,
  }
}

function buildMockRepos() {
  return [
    { id: 'r1', name: 'agrotrace-web', project: 'AGROTRACE' },
    { id: 'r2', name: 'agrotrace-api', project: 'AGROTRACE' },
    { id: 'r3', name: 'agrotrace-mobile', project: 'AGROTRACE' },
  ]
}

describe('SettingsPage', () => {
  let httpMock: HttpTestingController
  let appRef: ApplicationRef

  async function renderPage() {
    await TestBed.configureTestingModule({
      imports: [SettingsPage],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    }).compileComponents()

    httpMock = TestBed.inject(HttpTestingController)
    appRef = TestBed.inject(ApplicationRef)

    const fixture = TestBed.createComponent(SettingsPage)
    fixture.detectChanges()
    return fixture
  }

  function flushInitialLoad() {
    TestBed.tick()
    httpMock
      .expectOne('/api/settings/me')
      .flush({ data: buildMockSettings() })
    httpMock.expectOne('/api/repos').flush({ data: buildMockRepos() })
  }

  async function renderAndLoad() {
    const fixture = await renderPage()
    flushInitialLoad()
    await appRef.whenStable()
    fixture.detectChanges()
    return fixture
  }

  afterEach(() => {
    httpMock.verify()
  })

  it('shows loading state while fetching settings', async () => {
    const fixture = await renderPage()
    const el = fixture.nativeElement as HTMLElement

    expect(el.textContent).toContain('// loading settings...')
    expect(el.querySelector('form')).toBeNull()

    // Flush to avoid httpMock.verify() failures
    flushInitialLoad()
    await appRef.whenStable()
  })

  it('populates form with API data after load', async () => {
    const fixture = await renderAndLoad()
    const el = fixture.nativeElement as HTMLElement

    expect(el.textContent).not.toContain('// loading settings...')
    expect(el.querySelector('form')).toBeTruthy()

    const standupCron = el.querySelector<HTMLInputElement>('#standup-cron')
    const reminderCron = el.querySelector<HTMLInputElement>('#reminder-cron')
    const recoveryCron = el.querySelector<HTMLInputElement>('#recovery-cron')
    const timezone = el.querySelector<HTMLInputElement>('#timezone')
    const gitAuthor = el.querySelector<HTMLInputElement>('#git-author')
    const gitSince = el.querySelector<HTMLInputElement>('#git-since-period')

    expect(standupCron?.value).toBe('30 17 * * 1-5')
    expect(reminderCron?.value).toBe('20 17 * * 1-5')
    expect(recoveryCron?.value).toBe('0 18 * * 1-5')
    expect(timezone?.value).toBe('america/sao_paulo')
    expect(gitAuthor?.value).toBe('nitoba')
    expect(gitSince?.value).toBe('16 hours ago')
  })

  it('shows available repos as checkboxes with correct selection', async () => {
    const fixture = await renderAndLoad()
    const el = fixture.nativeElement as HTMLElement

    const checkboxes = Array.from(
      el.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'),
    )
    expect(checkboxes).toHaveLength(3)

    // agrotrace-web and agrotrace-api are selected, agrotrace-mobile is not
    expect(checkboxes[0]!.checked).toBe(true) // agrotrace-web
    expect(checkboxes[1]!.checked).toBe(true) // agrotrace-api
    expect(checkboxes[2]!.checked).toBe(false) // agrotrace-mobile
  })

  it('toggles repo selection on checkbox click', async () => {
    const fixture = await renderAndLoad()
    const el = fixture.nativeElement as HTMLElement

    const checkboxes = Array.from(
      el.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'),
    )

    // Click the unchecked one (agrotrace-mobile)
    checkboxes[2]!.click()
    fixture.detectChanges()

    expect(fixture.componentInstance.settingsModel().selectedRepos).toContain(
      'agrotrace-mobile',
    )
    expect(
      fixture.componentInstance.settingsModel().selectedRepos,
    ).toHaveLength(3)

    // Click a checked one to uncheck (agrotrace-web)
    checkboxes[0]!.click()
    fixture.detectChanges()

    expect(
      fixture.componentInstance.settingsModel().selectedRepos,
    ).not.toContain('agrotrace-web')
    expect(
      fixture.componentInstance.settingsModel().selectedRepos,
    ).toHaveLength(2)
  })

  it('shows active toggle with correct state from API', async () => {
    const fixture = await renderAndLoad()
    const el = fixture.nativeElement as HTMLElement

    const toggle = el.querySelector<HTMLButtonElement>('[role="switch"]')!
    expect(toggle.getAttribute('aria-checked')).toBe('true')

    toggle.click()
    fixture.detectChanges()

    expect(fixture.componentInstance.settingsModel().active).toBe(false)
    expect(toggle.getAttribute('aria-checked')).toBe('false')
  })

  it('saves settings through the API and shows success feedback', async () => {
    vi.useFakeTimers()

    const fixture = await renderAndLoad()
    const el = fixture.nativeElement as HTMLElement

    const submitBtn = el.querySelector<HTMLButtonElement>(
      'button[type="submit"]',
    )!
    submitBtn.click()
    fixture.detectChanges()

    // Button should show saving state
    expect(submitBtn.textContent).toContain('$ saving...')
    expect(submitBtn.disabled).toBe(true)

    // Flush the PUT request
    TestBed.tick()
    const putReq = httpMock.expectOne('/api/settings/me')
    expect(putReq.request.method).toBe('PUT')
    expect(putReq.request.body).toEqual({
      standupCron: '30 17 * * 1-5',
      reminderCron: '20 17 * * 1-5',
      recoveryCron: '0 18 * * 1-5',
      timezone: 'america/sao_paulo',
      gitAuthor: 'nitoba',
      gitSincePeriod: '16 hours ago',
      selectedRepos: ['agrotrace-web', 'agrotrace-api'],
      active: true,
    })
    putReq.flush({ data: buildMockSettings() })
    await appRef.whenStable()
    fixture.detectChanges()

    // Should show success feedback
    expect(el.textContent).toContain('// settings saved')
    expect(submitBtn.disabled).toBe(false)
    expect(submitBtn.textContent).toContain('$ save_settings')

    // Feedback disappears after 3 seconds
    vi.advanceTimersByTime(3000)
    fixture.detectChanges()
    expect(el.textContent).not.toContain('// settings saved')

    vi.useRealTimers()
  })

  it('shows error state when load fails and allows retry', async () => {
    const fixture = await renderPage()

    TestBed.tick()
    httpMock
      .expectOne('/api/settings/me')
      .flush('Server Error', { status: 500, statusText: 'Internal Server Error' })
    httpMock
      .expectOne('/api/repos')
      .flush('Server Error', { status: 500, statusText: 'Internal Server Error' })
    await appRef.whenStable()
    fixture.detectChanges()

    const el = fixture.nativeElement as HTMLElement
    expect(el.textContent).toContain('// failed to load settings')
    expect(el.querySelector('form')).toBeNull()

    // Click retry
    const retryBtn = Array.from(el.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('retry'),
    )!
    expect(retryBtn).toBeTruthy()
    retryBtn.click()
    fixture.detectChanges()

    // Should show loading again
    expect(el.textContent).toContain('// loading settings...')

    // Flush retry requests
    TestBed.tick()
    httpMock
      .expectOne('/api/settings/me')
      .flush({ data: buildMockSettings() })
    httpMock.expectOne('/api/repos').flush({ data: buildMockRepos() })
    await appRef.whenStable()
    fixture.detectChanges()

    // Should now show the form
    expect(el.querySelector('form')).toBeTruthy()
    expect(el.textContent).not.toContain('// failed to load settings')
  })

  it('shows save error feedback when PUT fails', async () => {
    const fixture = await renderAndLoad()
    const el = fixture.nativeElement as HTMLElement

    const submitBtn = el.querySelector<HTMLButtonElement>(
      'button[type="submit"]',
    )!
    submitBtn.click()
    fixture.detectChanges()

    TestBed.tick()
    httpMock
      .expectOne('/api/settings/me')
      .flush('Server Error', { status: 500, statusText: 'Internal Server Error' })
    await appRef.whenStable()
    fixture.detectChanges()

    expect(el.textContent).toContain('// failed to save settings')
    expect(submitBtn.disabled).toBe(false)
  })

  it('does not render discordDmPreview toggle or danger zone', async () => {
    const fixture = await renderAndLoad()
    const el = fixture.nativeElement as HTMLElement

    expect(el.textContent).not.toContain('discord_dm_preview')
    expect(el.textContent).not.toContain('danger_zone')
    expect(el.textContent).not.toContain('delete_all_standups')

    // Only one toggle (active)
    const switches = Array.from(el.querySelectorAll('[role="switch"]'))
    expect(switches).toHaveLength(1)
  })
})
```

**Verify:** `cd apps/web && npx ng test --watch=false`
**Commit:** `test(web): rewrite settings page spec for real API integration`

---

## Implementation Notes

### Design decisions made by planner

1. **`selectedRepos` managed outside Signal Forms validation** — The `selectedRepos` field is an array managed via `settingsModel.update()` on checkbox toggle, not via `[formField]` binding. Signal Forms `FormField` directive works with `<input>` elements for scalar values. Checkboxes for array selection are handled imperatively. The form validation only covers the 6 text fields. This is intentional — there's no "required at least one repo" validation in the backend contract.

2. **`active` toggle managed outside Signal Forms** — Same reasoning. It's a boolean toggled via `settingsModel.update()`, not a text input. The toggle button reads from `settingsModel().active` directly.

3. **Constructor-based loading (not `afterNextRender`)** — The `loadData()` call happens in the constructor. This is fine because it's an async call that sets signals — it doesn't touch the DOM. The `afterNextRender` pattern is for DOM manipulation. The dashboard page follows the same pattern (service loads data on injection, not on render).

4. **`flushInitialLoad()` helper in tests** — Since the page fires 2 parallel GET requests on init, every test needs to either flush both or handle the error case. The helper encapsulates this. Note: `httpMock.expectOne()` order may vary since `Promise.all` doesn't guarantee request order — but `HttpTestingController.expectOne(url)` matches by URL regardless of order.

5. **Save feedback auto-clear with `setTimeout`** — The success message clears after 3 seconds. Tests that verify this use `vi.useFakeTimers()` + `vi.advanceTimersByTime(3000)`. Error feedback does NOT auto-clear — it stays until the next save attempt.

6. **No `addRepo()`/`removeRepo()` methods** — Repos are now a fixed list from the API. Users toggle selection, they don't add/remove repo entries.

7. **Section renamed from "notifications" to "automation"** — The old section had 2 toggles (active + discordDmPreview). Now it has just 1 toggle (active). "automation" better describes the single toggle's purpose.
