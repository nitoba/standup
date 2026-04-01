# TAS-77 SettingsPage Component Split Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the 716-line monolithic `SettingsPage` into 5 focused subcomponents plus a slim orchestrator page, reducing the main component to ~150-200 lines while preserving all existing behavior.

**Architecture:** Each subcomponent owns one visual section of the settings page and communicates with the parent through signal inputs and output emitters. The parent `SettingsPage` retains form orchestration, load/save logic, and component composition.

**Tech Stack:** Angular 21, signals-based inputs/outputs, OnPush change detection, template inline components, TypeScript strict.

---

## Chunk 1: Smallest Components (Low Risk)

### Task 1: Create `automation-section` component

**Files:**
- Create: `apps/web/src/app/features/settings/components/automation-section/automation-section.ts`
- Create: `apps/web/src/app/features/settings/components/automation-section/automation-section.spec.ts`
- Modify: `apps/web/src/app/features/settings/settings-page.ts`

- [ ] **Step 1: Write the failing test**

Create `automation-section.spec.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/angular'
import { userEvent } from '@testing-library/user-event'
import { AutomationSection } from './automation-section'

describe('AutomationSection', () => {
  it('renders the active toggle and emits changes', async () => {
    const { fixture } = await render(AutomationSection, {
      componentInputs: { active: false },
    })
    const outputSpy = vi.fn()
    fixture.componentInstance.activeChange.subscribe(outputSpy)

    // Toggle should render and emit when clicked
    const toggle = screen.getByRole('switch')
    await userEvent.click(toggle)

    expect(outputSpy).toHaveBeenCalledWith(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && bun run test -- --watch=false --include src/app/features/settings/components/automation-section/automation-section.spec.ts`

Expected: FAIL because the component does not exist.

- [ ] **Step 3: Write minimal implementation**

Create `automation-section.ts`:
```ts
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core'
import { ZSwitchComponent } from '../../../../shared/components/z-switch/z-switch'

@Component({
  selector: 'app-automation-section',
  imports: [ZSwitchComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-col gap-[6px]">
      <label class="text-muted-foreground font-[var(--font-jetbrains)] text-[12px]">
        automacao
      </label>
      <z-switch
        [checked]="active()"
        (checkedChange)="activeChange.emit($event)"
      />
    </div>
  `,
})
export class AutomationSection {
  active = input.required<boolean>()
  activeChange = output<boolean>()
}
```

- [ ] **Step 4: Run test to verify it passes**

Run the same command from Step 2.

Expected: PASS.

- [ ] **Step 5: Wire into SettingsPage**

In `settings-page.ts`:
- Import `AutomationSection`
- Replace the inline automation toggle template with `<app-automation-section [active]="settingsModel().active" (activeChange)="onActiveChange($event)" />`

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/features/settings/components/automation-section/ apps/web/src/app/features/settings/settings-page.ts
git commit -m "refactor(web): extract automation-section from SettingsPage"
```

### Task 2: Create `email-digest-section` component

**Files:**
- Create: `apps/web/src/app/features/settings/components/email-digest-section/email-digest-section.ts`
- Create: `apps/web/src/app/features/settings/components/email-digest-section/email-digest-section.spec.ts`
- Modify: `apps/web/src/app/features/settings/settings-page.ts`

- [ ] **Step 1: Write the failing test**

Create `email-digest-section.spec.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/angular'
import { userEvent } from '@testing-library/user-event'
import { EmailDigestSection } from './email-digest-section'

describe('EmailDigestSection', () => {
  it('renders dark/light toggle and emits theme changes', async () => {
    const { fixture } = await render(EmailDigestSection, {
      componentInputs: { emailTheme: 'light' },
    })
    const outputSpy = vi.fn()
    fixture.componentInstance.emailThemeChange.subscribe(outputSpy)

    const darkButton = screen.getByText('dark')
    await userEvent.click(darkButton)

    expect(outputSpy).toHaveBeenCalledWith('dark')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && bun run test -- --watch=false --include src/app/features/settings/components/email-digest-section/email-digest-section.spec.ts`

Expected: FAIL because the component does not exist.

