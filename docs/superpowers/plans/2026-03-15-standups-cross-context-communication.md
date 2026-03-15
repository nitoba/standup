# Standups Cross-Context Communication Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace request/reply event-bus flows around `contexts/standups` with direct application-service calls, while keeping event publication only for standup lifecycle facts and side effects.

**Architecture:** Keep `platform/events` as the fact publication mechanism, but remove `request*` usage between `standups`, `discord`, and related capabilities. Export focused standup-owned services for trigger, dispatch, reminder actions, repo listing, approval, and publication completion so adapters can call them directly. Shift approval/publication ownership back into `contexts/standups`, leaving `interfaces/discord` as a translator and side-effect executor.

**Tech Stack:** Bun, TypeScript, NestJS 11, Vitest, Biome

---

## File Structure

### Existing files to modify

- Modify: `apps/api/src/platform/events/event-bus.service.ts`
- Modify: `apps/api/src/platform/events/standup-events.ts`
- Modify: `apps/api/src/contexts/standups/standups.module.ts`
- Modify: `apps/api/src/contexts/standups/trigger/trigger-standup.service.ts`
- Modify: `apps/api/src/contexts/standups/worker/standup/standup-dispatch.service.ts`
- Modify: `apps/api/src/contexts/standups/worker/reminders/reminder-actions.service.ts`
- Modify: `apps/api/src/contexts/standups/worker/repos/list-worker-repos.service.ts`
- Modify: `apps/api/src/contexts/standups/approval/approve-standup.service.ts`
- Modify: `apps/api/src/interfaces/discord/discord.module.ts`
- Modify: `apps/api/src/interfaces/discord/services/discord-trigger.service.ts`
- Modify: `apps/api/src/interfaces/discord/services/discord-available-repos.service.ts`
- Modify: `apps/api/src/interfaces/discord/handlers/reminder-interaction.service.ts`
- Modify: `apps/api/src/interfaces/discord/handlers/standup-interaction.service.ts`
- Modify: `apps/api/src/interfaces/discord/handlers/modal-interaction.service.ts`
- Modify: `apps/api/src/interfaces/discord/services/standup-status-sync.service.ts`
- Modify: `apps/api/src/interfaces/discord/services/standup-notification.service.ts` only if emitted fact names change

### New files to create

- Create: `apps/api/src/contexts/standups/publication/publish-standup.service.ts`
- Create: `apps/api/src/contexts/standups/publication/publish-standup.service.spec.ts`
- Create: `apps/api/src/interfaces/discord/handlers/reminder-interaction.service.spec.ts`

### Existing tests to extend

- Test: `apps/api/src/contexts/standups/trigger/trigger-standup.service.spec.ts`
- Test: `apps/api/src/contexts/standups/worker/standup/standup-dispatch.service.spec.ts`
- Test: `apps/api/src/contexts/standups/worker/reminders/reminder-actions.service.spec.ts`
- Test: `apps/api/src/contexts/standups/worker/repos/list-worker-repos.service.spec.ts`
- Test: `apps/api/src/contexts/standups/approval/approve-standup.service.spec.ts`
- Test: `apps/api/src/interfaces/discord/services/discord-trigger.service.spec.ts`
- Test: `apps/api/src/interfaces/discord/services/discord-service-health.service.spec.ts` only if providers/imports shift
- Test: `apps/api/src/interfaces/discord/services/standup-notification.service.spec.ts`

## Chunk 1: Direct Trigger and Dispatch

### Task 1: Replace standup trigger request/reply with a direct standups call

**Files:**
- Modify: `apps/api/src/contexts/standups/standups.module.ts`
- Modify: `apps/api/src/contexts/standups/trigger/trigger-standup.service.ts`
- Modify: `apps/api/src/contexts/standups/worker/standup/standup-dispatch.service.ts`
- Modify: `apps/api/src/interfaces/discord/discord.module.ts`
- Modify: `apps/api/src/interfaces/discord/services/discord-trigger.service.ts`
- Test: `apps/api/src/contexts/standups/trigger/trigger-standup.service.spec.ts`
- Test: `apps/api/src/contexts/standups/worker/standup/standup-dispatch.service.spec.ts`
- Test: `apps/api/src/interfaces/discord/services/discord-trigger.service.spec.ts`

