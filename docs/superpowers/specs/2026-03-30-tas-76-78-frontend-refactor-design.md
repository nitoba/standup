# TAS-76 and TAS-78 Frontend Refactor Design

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce duplication in the frontend by extracting standup view mappers from `StandupService` and centralizing standup status display/policy helpers used across dashboard, detail, and weekly digest screens.

**Architecture:** `StandupService` remains the orchestration layer for queries, mutations, and SSE. Mapping/parsing logic moves into pure functions colocated with the dashboard feature, while standup status presentation/policy moves into a shared utility used by all screens that render standup states.

**Tech Stack:** Angular 21, signals, TanStack Query Angular, TypeScript strict, current frontend test stack (`ng test` / Vitest-backed Angular runner).

---

## Scope

Included:
- `TAS-76` extract standup DTO/view mappers and parsers from `StandupService`
- `TAS-78` centralize duplicated standup status helpers

Excluded:
- splitting `SettingsPage` (`TAS-77`)
- broader shared “view-model layer” redesign
- changes to backend/API contracts

---

## Architectural Decision

We will do the smallest refactor that creates stable, reusable seams:

1. **Pure standup view mappers**
   - local to the dashboard feature because they currently serve the dashboard service directly
   - no Angular injection, no side effects except existing `console.warn` behavior for malformed source data

2. **Shared standup status utility**
   - shared because multiple features render and reason about the same status values
   - includes both presentation helpers and lightweight UI policy helpers

This avoids over-generalizing while still removing the most obvious duplication.

---

## File Design

### `apps/web/src/app/features/dashboard/services/standup-service.ts`
Current responsibility:
- query/mutation orchestration
- SSE integration
- DTO -> `Standup` mapping
- content/source parsing helpers

New responsibility:
- keep query/mutation/SSE only
- delegate mapping/parsing to extracted pure functions

Change:
- remove local implementations of:
  - `mapStandup`
  - `buildContentPreview`
  - `parseSections`
  - `parseSources`
  - `formatSourceData`
- import replacements from the new mapper module

### New file: `apps/web/src/app/features/dashboard/services/standup-view-mappers.ts`
Responsibility:
- map standup API DTOs into `Standup` view models
- keep current parsing behavior exactly as-is

Functions to include:
- `mapStandupRecordDtoToStandup(dto)`
- `buildStandupContentPreview(content)`
- `parseStandupSections(content)`
- `parseStandupSources(sourceData)`
- `formatStandupSourceData(sourceData)`

Design rule:
- pure functions only
- no Angular imports
- preserve existing parsing semantics and warning behavior

### New file: `apps/web/src/app/shared/utils/standup-status.ts`
Responsibility:
- single source of truth for standup status labels, colors, and simple UI policy checks

Functions to include:
- `formatStandupStatus(status)`
- `getStandupStatusDotClass(status)`
- `getStandupStatusTextClass(status)`
- `getStandupStatusBadgeClass(status)`
- `isPendingReviewStandup(status)`
- `isApprovedStandup(status)`
- `canRegenerateStandup(status)`

Design rule:
- every exported helper must explicitly handle all `StandupStatus` values: `draft`, `pending_review`, `approved`, `rejected`, `published`
- no helper may rely on fallback behavior for `draft` or `published`
- avoid UI-framework-specific behavior beyond returning class strings already used today

Canonical shared status mapping:
- `draft`
  - label: `[rascunho]`
  - dot: `bg-muted-foreground/50`
  - text: `text-muted-foreground`
  - badge: `text-muted-foreground`
- `pending_review`
  - label: `[pendente]`
  - dot: `bg-[var(--accent-yellow)]`
  - text: `text-[var(--accent-yellow)]`
  - badge: `text-[var(--accent-yellow)]`
- `approved`
  - label: `[aprovado]`
  - dot: `bg-primary`
  - text: `text-primary`
  - badge: `text-primary`