- [ ] **Step 3: Write minimal implementation**

Create `email-digest-section.ts`:
```ts
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core'

@Component({
  selector: 'app-email-digest-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-col gap-[6px]">
      <label class="text-muted-foreground font-[var(--font-jetbrains)] text-[12px]">
        resumo_por_email
      </label>
      <div class="flex items-center gap-[4px]">
        <button
          type="button"
          [class.bg-muted]="emailTheme() === 'dark'"
          [class.text-foreground]="emailTheme() === 'dark'"
          [class.text-muted-foreground]="emailTheme() !== 'dark'"
          (click)="emailThemeChange.emit('dark')"
        >
          dark
        </button>
        <button
          type="button"
          [class.bg-muted]="emailTheme() === 'light'"
          [class.text-foreground]="emailTheme() === 'light'"
          [class.text-muted-foreground]="emailTheme() !== 'light'"
          (click)="emailThemeChange.emit('light')"
        >
          light
        </button>
      </div>
    </div>
  `,
})
export class EmailDigestSection {
  emailTheme = input.required<'light' | 'dark'>()
  emailThemeChange = output<'light' | 'dark'>()
}
```

- [ ] **Step 4: Run test to verify it passes**

Run the same command from Step 2.

Expected: PASS.

- [ ] **Step 5: Wire into SettingsPage**

In `settings-page.ts`:
- Import `EmailDigestSection`
- Replace the inline email theme template with `<app-email-digest-section [emailTheme]="settingsModel().emailTheme" (emailThemeChange)="onEmailThemeChange($event)" />`

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/features/settings/components/email-digest-section/ apps/web/src/app/features/settings/settings-page.ts
git commit -m "refactor(web): extract email-digest-section from SettingsPage"
```

---

## Chunk 2: Medium Components

### Task 3: Create `git-config-section` component

**Files:**
- Create: `apps/web/src/app/features/settings/components/git-config-section/git-config-section.ts`
- Create: `apps/web/src/app/features/settings/components/git-config-section/git-config-section.spec.ts`
- Modify: `apps/web/src/app/features/settings/settings-page.ts`

- [ ] **Step 1: Write the failing test**

Create `git-config-section.spec.ts`:
```ts
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/angular'
import { userEvent } from '@testing-library/user-event'
import { GitConfigSection } from './git-config-section'

describe('GitConfigSection', () => {
  it('renders text inputs and emits changes', async () => {
    const { fixture } = await render(GitConfigSection, {
      componentInputs: {
        gitAuthor: 'nitoba',
        gitSincePeriod: '8 hours ago',
        azureDevopsUser: '',
        gitAuthorField: createMockFormField(),
        azureDevopsUserField: createMockFormField(),
      },
    })
    const authorSpy = vi.fn()
    fixture.componentInstance.gitAuthorChange.subscribe(authorSpy)

    const input = screen.getByLabelText(/autor_do_git/)
    await userEvent.clear(input)
    await userEvent.type(input, 'new-author')

    expect(authorSpy).toHaveBeenCalledWith('new-author')
  })
})

function createMockFormField() {
  return {
    touched: () => false,
    invalid: () => false,
    errors: () => [],
  }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && bun run test -- --watch=false --include src/app/features/settings/components/git-config-section/git-config-section.spec.ts`

Expected: FAIL because the component does not exist.

- [ ] **Step 3: Write minimal implementation**

