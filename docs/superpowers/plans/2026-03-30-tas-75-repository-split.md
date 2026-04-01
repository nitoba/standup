# TAS-75 StandupRepository Split Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the monolithic `StandupRepository` into `StandupReadRepository` and `StandupWriteRepository`, removing the old class entirely and migrating all consumers.

**Architecture:** Two new repository classes share private helpers (mapping, error handling, query builders) colocated in a shared module. `DatabaseModule` exports only the two new repositories. All consumers are updated in one batch to depend on the correct repository.

**Tech Stack:** NestJS 11, Drizzle ORM, TypeScript strict, Vitest.

---

## Chunk 1: Shared Helpers and New Repository Classes

### Task 1: Extract shared repository helpers

**Files:**
- Create: `apps/api/src/platform/database/repositories/standup-helpers.ts`
- Modify: `apps/api/src/platform/database/repositories/standup.repository.ts` (will be deleted after migration)

- [ ] **Step 1: Create the shared helpers file**

Extract these pure/internal helpers from `standup.repository.ts` into `standup-helpers.ts`:
- `parseCustomEntries()`
- `toRecord()`
- `dbErr(logger, operation, error)` — factory that takes the logger instance as first param
- `buildOrderBy()`
- `escapeLikePattern()`
- `buildListConditions()`
- All type exports: `CreateStandupInput`, `ReplaceGeneratedStandupInput`, `ListStandupFilters`, `PaginatedStandupList`, `StandupMetricChange`, `StandupMetricChanges`

Note: `dbErr` cannot be a pure function because it logs. Make it a factory: `function dbErr(logger: Logger, operation: string, error: unknown)`.

- [ ] **Step 2: Verify typecheck**

Run: `cd apps/api && bun run typecheck`

Expected: PASS (no consumers changed yet, types still re-exported from old file).

### Task 2: Create StandupReadRepository

**Files:**
- Create: `apps/api/src/platform/database/repositories/standup-read.repository.ts`
- Create: `apps/api/src/platform/database/repositories/standup-read.repository.spec.ts`

- [ ] **Step 1: Write failing test**

Create `standup-read.repository.spec.ts` covering:
- `findById()` returns a standup record
- `findById()` returns NotFoundError for missing id
- `findByIdForUser()` returns a standup for the given user
- `findByIdForUser()` returns NotFoundError for wrong user
- `list()` returns paginated results with summary and metricChanges
- `getMetricChangesForUser()` returns current vs previous week metrics
- `findLatestByUserAndDate()` returns the latest standup or null
- `findApprovedByUserAndDateRange()` returns approved standups in range

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && bun run test src/platform/database/repositories/standup-read.repository.spec.ts --run`

Expected: FAIL because the class does not exist.

- [ ] **Step 3: Write minimal implementation**

Create `StandupReadRepository` with:
- constructor injecting `DatabaseService` and `AppLoggerFactory`
- all read methods using shared helpers from `standup-helpers.ts`
- no write methods

- [ ] **Step 4: Run test to verify it passes**

Run the same command from Step 2.

Expected: PASS.

### Task 3: Create StandupWriteRepository

**Files:**
- Create: `apps/api/src/platform/database/repositories/standup-write.repository.ts`
- Create: `apps/api/src/platform/database/repositories/standup-write.repository.spec.ts`

- [ ] **Step 1: Write failing test**

Create `standup-write.repository.spec.ts` covering:
- `create()` inserts and returns the new standup
- `updateStatusForUser()` transitions status within a transaction
- `updateStatusForUser()` returns InvalidStateTransitionError for illegal transitions
- `approveForUser()` atomically updates content + customEntries + status
- `updateSentToDiscordAt()` sets the timestamp
- `replaceGeneratedForUser()` rewrites a draft standup

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && bun run test src/platform/database/repositories/standup-write.repository.spec.ts --run`

Expected: FAIL because the class does not exist.

- [ ] **Step 3: Write minimal implementation**

Create `StandupWriteRepository` with:
- constructor injecting `DatabaseService` and `AppLoggerFactory`
- all write methods using shared helpers from `standup-helpers.ts`
- transaction-wrapped methods where appropriate (approveForUser, updateStatus*, replaceGeneratedForUser)

