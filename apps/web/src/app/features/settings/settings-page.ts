import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core'
import { FormField, form, required, submit } from '@angular/forms/signals'
import { toast } from 'ngx-sonner'
import { SidebarLayout } from '../../core/layout/sidebar'
import { ZardButtonComponent } from '../../shared/components/button'
import { ZardCheckboxComponent } from '../../shared/components/checkbox'
import {
  ZardComboboxComponent,
  type ZardComboboxOption,
} from '../../shared/components/combobox'
import { ZardInputDirective } from '../../shared/components/input'
import { ZardSwitchComponent } from '../../shared/components/switch'
import { SettingsSkeleton } from './components/settings-skeleton/settings-skeleton'
import {
  type RepoOption,
  type SaveSettingsInput,
  SettingsService,
} from './services/settings-service'

@Component({
  selector: 'app-settings-page',
  imports: [
    SidebarLayout,
    FormField,
    ZardButtonComponent,
    ZardComboboxComponent,
    ZardCheckboxComponent,
    ZardInputDirective,
    ZardSwitchComponent,
    SettingsSkeleton,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-sidebar-layout>
      <section
        class="bg-background text-foreground p-[20px] md:p-[40px] flex flex-col gap-[28px] md:gap-[40px]"
      >
        <div class="flex flex-col gap-[8px]">
          <div class="flex items-center gap-[12px]">
            <span
              class="text-primary font-[var(--font-jetbrains)] text-[28px] font-bold"
              >></span
            >
            <span
              class="text-foreground font-[var(--font-jetbrains)] text-[28px] font-bold"
              >settings</span
            >
          </div>
          <div
            class="text-muted-foreground font-[var(--font-ibm)] text-[14px]"
          >
            // configure your standup automation preferences
          </div>
        </div>

        @if (loading()) {
          <app-settings-skeleton />
        } @else if (loadError()) {
          <div class="flex flex-col gap-[12px]">
            <div
              class="text-[var(--accent-red)] font-[var(--font-ibm)] text-[13px]"
            >
              // failed to load settings
            </div>
            <button
              type="button"
              z-button
              zType="outline"
              zSize="sm"
              class="w-fit"
              (click)="retryLoad()"
            >
              $ retry
            </button>
          </div>
        } @else {
          <form (submit)="onSubmit($event)" class="flex flex-col gap-[32px]">
            <!-- Schedule section -->
            <div
              class="border border-border bg-card p-[16px] md:p-[24px] flex flex-col gap-[16px]"
            >
              <div class="flex items-center gap-[8px]">
                <span
                  class="text-muted-foreground/70 font-[var(--font-jetbrains)] text-[14px]"
                  >//</span
                >
                <span
                  class="text-card-foreground font-[var(--font-jetbrains)] text-[14px] font-medium"
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
                        class="text-muted-foreground font-[var(--font-jetbrains)] text-[12px]"
                      >standup_cron</label
                    >
                    <input
                      id="standup-cron"
                      type="text"
                      z-input
                      [formField]="settingsForm.standupCron"
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
                        class="text-muted-foreground font-[var(--font-jetbrains)] text-[12px]"
                      >reminder_cron</label
                    >
                    <input
                      id="reminder-cron"
                      type="text"
                      z-input
                      [formField]="settingsForm.reminderCron"
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
                        class="text-muted-foreground font-[var(--font-jetbrains)] text-[12px]"
                      >recovery_cron</label
                    >
                    <input
                      id="recovery-cron"
                      type="text"
                      z-input
                      [formField]="settingsForm.recoveryCron"
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
                        class="text-muted-foreground font-[var(--font-jetbrains)] text-[12px]"
                      >timezone</label
                    >
                    <z-combobox
                      id="timezone"
                      zWidth="full"
                      placeholder="select timezone"
                      searchPlaceholder="search timezone..."
                      [options]="timezoneOptions()"
                      [value]="settingsModel().timezone"
                      [ariaLabel]="'timezone'"
                      (zValueChange)="onTimezoneChange($event)"
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
              class="border border-border bg-card p-[16px] md:p-[24px] flex flex-col gap-[16px]"
            >
              <div class="flex items-center gap-[8px]">
                <span
                  class="text-muted-foreground/70 font-[var(--font-jetbrains)] text-[14px]"
                  >//</span
                >
                <span
                  class="text-card-foreground font-[var(--font-jetbrains)] text-[14px] font-medium"
                  >git_configuration</span
                >
              </div>
              <div
                class="grid grid-cols-1 md:grid-cols-2 gap-[16px] md:gap-[24px]"
              >
                <div class="flex flex-col gap-[6px]">
                  <label
                    for="git-author"
                    class="text-muted-foreground font-[var(--font-jetbrains)] text-[12px]"
                    >git_author</label
                  >
                  <input
                    id="git-author"
                    type="text"
                    z-input
                    [formField]="settingsForm.gitAuthor"
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
              </div>
            </div>

            <!-- Selected repositories section -->
            <div
              class="border border-border bg-card p-[16px] md:p-[24px] flex flex-col gap-[16px]"
            >
              <div class="flex items-center gap-[8px]">
                <span
                  class="text-muted-foreground/70 font-[var(--font-jetbrains)] text-[14px]"
                  >//</span
                >
                <span
                  class="text-card-foreground font-[var(--font-jetbrains)] text-[14px] font-medium"
                  >selected_repositories</span
                >
              </div>

              @if (availableRepos().length === 0) {
                <div
                  class="text-muted-foreground/70 font-[var(--font-ibm)] text-[12px] py-[8px]"
                >
                  // no repositories available
                </div>
              } @else {
                <div class="grid grid-cols-1 md:grid-cols-2 gap-[16px]">
                  @for (group of reposByProject(); track group.project) {
                    <div class="flex flex-col gap-[8px]">
                      <div class="flex items-center gap-[6px] pb-[4px] border-b border-border">
                        <span class="text-[var(--accent-green)] font-[var(--font-jetbrains)] text-[11px]">~/</span>
                        <span class="text-muted-foreground font-[var(--font-jetbrains)] text-[11px] uppercase tracking-wider">
                          {{ group.project }}
                        </span>
                        <span class="text-muted-foreground/50 font-[var(--font-ibm)] text-[10px] ml-auto">
                          {{ group.repos.length }} repos
                        </span>
                      </div>
                      <div class="flex flex-col gap-[4px] max-h-[480px] overflow-y-auto pr-[2px]">
                        @for (repo of group.repos; track repo.id) {
                          <z-checkbox
                            zSize="lg"
                            [zChecked]="isRepoSelected(repo.name)"
                            (zCheckedChange)="onRepoCheckedChange(repo.name, $event)"
                            class="border border-border px-[12px] py-[10px] transition-colors duration-150 hover:bg-accent/30"
                          >
                            <span class="font-[var(--font-jetbrains)] text-[13px] text-foreground flex-1 truncate">
                              {{ repo.name }}
                            </span>
                          </z-checkbox>
                        }
                      </div>
                    </div>
                  }
                </div>
              }
            </div>

            <!-- Automation section -->
            <div
              class="border border-border bg-card p-[16px] md:p-[24px] flex flex-col gap-[16px]"
            >
              <div class="flex items-center gap-[8px]">
                <span
                  class="text-muted-foreground/70 font-[var(--font-jetbrains)] text-[14px]"
                  >//</span
                >
                <span
                  class="text-card-foreground font-[var(--font-jetbrains)] text-[14px] font-medium"
                  >automation</span
                >
              </div>
              <div class="flex items-center justify-between">
                <div class="flex flex-col gap-[2px]">
                  <span
                    class="text-foreground font-[var(--font-jetbrains)] text-[13px]"
                    >active</span
                  >
                  <span
                    class="text-muted-foreground font-[var(--font-ibm)] text-[12px]"
                    >enable automatic standup generation</span
                  >
                </div>
                <z-switch
                  aria-label="Toggle active"
                  [zChecked]="settingsModel().active"
                  (zCheckedChange)="onActiveChange($event)"
                />
              </div>
            </div>

            <!-- Email digest section -->
            <div
              class="border border-border bg-card p-[16px] md:p-[24px] flex flex-col gap-[16px]"
            >
              <div class="flex items-center gap-[8px]">
                <span
                  class="text-muted-foreground/70 font-[var(--font-jetbrains)] text-[14px]"
                  >//</span
                >
                <span
                  class="text-card-foreground font-[var(--font-jetbrains)] text-[14px] font-medium"
                  >email_digest</span
                >
              </div>
              <div class="flex items-center justify-between gap-[16px]">
                <div class="flex flex-col gap-[2px]">
                  <span
                    class="text-foreground font-[var(--font-jetbrains)] text-[13px]"
                    >email_theme</span
                  >
                  <span
                    class="text-muted-foreground font-[var(--font-ibm)] text-[12px]"
                    >visual theme for weekly digest emails</span
                  >
                </div>
                <div class="flex items-center" role="group" aria-label="Email theme">
                  <button
                    type="button"
                    class="px-[14px] py-[7px] font-[var(--font-jetbrains)] text-[12px] border transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    [class]="settingsModel().emailTheme === 'dark'
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border text-muted-foreground hover:text-foreground hover:border-foreground/40'"
                    [attr.aria-pressed]="settingsModel().emailTheme === 'dark'"
                    (click)="onEmailThemeChange('dark')"
                  >dark</button>
                  <button
                    type="button"
                    class="px-[14px] py-[7px] font-[var(--font-jetbrains)] text-[12px] border-y border-r transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    [class]="settingsModel().emailTheme === 'light'
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border text-muted-foreground hover:text-foreground hover:border-foreground/40'"
                    [attr.aria-pressed]="settingsModel().emailTheme === 'light'"
                    (click)="onEmailThemeChange('light')"
                  >light</button>
                </div>
              </div>
            </div>

            <div class="flex flex-col gap-[12px] items-end">
              <button
                type="submit"
                z-button
                zType="default"
                zFull
                class="w-full md:w-auto"
                [zDisabled]="settingsForm().invalid() || saving()"
              >
                {{ saving() ? '$ saving...' : '$ save_settings' }}
              </button>
            </div>
          </form>
        }
      </section>
    </app-sidebar-layout>
  `,
})
export class SettingsPage {
  private readonly settingsService = inject(SettingsService)
  private readonly fallbackTimezoneOptions = [
    'America/Sao_Paulo',
    'UTC',
    'America/New_York',
    'Europe/London',
  ]

  readonly loading = signal(true)
  readonly loadError = signal(false)
  readonly saving = signal(false)

  readonly settingsModel = signal<SaveSettingsInput>({
    standupCron: '',
    reminderCron: '',
    recoveryCron: '',
    timezone: '',
    gitAuthor: '',
    selectedRepos: [],
    active: false,
    emailTheme: 'dark',
  })

  readonly availableRepos = computed<RepoOption[]>(() =>
    this.settingsService.repos(),
  )

  readonly reposByProject = computed<
    { project: string; repos: RepoOption[] }[]
  >(() => {
    const grouped = new Map<string, RepoOption[]>()
    for (const repo of this.availableRepos()) {
      const list = grouped.get(repo.project) ?? []
      list.push(repo)
      grouped.set(repo.project, list)
    }
    return Array.from(grouped.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([project, repos]) => ({ project, repos }))
  })

  readonly timezoneOptions = computed<ZardComboboxOption[]>(() => {
    const supportedValuesOf = Intl.supportedValuesOf as
      | ((key: 'timeZone') => string[])
      | undefined
    const supported = supportedValuesOf?.('timeZone') ?? []
    const values = new Set([
      ...this.fallbackTimezoneOptions,
      ...supported,
      this.settingsModel().timezone,
    ])

    return Array.from(values)
      .filter((value) => value.length > 0)
      .sort((left, right) => left.localeCompare(right))
      .map((value) => ({ value, label: value }))
  })

  readonly settingsForm = form(this.settingsModel, (s) => {
    required(s.standupCron, { message: 'cron expression is required' })
    required(s.reminderCron, { message: 'cron expression is required' })
    required(s.recoveryCron, { message: 'cron expression is required' })
    required(s.timezone, { message: 'timezone is required' })
    required(s.gitAuthor, { message: 'git author is required' })
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

  onRepoCheckedChange(repoName: string, checked: boolean) {
    this.settingsModel.update((model) => {
      const selectedRepos = checked
        ? Array.from(new Set([...model.selectedRepos, repoName]))
        : model.selectedRepos.filter((value) => value !== repoName)

      return { ...model, selectedRepos }
    })
  }

  onActiveChange(active: boolean) {
    this.settingsModel.update((m) => ({ ...m, active }))
  }

  onEmailThemeChange(emailTheme: 'light' | 'dark') {
    this.settingsModel.update((m) => ({ ...m, emailTheme }))
  }

  onTimezoneChange(timezone: string | null) {
    this.settingsModel.update((model) => ({
      ...model,
      timezone: timezone ?? '',
    }))
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
      try {
        await this.settingsService.saveSettings(this.settingsModel())
        toast.success('Settings salvas')
      } catch {
        toast.error('Falha ao salvar settings')
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
        selectedRepos: settings.selectedRepos,
        active: settings.active,
        emailTheme: settings.emailTheme,
      })
      this.loading.set(false)
    } catch {
      this.loading.set(false)
      this.loadError.set(true)
    }
  }
}
