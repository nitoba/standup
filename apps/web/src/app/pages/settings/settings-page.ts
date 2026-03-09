import { ChangeDetectionStrategy, Component, signal } from '@angular/core'
import { FormField, form, required, submit } from '@angular/forms/signals'

import { SidebarLayout } from '../../layout/sidebar'

interface SettingsModel {
  standupCron: string
  reminderCron: string
  recoveryCron: string
  timezone: string
  gitAuthor: string
  gitSincePeriod: string
  repos: string[]
  notifications: {
    active: boolean
    discordDmPreview: boolean
  }
}

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
              <div class="grid grid-cols-1 md:grid-cols-2 gap-[16px] md:gap-[24px]">
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
                  @if (settingsForm.standupCron().touched() && settingsForm.standupCron().invalid()) {
                    <span class="text-[var(--accent-red)] font-[var(--font-ibm)] text-[11px]">
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
                  @if (settingsForm.reminderCron().touched() && settingsForm.reminderCron().invalid()) {
                    <span class="text-[var(--accent-red)] font-[var(--font-ibm)] text-[11px]">
                      {{ settingsForm.reminderCron().errors()[0]?.message }}
                    </span>
                  }
                </div>
              </div>
              <div class="grid grid-cols-1 md:grid-cols-2 gap-[16px] md:gap-[24px]">
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
                  @if (settingsForm.recoveryCron().touched() && settingsForm.recoveryCron().invalid()) {
                    <span class="text-[var(--accent-red)] font-[var(--font-ibm)] text-[11px]">
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
                  @if (settingsForm.timezone().touched() && settingsForm.timezone().invalid()) {
                    <span class="text-[var(--accent-red)] font-[var(--font-ibm)] text-[11px]">
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
            <div class="grid grid-cols-1 md:grid-cols-2 gap-[16px] md:gap-[24px]">
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
                @if (settingsForm.gitAuthor().touched() && settingsForm.gitAuthor().invalid()) {
                  <span class="text-[var(--accent-red)] font-[var(--font-ibm)] text-[11px]">
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
                @if (settingsForm.gitSincePeriod().touched() && settingsForm.gitSincePeriod().invalid()) {
                  <span class="text-[var(--accent-red)] font-[var(--font-ibm)] text-[11px]">
                    {{ settingsForm.gitSincePeriod().errors()[0]?.message }}
                  </span>
                }
              </div>
            </div>
          </div>

          <!-- Repositories section -->
          <div
            class="border border-[var(--border)] p-[16px] md:p-[24px] flex flex-col gap-[16px]"
          >
            <div class="flex items-center justify-between">
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
              <button
                type="button"
                class="border border-[var(--border)] px-[12px] py-[6px] font-[var(--font-jetbrains)] text-[12px] text-[var(--text-secondary)] cursor-pointer transition-colors duration-150 hover:border-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface)]"
                (click)="addRepo()"
              >
                $ add_repo
              </button>
            </div>
            <div class="flex flex-col gap-[4px]">
              @for (repoField of settingsForm.repos; track $index; let i = $index) {
                <div
                  class="border border-[var(--border)] px-[12px] py-[10px] flex items-center justify-between"
                >
                  <div class="flex items-center gap-[8px] flex-1">
                    <span class="text-[var(--accent-green)] font-[var(--font-jetbrains)] text-[13px]">~/</span>
                    <input
                      type="text"
                      [formField]="repoField"
                      class="flex-1 bg-transparent font-[var(--font-jetbrains)] text-[13px] text-[var(--accent-green)] outline-none"
                      [attr.aria-label]="'Repository ' + (i + 1)"
                    />
                  </div>
                  <button
                    type="button"
                    class="text-[var(--text-tertiary)] font-[var(--font-jetbrains)] text-[12px] cursor-pointer transition-colors duration-150 hover:text-[var(--accent-red)]"
                    [attr.aria-label]="'Remove repository ' + repoField().value()"
                    (click)="removeRepo(i)"
                  >
                    [x]
                  </button>
                </div>
              }
            </div>
          </div>

          <!-- Notifications section -->
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
                >notifications</span
              >
            </div>
            <div class="flex flex-col gap-[16px]">
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
                  [attr.aria-checked]="settingsModel().notifications.active"
                  [class]="
                    settingsModel().notifications.active
                      ? 'w-[40px] h-[22px] rounded-full px-[3px] flex items-center justify-end bg-[var(--accent-green)] cursor-pointer transition-colors duration-150'
                      : 'w-[40px] h-[22px] rounded-full px-[3px] flex items-center justify-start bg-[var(--border)] cursor-pointer transition-colors duration-150'
                  "
                  (click)="toggleNotification('active')"
                >
                  <span class="h-[16px] w-[16px] rounded-full bg-white"></span>
                </button>
              </div>

              <div class="flex items-center justify-between">
                <div class="flex flex-col gap-[2px]">
                  <span
                    class="text-[var(--text-primary)] font-[var(--font-jetbrains)] text-[13px]"
                    >discord_dm_preview</span
                  >
                  <span
                    class="text-[var(--text-secondary)] font-[var(--font-ibm)] text-[12px]"
                    >receive dm with standup preview before publishing</span
                  >
                </div>
                <button
                  type="button"
                  class="w-[40px] h-[22px] rounded-full px-[3px] flex items-center cursor-pointer transition-colors duration-150"
                  aria-label="Toggle discord_dm_preview"
                  role="switch"
                  [attr.aria-checked]="settingsModel().notifications.discordDmPreview"
                  [class]="
                    settingsModel().notifications.discordDmPreview
                      ? 'w-[40px] h-[22px] rounded-full px-[3px] flex items-center justify-end bg-[var(--accent-green)] cursor-pointer transition-colors duration-150'
                      : 'w-[40px] h-[22px] rounded-full px-[3px] flex items-center justify-start bg-[var(--border)] cursor-pointer transition-colors duration-150'
                  "
                  (click)="toggleNotification('discordDmPreview')"
                >
                  <span class="h-[16px] w-[16px] rounded-full bg-white"></span>
                </button>
              </div>
            </div>
          </div>

          <!-- Save button -->
          <div class="flex items-center justify-end">
            <button
              type="submit"
              class="w-full md:w-auto h-[44px] md:h-auto bg-[var(--accent-green)] px-[24px] py-[10px] text-[#0A0A0A] font-[var(--font-jetbrains)] text-[12px] font-medium cursor-pointer transition-all duration-150 hover:brightness-110 hover:shadow-[0_0_12px_var(--accent-green)] active:brightness-90"
              [class.opacity-50]="settingsForm().invalid()"
              [class.cursor-not-allowed]="settingsForm().invalid()"
            >
              $ save_settings
            </button>
          </div>

          <!-- Danger zone -->
          <div
            class="border border-[color:rgb(239_68_68_/_0.4)] p-[16px] md:p-[24px] flex flex-col gap-[16px]"
          >
            <div class="flex items-center gap-[8px]">
              <span
                class="text-[var(--accent-red)] font-[var(--font-jetbrains)] text-[14px]"
                >[!]</span
              >
              <span
                class="text-[var(--accent-red)] font-[var(--font-jetbrains)] text-[14px] font-medium"
                >danger_zone</span
              >
            </div>
            <div class="flex flex-col md:flex-row items-start md:items-center justify-between gap-[12px] md:gap-0">
              <div class="flex flex-col gap-[2px]">
                <span
                  class="text-[var(--text-primary)] font-[var(--font-jetbrains)] text-[13px]"
                  >delete_all_standups</span
                >
                <span
                  class="text-[var(--text-secondary)] font-[var(--font-ibm)] text-[12px]"
                  >permanently remove all standup history from database</span
                >
              </div>
              <button
                type="button"
                class="w-full md:w-auto h-[44px] md:h-auto border border-[var(--accent-red)] px-[16px] py-[8px] text-[var(--accent-red)] font-[var(--font-jetbrains)] text-[12px] cursor-pointer transition-all duration-150 hover:bg-[var(--accent-red)] hover:text-[var(--bg-page)] active:brightness-90 shrink-0"
              >
                $ delete_all
              </button>
            </div>
          </div>
        </form>
      </section>
    </app-sidebar-layout>
  `,
})
export class SettingsPage {
  readonly settingsModel = signal<SettingsModel>({
    standupCron: '30 17 * * 1-5',
    reminderCron: '20 17 * * 1-5',
    recoveryCron: '0 18 * * 1-5',
    timezone: 'america/sao_paulo',
    gitAuthor: 'nitoba',
    gitSincePeriod: '16 hours ago',
    repos: ['agrotrace-web', 'agrotrace-api', 'agrotrace-mobile'],
    notifications: {
      active: true,
      discordDmPreview: true,
    },
  })

  readonly settingsForm = form(this.settingsModel, (s) => {
    required(s.standupCron, { message: 'cron expression is required' })
    required(s.reminderCron, { message: 'cron expression is required' })
    required(s.recoveryCron, { message: 'cron expression is required' })
    required(s.timezone, { message: 'timezone is required' })
    required(s.gitAuthor, { message: 'git author is required' })
    required(s.gitSincePeriod, { message: 'git since period is required' })
  })

  toggleNotification(key: 'active' | 'discordDmPreview') {
    this.settingsModel.update((m) => ({
      ...m,
      notifications: {
        ...m.notifications,
        [key]: !m.notifications[key],
      },
    }))
  }

  addRepo() {
    this.settingsModel.update((m) => ({
      ...m,
      repos: [...m.repos, ''],
    }))
  }

  removeRepo(index: number) {
    this.settingsModel.update((m) => ({
      ...m,
      repos: m.repos.filter((_, i) => i !== index),
    }))
  }

  onSubmit(event: Event) {
    event.preventDefault()
    submit(this.settingsForm, async (_field, _detail) => {
      const data = this.settingsModel()
      // TODO: POST to API when backend is wired
      console.info('Settings saved:', data)
    })
  }
}