- [ ] **Step 1: Write the failing trigger test around direct dispatch**

```ts
it('dispatches the standup job directly instead of using the event bus', async () => {
  const dispatchStandupJob = vi.fn()
  const service = new TriggerStandupService(
    userRepository as never,
    userSettingsRepository as never,
    standupRepository as never,
    { dispatchStandupJob } as never,
    localDateService as never,
  )

  await service.trigger(
    { userId: 'user-1', discordUserId: 'discord-1' } as never,
    null,
  )

  expect(dispatchStandupJob).toHaveBeenCalledWith(
    expect.objectContaining({ userId: 'user-1', discordUserId: 'discord-1' }),
  )
})
```

- [ ] **Step 2: Run the standup trigger spec to verify it fails**

Run: `bun run --cwd apps/api vitest run src/contexts/standups/trigger/trigger-standup.service.spec.ts`
Expected: FAIL because `TriggerStandupService` still depends on `EventBusService`

- [ ] **Step 3: Write the failing Discord adapter test**

```ts
it('calls TriggerStandupService directly', async () => {
  const trigger = vi.fn().mockResolvedValue(Result.ok({ accepted: true }))
  const service = new DiscordTriggerService({ trigger } as never)

  const result = await service.trigger('user-1', 'discord-1')

  expect(trigger).toHaveBeenCalledWith(
    { userId: 'user-1', discordUserId: 'discord-1' },
    null,
  )
  expect(result.isOk()).toBe(true)
})
```

- [ ] **Step 4: Run the Discord trigger spec to verify it fails**

Run: `bun run --cwd apps/api vitest run src/interfaces/discord/services/discord-trigger.service.spec.ts`
Expected: FAIL because `DiscordTriggerService` still uses `requestStandupTrigger`

- [ ] **Step 5: Implement the direct trigger path**
  - Export `TriggerStandupService` and `StandupDispatchService` from `StandupsModule`
  - Inject `StandupDispatchService` into `TriggerStandupService`
  - Replace `requestStandupJobDispatch(...)` with `dispatchStandupJob(...)`
  - Remove `@OnEvent(STANDUP_TRIGGER_REQUESTED_EVENT)` and `handleRequestedTrigger(...)`
  - Make `DiscordTriggerService` depend on `TriggerStandupService` directly
  - Import `StandupsModule` in `DiscordModule`

- [ ] **Step 6: Run focused tests to verify the direct path passes**

Run: `bun run --cwd apps/api vitest run src/contexts/standups/trigger/trigger-standup.service.spec.ts src/contexts/standups/worker/standup/standup-dispatch.service.spec.ts src/interfaces/discord/services/discord-trigger.service.spec.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/contexts/standups/standups.module.ts \
  apps/api/src/contexts/standups/trigger/trigger-standup.service.ts \
  apps/api/src/contexts/standups/worker/standup/standup-dispatch.service.ts \
  apps/api/src/interfaces/discord/discord.module.ts \
  apps/api/src/interfaces/discord/services/discord-trigger.service.ts \
  apps/api/src/contexts/standups/trigger/trigger-standup.service.spec.ts \
  apps/api/src/contexts/standups/worker/standup/standup-dispatch.service.spec.ts \
  apps/api/src/interfaces/discord/services/discord-trigger.service.spec.ts
git commit -m "refactor: replace trigger request events with direct calls"
```

## Chunk 2: Direct Reminder and Repo Queries

### Task 2: Replace worker request/reply events for reminders and repo listing

**Files:**
- Modify: `apps/api/src/contexts/standups/standups.module.ts`
- Modify: `apps/api/src/contexts/standups/worker/reminders/reminder-actions.service.ts`
- Modify: `apps/api/src/contexts/standups/worker/repos/list-worker-repos.service.ts`
- Modify: `apps/api/src/interfaces/discord/services/discord-available-repos.service.ts`
- Modify: `apps/api/src/interfaces/discord/handlers/reminder-interaction.service.ts`
- Modify: `apps/api/src/interfaces/discord/discord.module.ts`
- Create: `apps/api/src/interfaces/discord/handlers/reminder-interaction.service.spec.ts`
- Test: `apps/api/src/contexts/standups/worker/reminders/reminder-actions.service.spec.ts`
- Test: `apps/api/src/contexts/standups/worker/repos/list-worker-repos.service.spec.ts`