Create `git-config-section.ts`:
```ts
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core'
import type { FormField } from '../../../../shared/form'

@Component({
  selector: 'app-git-config-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex items-stretch gap-[24px]">
      <div class="flex flex-col gap-[6px]">
        <label for="git-author" class="text-muted-foreground font-[var(--font-jetbrains)] text-[12px]">
          autor_do_git
        </label>
        <input
          id="git-author"
          type="text"
          z-input
          [value]="gitAuthor()"
          (input)="gitAuthorChange.emit($any($event.target).value)"
        />
        @if (gitAuthorField().touched() && gitAuthorField().invalid()) {
          <span class="text-[var(--accent-red)] font-[var(--font-ibm)] text-[11px]">
            {{ gitAuthorField().errors()[0]?.message }}
          </span>
        }
      </div>
      <div class="flex flex-col gap-[6px]">
        <label for="git-since-period" class="text-muted-foreground font-[var(--font-jetbrains)] text-[12px]">
          periodo_de_coleta_git
        </label>
        <input
          id="git-since-period"
          type="text"
          z-input
          [value]="gitSincePeriod()"
          (input)="gitSincePeriodChange.emit($any($event.target).value)"
        />
        <span class="text-muted-foreground/70 font-[var(--font-ibm)] text-[11px]">
          // ex: 8 hours ago, 24 hours ago, 2 days ago. Esse valor define o recorte da coleta de commits.
        </span>
      </div>
      <div class="flex flex-col gap-[6px]">
        <label for="azure-devops-user" class="text-muted-foreground font-[var(--font-jetbrains)] text-[12px]">
          azure_devops_user
        </label>
        <input
          id="azure-devops-user"
          type="text"
          z-input
          [value]="azureDevopsUser()"
          (input)="azureDevopsUserChange.emit($any($event.target).value)"
        />
        @if (azureDevopsUserField().touched() && azureDevopsUserField().invalid()) {
          <span class="text-[var(--accent-red)] font-[var(--font-ibm)] text-[11px]">
            {{ azureDevopsUserField().errors()[0]?.message }}
          </span>
        }
      </div>
    </div>
  `,
})
export class GitConfigSection {
  gitAuthor = input.required<string>()
  gitSincePeriod = input.required<string>()
  azureDevopsUser = input.required<string>()
  gitAuthorField = input.required<FormField>()
  azureDevopsUserField = input.required<FormField>()

  gitAuthorChange = output<string>()
  gitSincePeriodChange = output<string>()
  azureDevopsUserChange = output<string>()
}
```

- [ ] **Step 4: Run test to verify it passes**

Run the same command from Step 2.

Expected: PASS.

- [ ] **Step 5: Wire into SettingsPage**

In `settings-page.ts`:
- Import `GitConfigSection`
- Replace the inline git/azure template with `<app-git-config-section [gitAuthor]="settingsModel().gitAuthor" [gitSincePeriod]="settingsModel().gitSincePeriod" [azureDevopsUser]="settingsModel().azureDevopsUser" [gitAuthorField]="settingsForm.gitAuthor()" [azureDevopsUserField]="settingsForm.azureDevopsUser()" (gitAuthorChange)="onGitAuthorChange($event)" (gitSincePeriodChange)="onGitSincePeriodChange($event)" (azureDevopsUserChange)="onAzureDevopsUserChange($event)" />`

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/features/settings/components/git-config-section/ apps/web/src/app/features/settings/settings-page.ts
git commit -m "refactor(web): extract git-config-section from SettingsPage"
```

### Task 4: Create `repo-selector` component

**Files:**
- Create: `apps/web/src/app/features/settings/components/repo-selector/repo-selector.ts`
- Create: `apps/web/src/app/features/settings/components/repo-selector/repo-selector.spec.ts`
- Modify: `apps/web/src/app/features/settings/settings-page.ts`

- [ ] **Step 1: Write the failing test**

Create `repo-selector.spec.ts`:
```ts
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/angular'
import { userEvent } from '@testing-library/user-event'
import { RepoSelector } from './repo-selector'

describe('RepoSelector', () => {
  it('renders repos grouped by project and emits selection changes', async () => {
    const { fixture } = await render(RepoSelector, {
      componentInputs: {
        reposByProject: [
          { project: 'AGROTRACE', repos: [{ name: 'AGROTRACE/web', displayName: 'web' }] },
        ],
        selectedRepos: [],
      },
    })
    const outputSpy = vi.fn()
    fixture.componentInstance.selectionChange.subscribe(outputSpy)

    const checkbox = screen.getByRole('checkbox', { name: /web/ })
    await userEvent.click(checkbox)

    expect(outputSpy).toHaveBeenCalledWith(['AGROTRACE/web'])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && bun run test -- --watch=false --include src/app/features/settings/components/repo-selector/repo-selector.spec.ts`

Expected: FAIL because the component does not exist.

