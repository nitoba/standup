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
