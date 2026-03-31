# TAS-76 and TAS-78 Frontend Refactor Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract standup view mappers from `StandupService` and centralize duplicated standup status helpers into a shared frontend utility.

**Architecture:** Keep `StandupService` as the orchestration layer for queries, mutations, and SSE. Move DTO/view-model mapping and content/source parsing into pure functions under the dashboard feature, and move status labels/classes/predicates into a shared utility used by dashboard, detail, and weekly digest screens.

**Tech Stack:** Angular 21, signals, TanStack Query Angular, TypeScript strict, Angular web test runner.

---

## Chunk 1: Shared Status Utility (TAS-78)

### Task 1: Create canonical standup status utility

**Files:**
- Create: `apps/web/src/app/shared/utils/standup-status.ts`
- Create: `apps/web/src/app/shared/utils/standup-status.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `standup-status.spec.ts` covering:
- `formatStandupStatus('draft') === '[rascunho]'`
- `formatStandupStatus('pending_review') === '[pendente]'`
- `formatStandupStatus('approved') === '[aprovado]'`
- `formatStandupStatus('rejected') === '[rejeitado]'`
- `formatStandupStatus('published') === '[publicado]'`
- `getStandupStatusDotClass('published') === 'bg-cyan-400'`
- `getStandupStatusTextClass('draft') === 'text-muted-foreground'`
- `getStandupStatusBadgeClass('approved') === 'text-primary'`
- `isPendingReviewStandup('pending_review') === true`
- `isApprovedStandup('approved') === true`
- `isApprovedStandup('published') === false`
- `canRegenerateStandup('pending_review') === true`
- `canRegenerateStandup('rejected') === true`
- `canRegenerateStandup('approved') === false`
- `canRegenerateStandup('published') === false`

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
cd apps/web && bun run test -- --watch=false --include src/app/shared/utils/standup-status.spec.ts
```

Expected: FAIL because the utility file does not exist yet.

- [ ] **Step 3: Write minimal implementation**

Create `standup-status.ts` with these exact exports:
- `formatStandupStatus(status: StandupStatus): string`
- `getStandupStatusDotClass(status: StandupStatus): string`
- `getStandupStatusTextClass(status: StandupStatus): string`
- `getStandupStatusBadgeClass(status: StandupStatus): string`
- `isPendingReviewStandup(status: StandupStatus): boolean`
- `isApprovedStandup(status: StandupStatus): boolean`
- `canRegenerateStandup(status: StandupStatus): boolean`

Use the canonical mapping from the approved spec:
- `draft` -> `[rascunho]`, muted classes
- `pending_review` -> `[pendente]`, yellow classes
- `approved` -> `[aprovado]`, primary classes
- `rejected` -> `[rejeitado]`, red classes
- `published` -> `[publicado]`, cyan classes

- [ ] **Step 4: Run test to verify it passes**

Run the same command from Step 2.

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/shared/utils/standup-status.ts apps/web/src/app/shared/utils/standup-status.spec.ts
git commit -m "refactor(web): centralize standup status helpers"
```

### Task 2: Replace local status helpers in UI consumers

**Files:**
- Modify: `apps/web/src/app/features/weekly-digest/weekly-digest-page.ts`
- Modify: `apps/web/src/app/features/dashboard/components/standup-table/standup-table.ts`
- Modify: `apps/web/src/app/features/standup-detail/standup-detail-page.ts`
- Modify: `apps/web/src/app/features/dashboard/components/standup-table/standup-table.spec.ts`
- Modify: `apps/web/src/app/features/weekly-digest/weekly-digest-page.spec.ts`
- Modify: `apps/web/src/app/features/standup-detail/standup-detail-page.spec.ts`

- [ ] **Step 1: Write/update failing tests**

Add/update tests to assert:
- `WeeklyDigestPage` still renders `published` as `[publicado]`
- `StandupTable` renders `published` as `[publicado]` with cyan status styling
- `StandupTable` renders `draft` as `[rascunho]` with muted status styling
- `StandupDetailPage` now treats `published` consistently (label/classes no longer fall through to rejected)
- `StandupDetailPage` predicates preserve current policy:
  - pending_review -> can regenerate
  - rejected -> can regenerate
  - approved -> cannot regenerate
  - published -> cannot regenerate

- [ ] **Step 2: Run tests to verify they fail for the right reason**

Run the relevant page specs.

Expected: `StandupDetailPage` fails on `published` behavior until wired to shared utility.

- [ ] **Step 3: Replace local methods with shared utility calls**

In each file:
- import the shared helper functions
- remove local implementations of duplicated status helpers
- keep template behavior intact by delegating to imported helpers

For `standup-detail-page.ts`, replace:
- `isPendingReview`
- `canRegenerate`
- `statusDotClass`
- `statusTextClass`
- `formatStatus`
- `isApproved`

With wrappers or direct usage of the shared utility.

- [ ] **Step 4: Run tests to verify they pass**

Run the updated specs.

Expected: PASS with `published` behavior now consistent.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/features/weekly-digest/weekly-digest-page.ts apps/web/src/app/features/dashboard/components/standup-table/standup-table.ts apps/web/src/app/features/standup-detail/standup-detail-page.ts apps/web/src/app/features/weekly-digest/weekly-digest-page.spec.ts apps/web/src/app/features/standup-detail/standup-detail-page.spec.ts
git commit -m "refactor(web): reuse shared standup status utility"
```

