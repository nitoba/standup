# TAS-77 SettingsPage Component Split Design

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the 716-line monolithic `SettingsPage` into 5 focused subcomponents plus a slim orchestrator page, reducing the main component to ~150-200 lines while preserving all existing behavior.

**Architecture:** Each subcomponent owns one visual section of the settings page and communicates with the parent through signal inputs and output emitters. The parent `SettingsPage` retains form orchestration, load/save logic, and component composition.

**Tech Stack:** Angular 21, signals-based inputs/outputs, OnPush change detection, template inline components, TypeScript strict.

---

## Scope

Included:
- Extract `schedule-section` component (3 cron popovers + timezone)
- Extract `git-config-section` component (git author + gitSincePeriod + Azure DevOps)
- Extract `repo-selector` component (checkbox grid grouped by project)
- Extract `automation-section` component (active toggle)
- Extract `email-digest-section` component (email theme toggle)
- Slim down `SettingsPage` to orchestration only

Excluded:
- Changing `CronBuilderComponent` (already well-isolated)
- Changing `SettingsSkeleton` (already well-isolated)
- Changing `SettingsService` or `ReminderService`
- Adding new features or validation rules

---

## Component Design

### `schedule-section`

**File:** `apps/web/src/app/features/settings/components/schedule-section/schedule-section.ts`

**Responsibility:** Render and manage the 3 cron fields (standup, reminder, recovery) and timezone selection.

**Inputs:**
- `standupCron: string`
- `reminderCron: string`
- `recoveryCron: string`
- `timezone: string`
- `timezoneOptions: ZardComboboxOption[]`
- `popoverVisibility: Record<CronFieldKey, boolean>` where `CronFieldKey = 'standupCron' | 'reminderCron' | 'recoveryCron'` (extract this type to `apps/web/src/app/features/settings/components/schedule-section/types.ts`)
- `formFields: { standupCron: FormField; reminderCron: FormField; recoveryCron: FormField; timezone: FormField }`

**Outputs:**
- `standupCronChange: EventEmitter<string>`
- `reminderCronChange: EventEmitter<string>`
- `recoveryCronChange: EventEmitter<string>`
- `timezoneChange: EventEmitter<string | null>` (ZardCombobox emits `string | null`; parent coalesces to `''`)
- `popoverVisibilityChange: EventEmitter<Record<CronFieldKey, boolean>>`
- `cronBuilderApply: EventEmitter<{ field: CronFieldKey; value: string }>`
- `cronBuilderCancel: EventEmitter<void>`

**Design rules:**
- Move the 3 nearly-identical popover blocks from the template into a single internal structure
- Keep `CronBuilderComponent` usage as-is
- No form validation logic — parent owns the form
- Form field error display pattern (for each cron/timezone field):
  ```ts
  standupCronField = input.required<FormField>()
  ```
  ```html
  @if (standupCronField().touched() && standupCronField().invalid()) {
    <span class="text-[var(--accent-red)] font-[var(--font-ibm)] text-[11px]">
      {{ standupCronField().errors()[0]?.message }}
    </span>
  }
  ```
- Required imports: `ZardPopoverComponent`, `ZardPopoverDirective`, `ZardInputDirective`, `ZardComboboxComponent`, `CronBuilderComponent`, `FormField` type from the form library

### `git-config-section`

**File:** `apps/web/src/app/features/settings/components/git-config-section/git-config-section.ts`

**Responsibility:** Render git author, git since period, and Azure DevOps user fields.

**Inputs:**
- `gitAuthor: string`
- `gitSincePeriod: string`
- `azureDevopsUser: string`
- `formFields: { gitAuthor: FormField; azureDevopsUser: FormField }`
  - Note: `gitSincePeriod` has **no** form field — it uses raw `(input)` binding, not form validation

**Outputs:**
- `gitAuthorChange: EventEmitter<string>`
- `gitSincePeriodChange: EventEmitter<string>`
- `azureDevopsUserChange: EventEmitter<string>`

**Design rules:**
- Pure presentation — no business logic
- Combine git + Azure DevOps since they are visually adjacent in the current layout
- Form field error display pattern (for gitAuthor and azureDevopsUser only):
  ```ts
  gitAuthorField = input.required<FormField>()
  ```
  ```html
  @if (gitAuthorField().touched() && gitAuthorField().invalid()) {
    <span class="text-[var(--accent-red)] font-[var(--font-ibm)] text-[11px]">
      {{ gitAuthorField().errors()[0]?.message }}
    </span>
  }
  ```
- `gitSincePeriod` uses a plain `<input>` with `(input)` — no form field, no error display

### `repo-selector`

**File:** `apps/web/src/app/features/settings/components/repo-selector/repo-selector.ts`