- [ ] **Step 3: Write minimal implementation**

Create `repo-selector.ts`:
```ts
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core'
import { ZCheckboxComponent } from '../../../../shared/components/z-checkbox/z-checkbox'

export interface RepoOption {
  name: string
  displayName: string
}

@Component({
  selector: 'app-repo-selector',
  imports: [ZCheckboxComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-col gap-[6px]">
      <label class="text-muted-foreground font-[var(--font-jetbrains)] text-[12px]">
        repositorios_selecionados
      </label>
      <div class="max-h-[200px] overflow-y-auto border border-border rounded-[8px] p-[12px]">
        @for (group of reposByProject(); track group.project) {
          <div class="mb-[8px]">
            <div class="text-foreground font-[var(--font-jetbrains)] text-[13px] mb-[4px]">
              {{ group.project }}
            </div>
            @for (repo of group.repos; track repo.name) {
              <z-checkbox
                [checked]="selectedRepos().includes(repo.name)"
                [label]="repo.displayName"
                (checkedChange)="onRepoChecked(repo.name, $event)"
              />
            }
          </div>
        }
      </div>
    </div>
  `,
})
export class RepoSelector {
  reposByProject = input.required<{ project: string; repos: RepoOption[] }[]>()
  selectedRepos = input.required<string[]>()
  selectionChange = output<string[]>()