- `rejected`
  - label: `[rejeitado]`
  - dot: `bg-[var(--accent-red)]`
  - text: `text-[var(--accent-red)]`
  - badge: `text-[var(--accent-red)]`
- `published`
  - label: `[publicado]`
  - dot: `bg-cyan-400`
  - text: `text-cyan-400`
  - badge: `text-cyan-400`

UI policy contract:
- `isPendingReviewStandup(status)` returns `true` only for `pending_review`
- `isApprovedStandup(status)` returns `true` only for `approved`
- `canRegenerateStandup(status)` returns `true` only for `pending_review` and `rejected`
- `published` returns `false` for all three predicates above

### `apps/web/src/app/features/weekly-digest/weekly-digest-page.ts`
Change:
- replace local status helper methods with calls to the shared status utility

### `apps/web/src/app/features/dashboard/components/standup-table/standup-table.ts`
Change:
- replace local `statusBadgeClass()` / `formatStatus()` logic with the shared utility

### `apps/web/src/app/features/standup-detail/standup-detail-page.ts`
Change:
- replace duplicated status helpers with the shared utility
- make `published` render consistently instead of falling into the rejected fallback

---

## Behavior Design

### TAS-76: Extract frontend mappers/formatters from `StandupService`

Target behavior:
- `StandupService` produces the exact same `Standup` models as before
- parsing/formatting behavior does not change
- the service becomes smaller and easier to read

Behavior to preserve exactly:
- first bullet line (`- ...`) becomes `contentPreview`
- when bullets appear before any `##` heading, create a synthetic `## resumo` section
- `resolveSectionTone()` behavior remains unchanged
- malformed `sourceData` continues to return `[]` / raw string with `console.warn`

Implementation direction:
- move code, do not redesign it
- keep current helper boundaries recognizable in the new file

### TAS-78: Centralize standup status display helpers

Target behavior:
- `pending_review`, `approved`, `rejected`, and `published` are rendered consistently across screens
- `draft` also has an explicit, stable shared representation and never relies on fallback behavior
- `published` no longer falls through to the rejected styling/text in `StandupDetailPage`
- simple action predicates are reusable and no longer buried in one component

Implementation direction:
- all status labels/classes/predicates come from the shared utility
- preserve current strings and class tokens where they already match expectations
- align detail page with table/weekly digest behavior for `published`

---

## Testing Design

### New tests for mapper module
- add a dedicated spec for `standup-view-mappers.ts`
- cover:
  - preview extraction
  - synthetic `## resumo`
  - section parsing tones
  - source parsing
  - malformed `sourceData`

### New tests for status utility
- add a dedicated spec for `standup-status.ts`
- cover:
  - labels for all statuses including `published`
  - class helpers for all statuses
  - predicates like `canRegenerateStandup()`

### Existing tests to update
- `standup-service.spec.ts`
  - should still validate mapped output, now indirectly through the extracted mapper
- `weekly-digest-page.spec.ts`
  - keep the `published -> [publicado]` expectation
- `standup-detail-page.spec.ts`
  - add explicit coverage for `published` to prevent regressions

Global verification:
- `cd apps/web && npx tsc --noEmit`
- `cd apps/web && bun run test -- --watch=false`

---

## Risks And Mitigations

### Risk: accidental parser behavior drift
Mitigation:
- move logic with minimal edits
- add dedicated mapper tests before swapping imports

### Risk: status utility becomes too broad
Mitigation:
- keep it to labels/classes/simple predicates only
- do not move unrelated component behavior into it

### Risk: `published` remains inconsistent in one screen
Mitigation:
- explicitly update and test dashboard table, weekly digest, and standup detail

---

## Recommended Implementation Order

1. create `standup-status.ts` + tests
2. wire `WeeklyDigestPage`, `StandupTable`, and `StandupDetailPage` to it
3. create `standup-view-mappers.ts` + tests
4. switch `StandupService` to use extracted mappers
5. run full frontend verification

This order closes the visible `published` inconsistency early and keeps the larger `StandupService` refactor guarded by dedicated tests.