**Responsibility:** Render the scrollable checkbox grid of repositories grouped by project.

**Inputs:**
- `reposByProject: { project: string; repos: RepoOption[] }[]`
- `selectedRepos: string[]`

**Outputs:**
- `selectionChange: EventEmitter<string[]>`

**Design rule:**
- Move the `@for` nested loop and checkbox logic here
- Keep the scroll container and project grouping
- No data transformation — parent computes `reposByProject`

### `automation-section`

**File:** `apps/web/src/app/features/settings/components/automation-section/automation-section.ts`

**Responsibility:** Render the active/inactive toggle switch.

**Inputs:**
- `active: boolean`

**Outputs:**
- `activeChange: EventEmitter<boolean>`

**Design rule:**
- Minimal wrapper around the existing toggle
- No validation — parent owns the model

### `email-digest-section`

**File:** `apps/web/src/app/features/settings/components/email-digest-section/email-digest-section.ts`

**Responsibility:** Render the dark/light email theme segmented toggle.

**Inputs:**
- `emailTheme: 'light' | 'dark'`

**Outputs:**
- `emailThemeChange: EventEmitter<'light' | 'dark'>`

**Design rules:**
- Minimal wrapper around the existing toggle
- No validation — parent owns the model
- The email theme toggle is two raw `<button>` elements with conditional class bindings — copy the markup as-is rather than wrapping a UI component

### `SettingsPage` (after split)

**File:** `apps/web/src/app/features/settings/settings-page.ts`

**New responsibility:** Orchestrate form state, load/save logic, and compose subcomponents.

**What stays:**
- `SettingsService` injection
- `loading`, `loadError`, `saving` signals
- `settingsModel` signal
- `settingsForm` form definition
- `availableRepos` and `reposByProject` computed signals
- `timezoneOptions` computed signal
- `cronPopoverVisibility` signal
- `loadData()`, `retryLoad()`, `onSubmit()`
- Submit button and form wrapper

**What moves:**
- All section templates move into subcomponents
- All section-specific event handlers move into subcomponents
- `onCronPopoverVisibilityChange`, `onCronBuilderApply`, `onCronBuilderCancel` → schedule-section
- `onTimezoneChange`, `onGitSincePeriodInput` → respective sections
- `onActiveChange`, `onEmailThemeChange` → respective sections
- `isRepoSelected()`, `toggleRepo()`, `onRepoCheckedChange()` → repo-selector

---

## Communication Pattern

All subcomponents use **signal inputs + output emitters** (Angular 21 pattern):

```ts
// In subcomponent
standupCron = input.required<string>()
standupCronChange = output<string>()

// In template
<app-schedule-section
  [standupCron]="settingsModel().standupCron"
  (standupCronChange)="onStandupCronChange($event)"
/>
```

The parent handles each output by updating `settingsModel`:

```ts
onStandupCronChange(value: string) {
  this.settingsModel.update((m) => ({ ...m, standupCron: value }))
}
```

This keeps the parent as the single source of truth for the form model.

---

## Testing Design

### New component tests
- `schedule-section.spec.ts`: cron values flow through inputs/outputs, popover visibility, cron builder apply/cancel
- `git-config-section.spec.ts`: text inputs flow through inputs/outputs
- `repo-selector.spec.ts`: checkbox selection, project grouping, selectionChange emission
- `automation-section.spec.ts`: toggle active/inactive
- `email-digest-section.spec.ts`: toggle light/dark

### Existing tests to update
- `settings-page.spec.ts`:
  - Update template queries to find subcomponents instead of raw inputs
  - Keep load/save/form validation tests intact
  - Add integration test showing data flows from subcomponents through to save

---

## Risks And Mitigations

### Risk: Form validation breaks after split
Mitigation:
- Keep form definition in parent
- Subcomponents receive form field references via inputs
- Validation errors still display in the correct subcomponent

### Risk: Output event ordering causes stale model state
Mitigation:
- Each output updates a single field in `settingsModel`
- No batched updates — one event per field change
- Parent model is the single source of truth

### Risk: Template query tests break
Mitigation:
- Update tests to query by subcomponent selectors
- Keep integration-level assertions (e.g., "save sends correct payload")

---

## Recommended Implementation Order

1. `automation-section` + `email-digest-section` (smallest, lowest risk)
2. `git-config-section` (medium, straightforward text inputs)
3. `repo-selector` (medium, checkbox logic)
4. `schedule-section` (largest, 3 popovers + timezone + cron builder)
5. Final cleanup: remove dead code from `SettingsPage`, update tests

This order front-loads the smallest components and leaves the most complex (schedule) for last, when the pattern is well-established.
