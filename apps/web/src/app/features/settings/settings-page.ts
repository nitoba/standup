import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core'
import { form, required, submit } from '@angular/forms/signals'
import { toast } from 'ngx-sonner'
import { SidebarLayout } from '../../core/layout/sidebar'
import { ZardButtonComponent } from '../../shared/components/button'
import type { ZardComboboxOption } from '../../shared/components/combobox'
import { AutomationSection } from './components/automation-section/automation-section'
import { EmailDigestSection } from './components/email-digest-section/email-digest-section'
import { GitConfigSection } from './components/git-config-section/git-config-section'
import { RepoSelector } from './components/repo-selector/repo-selector'
import { ScheduleSection } from './components/schedule-section/schedule-section'
import { type CronFieldKey } from './components/schedule-section/types'
import { SettingsSkeleton } from './components/settings-skeleton/settings-skeleton'
import {
  type RepoOption,
  type SaveSettingsInput,
  SettingsService,
} from './services/settings-service'

const DEFAULT_CRON_POPOVER_STATE: Record<CronFieldKey, boolean> = {
  standupCron: false,
  reminderCron: false,
  recoveryCron: false,
}

@Component({
  selector: 'app-settings-page',
  imports: [
    SidebarLayout,
    ZardButtonComponent,
    SettingsSkeleton,
    AutomationSection,
    EmailDigestSection,
    GitConfigSection,
    RepoSelector,
    ScheduleSection,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-sidebar-layout>
      <section
        class="bg-background text-foreground p-[20px] md:p-[40px] flex flex-col gap-[28px] md:gap-[40px]"
      >
        <div class="flex flex-col gap-[8px]">
          <div class="flex items-center gap-[12px]">
            <span class="text-primary font-[var(--font-jetbrains)] text-[28px] font-bold">></span>
            <span class="text-foreground font-[var(--font-jetbrains)] text-[28px] font-bold"
              >configurações</span
            >
          </div>
          <div class="text-muted-foreground font-[var(--font-ibm)] text-[14px]">
            // configure suas preferências de automação de standup
          </div>
        </div>

        @if (loading()) {
          <app-settings-skeleton />
        } @else if (loadError()) {
          <div class="flex flex-col gap-[12px]">
            <div class="text-[var(--accent-red)] font-[var(--font-ibm)] text-[13px]">
              // falha ao carregar configurações
            </div>
            <button
              type="button"
              z-button
              zType="outline"
              zSize="sm"
              class="w-fit"
              (click)="retryLoad()"
            >
              $ tentar novamente
            </button>
          </div>
        } @else {
          <form (submit)="onSubmit($event)" class="flex flex-col gap-[32px]">
            <!-- Schedule section -->
            <div class="border border-border bg-card p-[16px] md:p-[24px] flex flex-col gap-[16px]">
              <div class="flex items-center gap-[8px]">
                <span class="text-muted-foreground/70 font-[var(--font-jetbrains)] text-[14px]">//</span>
                <span class="text-card-foreground font-[var(--font-jetbrains)] text-[14px] font-medium">agendamento</span>
              </div>
              <app-schedule-section
                [standupCron]="settingsModel().standupCron"
                [reminderCron]="settingsModel().reminderCron"
                [recoveryCron]="settingsModel().recoveryCron"
                [timezone]="settingsModel().timezone"
                [timezoneOptions]="timezoneOptions()"
                [popoverVisibility]="cronPopoverVisibility()"
                [standupCronField]="settingsForm.standupCron()"
                [reminderCronField]="settingsForm.reminderCron()"
                [recoveryCronField]="settingsForm.recoveryCron()"
                [timezoneField]="settingsForm.timezone()"
                (standupCronChange)="onStandupCronChange($event)"
                (reminderCronChange)="onReminderCronChange($event)"
                (recoveryCronChange)="onRecoveryCronChange($event)"
                (timezoneChange)="onTimezoneChange($event)"
                (popoverVisibilityChange)="onCronPopoverVisibilityChange($event)"
                (cronBuilderApply)="onCronBuilderApply($event.field, $event.value)"
                (cronBuilderCancel)="onCronBuilderCancel()"
              />
            </div>

            <app-git-config-section
              [gitAuthor]="settingsModel().gitAuthor"
              [gitSincePeriod]="settingsModel().gitSincePeriod"
              [azureDevopsUser]="settingsModel().azureDevopsUser"
              [gitAuthorField]="settingsForm.gitAuthor()"
              [azureDevopsUserField]="settingsForm.azureDevopsUser()"
              (gitAuthorChange)="onGitAuthorChange($event)"
              (gitSincePeriodChange)="onGitSincePeriodChange($event)"
              (azureDevopsUserChange)="onAzureDevopsUserChange($event)"
            />

            <app-repo-selector
              [reposByProject]="reposByProject()"
              [selectedRepos]="settingsModel().selectedRepos"
              (selectionChange)="onRepoSelectionChange($event)"
            />

            <app-automation-section
              [active]="settingsModel().active"
              (activeChange)="onActiveChange($event)"
            />

            <app-email-digest-section
              [emailTheme]="settingsModel().emailTheme"
              (emailThemeChange)="onEmailThemeChange($event)"
            />

            <div class="flex flex-col gap-[12px] items-end">
              <button
                type="submit"
                z-button
                zType="default"
                zFull
                class="w-full md:w-auto"
                [zDisabled]="settingsForm().invalid() || saving()"
              >
                {{ saving() ? '$ salvando...' : '$ salvar_configurações' }}
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
  readonly cronPopoverVisibility = signal(DEFAULT_CRON_POPOVER_STATE)

  readonly settingsModel = signal<SaveSettingsInput>({
    standupCron: '',
    reminderCron: '',
    recoveryCron: '',
    timezone: '',
    gitAuthor: '',
    gitSincePeriod: '',
    selectedRepos: [],
    active: false,
    emailTheme: 'dark',
    azureDevopsUser: '',
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
    required(s.standupCron, { message: 'expressão cron obrigatória' })
    required(s.reminderCron, { message: 'expressão cron obrigatória' })
    required(s.recoveryCron, { message: 'expressão cron obrigatória' })
    required(s.timezone, { message: 'fuso horário obrigatório' })
  })

  constructor() {
    void this.loadData()
  }

  onRepoSelectionChange(selectedRepos: string[]) {
    this.settingsModel.update((m) => ({ ...m, selectedRepos }))
  }

  onActiveChange(active: boolean) {
    this.settingsModel.update((m) => ({ ...m, active }))
  }

  onEmailThemeChange(emailTheme: 'light' | 'dark') {
    this.settingsModel.update((m) => ({ ...m, emailTheme }))
  }

  onCronPopoverVisibilityChange(state: Record<CronFieldKey, boolean>) {
    this.cronPopoverVisibility.set(state)
  }

  onCronBuilderApply(field: CronFieldKey, cronExpression: string) {
    this.settingsModel.update((model) => ({
      ...model,
      [field]: cronExpression,
    }))
    this.onCronPopoverVisibilityChange({
      ...this.cronPopoverVisibility(),
      [field]: false,
    })
  }

  onCronBuilderCancel() {
    this.cronPopoverVisibility.set(DEFAULT_CRON_POPOVER_STATE)
  }

  onStandupCronChange(value: string) {
    this.settingsModel.update((m) => ({ ...m, standupCron: value }))
  }

  onReminderCronChange(value: string) {
    this.settingsModel.update((m) => ({ ...m, reminderCron: value }))
  }

  onRecoveryCronChange(value: string) {
    this.settingsModel.update((m) => ({ ...m, recoveryCron: value }))
  }

  onTimezoneChange(timezone: string | null) {
    this.settingsModel.update((model) => ({
      ...model,
      timezone: timezone ?? '',
    }))
  }

  onGitAuthorChange(gitAuthor: string) {
    this.settingsModel.update((model) => ({
      ...model,
      gitAuthor,
    }))
  }

  onGitSincePeriodChange(gitSincePeriod: string) {
    this.settingsModel.update((model) => ({
      ...model,
      gitSincePeriod,
    }))
  }

  onAzureDevopsUserChange(azureDevopsUser: string) {
    this.settingsModel.update((model) => ({
      ...model,
      azureDevopsUser,
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
        toast.success('Configurações salvas')
      } catch {
        toast.error('Falha ao salvar configurações')
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
        emailTheme: settings.emailTheme,
        azureDevopsUser: settings.azureDevopsUser ?? '',
      })
      this.loading.set(false)
    } catch {
      this.loading.set(false)
      this.loadError.set(true)
    }
  }
}