## Chunk 2: Standup View Mappers (TAS-76)

### Task 3: Extract pure standup view mappers

**Files:**
- Create: `apps/web/src/app/features/dashboard/services/standup-view-mappers.ts`
- Create: `apps/web/src/app/features/dashboard/services/standup-view-mappers.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `standup-view-mappers.spec.ts` covering:
- `mapStandupRecordDtoToStandup()` preserves `status: 'draft'` as `draft`
- `buildStandupContentPreview()` returns the first bullet without `- ` prefix
- `buildStandupContentPreview()` falls back to trimmed content when no bullet exists
- `parseStandupSections()` creates a synthetic `## resumo` section when a bullet appears before any heading
- `parseStandupSections()` preserves the current tone logic for headings containing `andamento` / `bloqueio`
- `parseStandupSources()` returns parsed repos/commits from valid source data
- `parseStandupSources()` returns `[]` on malformed source data
- `formatStandupSourceData()` pretty-prints valid JSON and returns raw input on malformed JSON
- `mapStandupRecordDtoToStandup()` produces the same shape currently expected by `standup-service.spec.ts`

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
cd apps/web && bun run test -- --watch=false --include src/app/features/dashboard/services/standup-view-mappers.spec.ts
```

Expected: FAIL because the mapper file does not exist yet.

- [ ] **Step 3: Write minimal implementation**

Create `standup-view-mappers.ts` with pure exports:
- `buildStandupContentPreview(content: string)`
- `parseStandupSections(content: string)`
- `parseStandupSources(sourceData: string)`
- `formatStandupSourceData(sourceData: string)`
- `mapStandupRecordDtoToStandup(dto: StandupRecordDto)`

Constraints:
- no Angular imports
- preserve existing `console.warn` behavior for malformed source data
- preserve current parsing semantics exactly

- [ ] **Step 4: Run test to verify it passes**

Run the same command from Step 2.

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/features/dashboard/services/standup-view-mappers.ts apps/web/src/app/features/dashboard/services/standup-view-mappers.spec.ts
git commit -m "refactor(web): extract standup view mappers"
```

### Task 4: Shrink `StandupService` to orchestration only

**Files:**
- Modify: `apps/web/src/app/features/dashboard/services/standup-service.ts`
- Modify: `apps/web/src/app/features/dashboard/services/standup-service.spec.ts`

- [ ] **Step 1: Write/update failing service test if needed**

Reuse existing `standup-service.spec.ts` expectations for:
- `contentPreview`
- `sections`
- `sources`

If no failure occurs after introducing mapper imports, adjust tests only to keep them pointed at existing behavior, not internal implementation.

- [ ] **Step 2: Run the service spec to establish baseline**

Run the specific service spec before editing.

- [ ] **Step 3: Replace local helper methods with imports from `standup-view-mappers.ts`**

In `StandupService`:
- delete local implementations of:
  - `mapStandup`
  - `mapStatus`
  - `buildContentPreview`
  - `parseSections`
  - `parseSources`
  - `formatSourceData`
- keep orchestration responsibilities untouched
- delegate via imported pure functions

- [ ] **Step 3a: Keep `draft` explicit end-to-end**

Add/update a service-level assertion in `standup-service.spec.ts` showing that a DTO with `status: 'draft'` yields a `Standup` with `status: 'draft'`.

- [ ] **Step 4: Run service spec to verify behavior is unchanged**

Run the service spec and confirm it still passes.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/features/dashboard/services/standup-service.ts apps/web/src/app/features/dashboard/services/standup-service.spec.ts
git commit -m "refactor(web): keep StandupService focused on orchestration"
```

## Final Verification

- [ ] Run:
```bash
cd apps/web && npx tsc --noEmit
```

- [ ] Run:
```bash
cd apps/web && bun run test -- --watch=false
```

- [ ] Run:
```bash
git diff --stat
```

- [ ] Commit any final cleanup if needed