- [ ] **Step 4: Run test to verify it passes**

Run the same command from Step 2.

Expected: PASS.

---

## Chunk 2: Module Wiring and Consumer Migration

### Task 4: Update DatabaseModule and delete old repository

**Files:**
- Modify: `apps/api/src/platform/database/database.module.ts`
- Delete: `apps/api/src/platform/database/repositories/standup.repository.ts`
- Delete: `apps/api/src/platform/database/repositories/standup.repository.spec.ts`

- [ ] **Step 1: Update DatabaseModule**

Replace `StandupRepository` in providers and exports with:
- `StandupReadRepository`
- `StandupWriteRepository`

- [ ] **Step 2: Delete old repository**

Remove `standup.repository.ts` and `standup.repository.spec.ts`.

- [ ] **Step 4: Verify typecheck**

Run: `cd apps/api && bun run typecheck`

Expected: FAIL (consumers still import the old class). This is expected; next tasks fix consumers.

### Task 5: Migrate read-only consumers

**Files:**
- Modify: `apps/api/src/contexts/standups/query/standups-query.service.ts`
- Modify: `apps/api/src/contexts/standups/query/standups-query.service.spec.ts`
- Modify: `apps/api/src/contexts/standups/trigger/trigger-standup.service.ts`
- Modify: `apps/api/src/contexts/standups/trigger/trigger-standup.service.spec.ts`
- Modify: `apps/api/src/contexts/standups/worker/digests/run-weekly-digest-job.service.ts`
- Modify: `apps/api/src/contexts/standups/worker/standup/strategies/execute-regenerate-strategy.ts`
- Modify: `apps/api/src/contexts/standups/worker/standup/strategies/execute-adjust-strategy.ts`
- Modify: `apps/api/src/interfaces/discord/handlers/copy-interaction.service.ts`
- Modify: `apps/api/src/interfaces/discord/handlers/slash-command-handler.service.ts`
- Modify: `apps/api/src/interfaces/discord/services/standup-status-sync.service.ts`
- Modify: `apps/api/src/interfaces/discord/services/standup-status-sync.service.spec.ts`

- [ ] **Step 1: Update imports and constructor injection**

In each file:
- replace `StandupRepository` import with `StandupReadRepository`
- update constructor parameter type
- update spec mocks to use `StandupReadRepository` naming

- [ ] **Step 2: Verify typecheck**

Run: `cd apps/api && bun run typecheck`

Expected: Partially PASS (write consumers still broken).

### Task 6: Migrate write consumers

**Files:**
- Modify: `apps/api/src/contexts/standups/approval/approve-standup.service.ts`
- Modify: `apps/api/src/contexts/standups/approval/approve-standup.service.spec.ts`
- Modify: `apps/api/src/contexts/standups/status/standup-status.service.ts`
- Modify: `apps/api/src/contexts/standups/status/standup-status.service.spec.ts`
- Modify: `apps/api/src/contexts/standups/send-to-discord/send-to-discord.service.ts`
- Modify: `apps/api/src/contexts/standups/send-to-discord/send-to-discord.service.spec.ts`
- Modify: `apps/api/src/contexts/standups/publication/publish-standup.service.ts`
- Modify: `apps/api/src/contexts/standups/publication/publish-standup.service.spec.ts`
- Modify: `apps/api/src/contexts/standups/worker/standup/standup-pipeline.service.ts`
- Modify: `apps/api/src/interfaces/discord/handlers/standup-interaction.service.ts`
- Modify: `apps/api/src/interfaces/discord/handlers/standup-interaction.service.spec.ts`
- Modify: `apps/api/src/interfaces/discord/services/standup-notification.service.ts`
- Modify: `apps/api/src/interfaces/discord/services/standup-notification.service.spec.ts`

- [ ] **Step 1: Update imports and constructor injection**

In each file:
- replace `StandupRepository` import with `StandupWriteRepository`
- update constructor parameter type
- update spec mocks to use `StandupWriteRepository` naming