- [ ] **Step 1: Write the failing repo adapter test**

```ts
it('fetches available repos from ListWorkerReposService directly', async () => {
  const listRepos = vi.fn().mockResolvedValue(Result.ok([{ id: '1', name: 'repo', project: 'proj' }]))
  const service = new DiscordAvailableReposService(loggerFactory as never, { listRepos } as never)

  const repos = await service.fetchAvailableRepos()

  expect(listRepos).toHaveBeenCalled()
  expect(repos).toHaveLength(1)
})
```

- [ ] **Step 2: Run the repo listing specs to verify they fail**

Run: `bun run --cwd apps/api vitest run src/interfaces/discord/services/discord-trigger.service.spec.ts src/contexts/standups/worker/repos/list-worker-repos.service.spec.ts`
Expected: FAIL because repo fetch still goes through `requestWorkerRepos`

- [ ] **Step 3: Write the failing reminder interaction test**

```ts
it('calls ReminderActionsService directly for snooze', async () => {
  const snoozeReminder = vi.fn().mockResolvedValue({ ok: true, snoozedUntil: '2026-03-15T10:15:00.000Z' })
  const service = new ReminderInteractionService(
    auth as never,
    trigger as never,
    { snoozeReminder } as never,
  )

  await service.handle(interaction, 'snooze')

  expect(snoozeReminder).toHaveBeenCalledWith('user-1')
})
```

- [ ] **Step 4: Run the new reminder interaction spec to verify it fails**

Run: `bun run --cwd apps/api vitest run src/interfaces/discord/handlers/reminder-interaction.service.spec.ts`
Expected: FAIL because `ReminderInteractionService` still depends on `EventBusService`

- [ ] **Step 5: Implement the direct reminder/repo path**
  - Export `ReminderActionsService` and `ListWorkerReposService` from `StandupsModule`
  - Remove `@OnEvent` handlers from those services
  - Inject `ListWorkerReposService` into `DiscordAvailableReposService`
  - Inject `ReminderActionsService` into `ReminderInteractionService`
  - Import `StandupsModule` into `DiscordModule` only once for all direct standup dependencies

- [ ] **Step 6: Run focused tests to verify the direct calls pass**

Run: `bun run --cwd apps/api vitest run src/contexts/standups/worker/reminders/reminder-actions.service.spec.ts src/contexts/standups/worker/repos/list-worker-repos.service.spec.ts src/interfaces/discord/handlers/reminder-interaction.service.spec.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/contexts/standups/standups.module.ts \
  apps/api/src/contexts/standups/worker/reminders/reminder-actions.service.ts \
  apps/api/src/contexts/standups/worker/repos/list-worker-repos.service.ts \
  apps/api/src/interfaces/discord/services/discord-available-repos.service.ts \
  apps/api/src/interfaces/discord/handlers/reminder-interaction.service.ts \
  apps/api/src/interfaces/discord/handlers/reminder-interaction.service.spec.ts \
  apps/api/src/interfaces/discord/discord.module.ts
git commit -m "refactor: replace worker request events with direct standup calls"
```

## Chunk 3: Move Approval and Publication Ownership to Standups

### Task 3: Introduce standup-owned approval and publication services

**Files:**
- Modify: `apps/api/src/contexts/standups/approval/approve-standup.service.ts`
- Modify: `apps/api/src/contexts/standups/standups.module.ts`
- Create: `apps/api/src/contexts/standups/publication/publish-standup.service.ts`
- Create: `apps/api/src/contexts/standups/publication/publish-standup.service.spec.ts`
- Test: `apps/api/src/contexts/standups/approval/approve-standup.service.spec.ts`

- [ ] **Step 1: Write the failing approval test for standup-owned status/fact emission**