  onRepoChecked(repoName: string, checked: boolean) {
    const current = this.selectedRepos()
    const next = checked
      ? [...current, repoName]
      : current.filter((name) => name !== repoName)
    this.selectionChange.emit(next)
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run the same command from Step 2.

Expected: PASS.

- [ ] **Step 5: Wire into SettingsPage**

In `settings-page.ts`:
- Import `RepoSelector`
- Replace the inline repo grid template with `<app-repo-selector [reposByProject]="reposByProject()" [selectedRepos]="settingsModel().selectedRepos" (selectionChange)="onRepoSelectionChange($event)" />`
- Add `onRepoSelectionChange(value: string[]) { this.settingsModel.update((m) => ({ ...m, selectedRepos: value })) }`
- Remove `isRepoSelected()`, `toggleRepo()`, `onRepoCheckedChange()` from SettingsPage

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/features/settings/components/repo-selector/ apps/web/src/app/features/settings/settings-page.ts
git commit -m "refactor(web): extract repo-selector from SettingsPage"
```

---

## Chunk 3: Largest Component

### Task 5: Create `schedule-section` component

**Files:**
- Create: `apps/web/src/app/features/settings/components/schedule-section/schedule-section.ts`
- Create: `apps/web/src/app/features/settings/components/schedule-section/types.ts`
- Create: `apps/web/src/app/features/settings/components/schedule-section/schedule-section.spec.ts`
- Modify: `apps/web/src/app/features/settings/settings-page.ts`

- [ ] **Step 1: Write the failing test**

Create `schedule-section.spec.ts`:
```ts
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/angular'
import { userEvent } from '@testing-library/user-event'
import { ScheduleSection } from './schedule-section'

describe('ScheduleSection', () => {
  it('renders cron fields and emits value changes', async () => {
    const { fixture } = await render(ScheduleSection, {
      componentInputs: {
        standupCron: '0 17 * * 1-5',
        reminderCron: '20 17 * * 1-5',
        recoveryCron: '0 18 * * 1-5',
        timezone: 'America/Sao_Paulo',
        timezoneOptions: [{ label: 'America/Sao_Paulo', value: 'America/Sao_Paulo' }],
        popoverVisibility: { standupCron: false, reminderCron: false, recoveryCron: false },
        standupCronField: createMockFormField(),
        reminderCronField: createMockFormField(),
        recoveryCronField: createMockFormField(),
        timezoneField: createMockFormField(),
      },
    })
    const outputSpy = vi.fn()
    fixture.componentInstance.standupCronChange.subscribe(outputSpy)

    // Trigger cron builder apply
    fixture.componentInstance.cronBuilderApply.emit({ field: 'standupCron', value: '0 18 * * 1-5' })

    expect(outputSpy).toHaveBeenCalledWith('0 18 * * 1-5')
  })
})

function createMockFormField() {
  return { touched: () => false, invalid: () => false, errors: () => [] }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && bun run test -- --watch=false --include src/app/features/settings/components/schedule-section/schedule-section.spec.ts`

Expected: FAIL because the component does not exist.

- [ ] **Step 3: Write minimal implementation**

Create `types.ts`:
```ts
export type CronFieldKey = 'standupCron' | 'reminderCron' | 'recoveryCron'
```

Create `schedule-section.ts`:
```ts
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core'
import { ZPopoverComponent, ZPopoverDirective } from '../../../../shared/components/z-popover'
import { ZInputDirective } from '../../../../shared/directives/z-input.directive'
import { ZComboboxComponent } from '../../../../shared/components/z-combobox'
import { CronBuilderComponent } from '../cron-builder/cron-builder'
import type { FormField } from '../../../../shared/form'
import type { ZardComboboxOption } from '../../../../shared/components/z-combobox/types'
import { type CronFieldKey } from './types'

@Component({
  selector: 'app-schedule-section',
  imports: [ZPopoverComponent, ZPopoverDirective, ZInputDirective, ZComboboxComponent, CronBuilderComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-col gap-[16px]">
      <label class="text-muted-foreground font-[var(--font-jetbrains)] text-[12px]">
        agendamento
      </label>

      @for (field of cronFields; track field.key) {
        <div class="flex flex-col gap-[6px]">
          <label [for]="field.key" class="text-muted-foreground font-[var(--font-jetbrains)] text-[12px]">
            {{ field.label }}
          </label>
          <div class="relative">
            <input
              [id]="field.key"
              type="text"
              z-input
              [value]="cronValue(field.key)"
              (click)="onCronFieldClick(field.key)"
              readonly
            />
            @if (cronField(field.key).touched() && cronField(field.key).invalid()) {
              <span class="text-[var(--accent-red)] font-[var(--font-ibm)] text-[11px]">
                {{ cronField(field.key).errors()[0]?.message }}
              </span>
            }
            <div
              z-popover
              [zVisible]="popoverVisibility()[field.key]"
              (zVisibleChange)="onPopoverVisibilityChange(field.key, $event)"
            >
              <app-cron-builder
                [cronValue]="cronValue(field.key)"
                (apply)="onCronBuilderApply(field.key, $event)"
                (cancel)="cronBuilderCancel.emit()"
              />
            </div>
          </div>
        </div>
      }

      <div class="flex flex-col gap-[6px]">
        <label class="text-muted-foreground font-[var(--font-jetbrains)] text-[12px]">
          timezone
        </label>
        <z-combobox
          [options]="timezoneOptions()"
          [value]="timezone()"
          (zValueChange)="onTimezoneChange($event)"
        />
        @if (timezoneField().touched() && timezoneField().invalid()) {
          <span class="text-[var(--accent-red)] font-[var(--font-ibm)] text-[11px]">
            {{ timezoneField().errors()[0]?.message }}
          </span>
        }
      </div>
    </div>
  `,
})
export class ScheduleSection {
  standupCron = input.required<string>()
  reminderCron = input.required<string>()
  recoveryCron = input.required<string>()
  timezone = input.required<string>()
  timezoneOptions = input.required<ZardComboboxOption[]>()
  popoverVisibility = input.required<Record<CronFieldKey, boolean>>()
  standupCronField = input.required<FormField>()
  reminderCronField = input.required<FormField>()
  recoveryCronField = input.required<FormField>()
  timezoneField = input.required<FormField>()

  standupCronChange = output<string>()
  reminderCronChange = output<string>()
  recoveryCronChange = output<string>()
  timezoneChange = output<string | null>()
  popoverVisibilityChange = output<Record<CronFieldKey, boolean>>()
  cronBuilderApply = output<{ field: CronFieldKey; value: string }>()
  cronBuilderCancel = output<void>()

  protected readonly cronFields = [
    { key: 'standupCron' as CronFieldKey, label: 'standup_cron' },
    { key: 'reminderCron' as CronFieldKey, label: 'reminder_cron' },
    { key: 'recoveryCron' as CronFieldKey, label: 'recovery_cron' },
  ]

  protected cronValue(key: CronFieldKey): string {
    switch (key) {
      case 'standupCron': return this.standupCron()
      case 'reminderCron': return this.reminderCron()
      case 'recoveryCron': return this.recoveryCron()
    }
  }

  protected cronField(key: CronFieldKey): FormField {
    switch (key) {
      case 'standupCron': return this.standupCronField()
      case 'reminderCron': return this.reminderCronField()
      case 'recoveryCron': return this.recoveryCronField()
    }
  }

  protected onCronFieldClick(key: CronFieldKey) {
    const current = this.popoverVisibility()
    this.popoverVisibilityChange.emit({ ...current, [key]: !current[key] })
  }

  protected onPopoverVisibilityChange(key: CronFieldKey, visible: boolean) {
    const current = this.popoverVisibility()
    this.popoverVisibilityChange.emit({ ...current, [key]: visible })
  }

  protected onCronBuilderApply(key: CronFieldKey, value: string) {
    this.cronBuilderApply.emit({ field: key, value })
    switch (key) {
      case 'standupCron': this.standupCronChange.emit(value); break
      case 'reminderCron': this.reminderCronChange.emit(value); break
      case 'recoveryCron': this.recoveryCronChange.emit(value); break
    }
  }

  protected onTimezoneChange(value: string | null) {
    this.timezoneChange.emit(value ?? '')
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run the same command from Step 2.

Expected: PASS.

- [ ] **Step 5: Wire into SettingsPage**

In `settings-page.ts`:
- Import `ScheduleSection`
- Replace the inline schedule template with `<app-schedule-section [standupCron]="settingsModel().standupCron" [reminderCron]="settingsModel().reminderCron" [recoveryCron]="settingsModel().recoveryCron" [timezone]="settingsModel().timezone" [timezoneOptions]="timezoneOptions()" [popoverVisibility]="cronPopoverVisibility()" [standupCronField]="settingsForm.standupCron()" [reminderCronField]="settingsForm.reminderCron()" [recoveryCronField]="settingsForm.recoveryCron()" [timezoneField]="settingsForm.timezone()" (standupCronChange)="onStandupCronChange($event)" (reminderCronChange)="onReminderCronChange($event)" (recoveryCronChange)="onRecoveryCronChange($event)" (timezoneChange)="onTimezoneChange($event)" (popoverVisibilityChange)="onCronPopoverVisibilityChange($event)" (cronBuilderApply)="onCronBuilderApply($event.field, $event.value)" (cronBuilderCancel)="onCronBuilderCancel()" />`
- Add handler methods: `onStandupCronChange`, `onReminderCronChange`, `onRecoveryCronChange`, `onCronBuilderApply`, `onCronBuilderCancel`

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/features/settings/components/schedule-section/ apps/web/src/app/features/settings/settings-page.ts
git commit -m "refactor(web): extract schedule-section from SettingsPage"
```

---

## Chunk 4: Cleanup and Final Verification

### Task 6: Final cleanup and verification

- [ ] **Step 1: Remove dead code from SettingsPage**

After all subcomponents are wired:
- Remove `onCronPopoverVisibilityChange`, `onCronBuilderApply`, `onCronBuilderCancel`, `onTimezoneChange`, `onGitSincePeriodInput`, `onActiveChange`, `onEmailThemeChange` if they only delegate to subcomponents
- Remove any unused imports
- Verify `settings-page.ts` is ~150-200 lines

- [ ] **Step 2: Update settings-page.spec.ts**

- Update template queries to find subcomponents instead of raw inputs
- Keep load/save/form validation tests intact
- Add integration test showing data flows from subcomponents through to save

- [ ] **Step 3: Run full web verification**

Run:
```bash
cd apps/web && npx tsc --noEmit
cd apps/web && bun run test -- --watch=false
```

Expected:
- Typecheck: 0 errors
- Tests: all passing

- [ ] **Step 4: Final commit**

```bash
git add apps/web/src/app/features/settings/
git commit -m "refactor(web): cleanup SettingsPage after component split"
```