- [ ] **Step 2: Handle mixed consumers**

For services that use both read and write methods:
- inject both `StandupReadRepository` and `StandupWriteRepository`
- use the correct one per method

Affected services:
- `SendToDiscordService` (findByIdForUser read + updateSentToDiscordAt write)
- `StandupInteractionService` (findByIdForUser read)
- `StandupNotificationService` (findById read + updateDmMessageId/updateStatus write)

Note: `StandupWriteRepository` includes these write methods: `create`, `updateStatus`, `updateStatusForUser`, `approveForUser`, `updateSentToDiscordAt`, `updateDmMessageId`, `replaceGeneratedForUser`. Unused methods (`updateContent`, `updateContentForUser`, `updateCustomEntries`, `updateCustomEntriesForUser`) should be dropped entirely.

- [ ] **Step 3: Verify typecheck**

Run: `cd apps/api && bun run typecheck`

Expected: PASS.

---

## Chunk 3: Final Verification

### Task 7: Run full verification suite

- [ ] **Step 1: Run lint**

Run: `cd apps/api && bun run lint`

Expected: zero errors/warnings.

- [ ] **Step 2: Run typecheck**

Run: `cd apps/api && bun run typecheck`

Expected: zero errors.

- [ ] **Step 3: Run full test suite**

Run: `cd apps/api && bun run test --run`

Expected: all tests passing.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/platform/database/repositories/standup-helpers.ts
git add apps/api/src/platform/database/repositories/standup-read.repository.ts
git add apps/api/src/platform/database/repositories/standup-read.repository.spec.ts
git add apps/api/src/platform/database/repositories/standup-write.repository.ts
git add apps/api/src/platform/database/repositories/standup-write.repository.spec.ts
git add apps/api/src/platform/database/repositories/index.ts
git add apps/api/src/platform/database/database.module.ts
git add apps/api/src/contexts/standups/query/standups-query.service.ts
git add apps/api/src/contexts/standups/query/standups-query.service.spec.ts
git add apps/api/src/contexts/standups/trigger/trigger-standup.service.ts
git add apps/api/src/contexts/standups/trigger/trigger-standup.service.spec.ts
git add apps/api/src/contexts/standups/approval/approve-standup.service.ts
git add apps/api/src/contexts/standups/approval/approve-standup.service.spec.ts
git add apps/api/src/contexts/standups/status/standup-status.service.ts
git add apps/api/src/contexts/standups/status/standup-status.service.spec.ts
git add apps/api/src/contexts/standups/send-to-discord/send-to-discord.service.ts
git add apps/api/src/contexts/standups/send-to-discord/send-to-discord.service.spec.ts
git add apps/api/src/contexts/standups/publication/publish-standup.service.ts
git add apps/api/src/contexts/standups/publication/publish-standup.service.spec.ts
git add apps/api/src/contexts/standups/worker/digests/run-weekly-digest-job.service.ts
git add apps/api/src/contexts/standups/worker/standup/standup-pipeline.service.ts
git add apps/api/src/contexts/standups/worker/standup/strategies/execute-regenerate-strategy.ts
git add apps/api/src/contexts/standups/worker/standup/strategies/execute-adjust-strategy.ts
git add apps/api/src/interfaces/discord/handlers/standup-interaction.service.ts
git add apps/api/src/interfaces/discord/handlers/standup-interaction.service.spec.ts
git add apps/api/src/interfaces/discord/handlers/copy-interaction.service.ts
git add apps/api/src/interfaces/discord/handlers/slash-command-handler.service.ts
git add apps/api/src/interfaces/discord/services/standup-notification.service.ts
git add apps/api/src/interfaces/discord/services/standup-notification.service.spec.ts
git add apps/api/src/interfaces/discord/services/standup-status-sync.service.ts
git add apps/api/src/interfaces/discord/services/standup-status-sync.service.spec.ts
git rm apps/api/src/platform/database/repositories/standup.repository.ts
git rm apps/api/src/platform/database/repositories/standup.repository.spec.ts
git commit -m "refactor(api): split StandupRepository into read and write repositories (TAS-75)"
```