```ts
it('approves the standup and emits a status fact from the standups context', async () => {
  const emitStandupStatusChanged = vi.fn()
  const service = new ApproveStandupService(
    standupRepository as never,
    userSettingsRepository as never,
    localDateService as never,
    { emitStandupStatusChanged } as never,
  )

  await service.approve('user-1', 'standup-1', null)

  expect(emitStandupStatusChanged).toHaveBeenCalledWith(
    expect.objectContaining({
      userId: 'user-1',
      standupId: 'standup-1',
      newStatus: 'approved',
    }),
  )
})
```

- [ ] **Step 2: Write the failing publish service test**

```ts
it('marks an approved standup as published after channel delivery succeeds', async () => {
  const service = new PublishStandupService(standupRepository as never, eventBus as never)

  const result = await service.publish('user-1', 'standup-1')

  expect(result.isOk()).toBe(true)
  expect(standupRepository.updateStatusForUser).toHaveBeenCalledWith(
    'standup-1',
    'user-1',
    'published',
  )
})
```

- [ ] **Step 3: Run the approval/publication specs to verify they fail**

Run: `bun run --cwd apps/api vitest run src/contexts/standups/approval/approve-standup.service.spec.ts src/contexts/standups/publication/publish-standup.service.spec.ts`
Expected: FAIL because `PublishStandupService` does not exist yet

- [ ] **Step 4: Implement standup-owned publication**
  - Keep `ApproveStandupService` as the only approval path
  - Add `PublishStandupService` to own the `approved -> published` transition
  - Export both services from `StandupsModule`
  - Emit `STANDUP_STATUS_CHANGED_EVENT` only from standup-owned services, not from Discord handlers

- [ ] **Step 5: Run the approval/publication specs to verify they pass**

Run: `bun run --cwd apps/api vitest run src/contexts/standups/approval/approve-standup.service.spec.ts src/contexts/standups/publication/publish-standup.service.spec.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/contexts/standups/approval/approve-standup.service.ts \
  apps/api/src/contexts/standups/approval/approve-standup.service.spec.ts \
  apps/api/src/contexts/standups/publication/publish-standup.service.ts \
  apps/api/src/contexts/standups/publication/publish-standup.service.spec.ts \
  apps/api/src/contexts/standups/standups.module.ts
git commit -m "refactor: move standup approval and publication into standups"
```

### Task 4: Make Discord handlers call standup-owned use cases instead of owning state transitions

**Files:**
- Modify: `apps/api/src/interfaces/discord/handlers/standup-interaction.service.ts`
- Modify: `apps/api/src/interfaces/discord/handlers/modal-interaction.service.ts`
- Modify: `apps/api/src/interfaces/discord/services/standup-status-sync.service.ts`
- Test: `apps/api/src/interfaces/discord/services/standup-notification.service.spec.ts`

- [ ] **Step 1: Write the failing interaction test for direct approval delegation**

```ts
it('delegates approve to ApproveStandupService instead of mutating the repository directly', async () => {
  const approve = vi.fn().mockResolvedValue({ id: 'standup-1', status: 'approved' })
  const service = new StandupInteractionService(
    loggerFactory as never,
    authRepository as never,
    messages as never,
    env as never,
    { approve } as never,
    publishStandup as never,
  )

  await service.handle('approve', 'standup-1', 'discord-user-1')

  expect(approve).toHaveBeenCalled()
})
```

- [ ] **Step 2: Run the Discord interaction-focused tests to verify they fail**

Run: `bun run --cwd apps/api vitest run src/interfaces/discord/services/standup-notification.service.spec.ts`
Expected: FAIL or require test updates because handlers/services still own repository transitions

- [ ] **Step 3: Implement the Discord adapter refactor**
  - Inject `ApproveStandupService` and `PublishStandupService` into `StandupInteractionService`
  - Remove direct repository status mutation and `emitStatusChanged(...)` ownership from the adapter
  - Make `ModalInteractionService` delegate custom-entry approval through `ApproveStandupService` instead of writing repository state itself
  - Make `StandupStatusSyncService` only react to approved status changes by performing the Discord channel side effect and then calling `PublishStandupService`

- [ ] **Step 4: Run focused Discord tests**

Run: `bun run --cwd apps/api vitest run src/interfaces/discord/services/standup-notification.service.spec.ts src/interfaces/discord/services/discord-trigger.service.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/interfaces/discord/handlers/standup-interaction.service.ts \
  apps/api/src/interfaces/discord/handlers/modal-interaction.service.ts \
  apps/api/src/interfaces/discord/services/standup-status-sync.service.ts \
  apps/api/src/interfaces/discord/services/standup-notification.service.spec.ts
git commit -m "refactor: make discord handlers delegate standup state changes"
```

## Chunk 4: Remove Request-Style EventBus APIs

### Task 5: Simplify platform events to fact publication only

**Files:**
- Modify: `apps/api/src/platform/events/event-bus.service.ts`
- Modify: `apps/api/src/platform/events/standup-events.ts`
- Modify: any file still importing:
  - `STANDUP_TRIGGER_REQUESTED_EVENT`
  - `STANDUP_JOB_DISPATCH_REQUESTED_EVENT`
  - `WORKER_REPOS_REQUESTED_EVENT`
  - `WORKER_REMINDER_ACTION_REQUESTED_EVENT`
  - `requestStandupTrigger`
  - `requestStandupJobDispatch`
  - `requestWorkerRepos`
  - `requestWorkerReminderAction`

- [ ] **Step 1: Write the failing structural test for request-style event removal**

```ts
it('does not expose request-style standup event helpers anymore', () => {
  const bus = new EventBusService(eventEmitter as never)

  expect('requestStandupTrigger' in bus).toBe(false)
  expect('requestStandupJobDispatch' in bus).toBe(false)
  expect('requestWorkerRepos' in bus).toBe(false)
  expect('requestWorkerReminderAction' in bus).toBe(false)
})
```

- [ ] **Step 2: Run the smallest relevant spec to verify it fails**

Run: `bun run --cwd apps/api vitest run src/interfaces/discord/services/discord-trigger.service.spec.ts`
Expected: FAIL if any code still depends on request-style EventBus methods

- [ ] **Step 3: Remove request-style event helpers**
  - Delete request methods from `EventBusService`
  - Delete request-style event constants and payload types from `standup-events.ts`
  - Remove leftover `@OnEvent` handlers that only existed for request/reply semantics

- [ ] **Step 4: Run a codebase grep as a verification gate**

Run: `rg -n "requestStandupTrigger|requestStandupJobDispatch|requestWorkerRepos|requestWorkerReminderAction|STANDUP_TRIGGER_REQUESTED_EVENT|STANDUP_JOB_DISPATCH_REQUESTED_EVENT|WORKER_REPOS_REQUESTED_EVENT|WORKER_REMINDER_ACTION_REQUESTED_EVENT" apps/api/src`
Expected: no matches

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/platform/events/event-bus.service.ts \
  apps/api/src/platform/events/standup-events.ts \
  apps/api/src/contexts/standups \
  apps/api/src/interfaces/discord
git commit -m "refactor: keep platform events for facts only"
```

## Chunk 5: Final Verification

### Task 6: Verify the full API package after the communication redesign

**Files:**
- Modify: any remaining import or provider wiring issues found by typecheck/test/lint

- [ ] **Step 1: Run targeted architecture grep**

Run: `rg -n "requestStandupTrigger|requestStandupJobDispatch|requestWorkerRepos|requestWorkerReminderAction|STANDUP_TRIGGER_REQUESTED_EVENT|STANDUP_JOB_DISPATCH_REQUESTED_EVENT|WORKER_REPOS_REQUESTED_EVENT|WORKER_REMINDER_ACTION_REQUESTED_EVENT" apps/api/src`
Expected: no matches

- [ ] **Step 2: Run typecheck**

Run: `bun run --cwd apps/api typecheck`
Expected: PASS

- [ ] **Step 3: Run tests**

Run: `bun run --cwd apps/api test`
Expected: PASS

- [ ] **Step 4: Run lint**

Run: `bun run --cwd apps/api lint`
Expected: PASS

- [ ] **Step 5: Commit final cleanup**

```bash
git add apps/api
git commit -m "refactor: simplify standup cross-context communication"
```
