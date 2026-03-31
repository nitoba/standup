# TAS-87 to TAS-93 Web/Dashboard Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the web/dashboard improvements from TAS-87 through TAS-93 with minimal contract churn and a clear separation between table data and global metrics.

**Architecture:** `/standups` remains the main source for dashboard rows, but gains sorting and a dedicated `metricChanges` payload for top cards. Frontend stops collapsing `published`, settings exposes `gitSincePeriod`, WeeklyDigestPage is refactored to use Orval clients through a thin service, and routing/empty-state behavior is clarified.

**Tech Stack:** NestJS 11, Drizzle ORM, Angular 21, generated Orval clients, TypeScript strict.

---

## Chunk 1: Routing, Settings, Published Status

### Task 1: Redirect default route to `/dashboard` (TAS-93)

**Files:**
- Modify: `apps/web/src/app/app.routes.ts`
- Test: relevant route spec if present

- [ ] **Step 1: Write/update failing route test if coverage exists**
- [ ] **Step 2: Change `''` and `**` redirects from `/login` to `/dashboard`**
- [ ] **Step 3: Run targeted web tests or route verification**

### Task 2: Expose `gitSincePeriod` in settings UI (TAS-90)

**Files:**
- Modify: `apps/web/src/app/features/settings/services/settings-service.ts`
- Modify: `apps/web/src/app/features/settings/settings-page.ts`
- Test: relevant settings specs if present

- [ ] **Step 1: Write/update failing settings test**
- [ ] **Step 2: Add `gitSincePeriod` to `SaveSettingsInput` and page form model**
- [ ] **Step 3: Load and save `gitSincePeriod` through existing settings flow**
- [ ] **Step 4: Add a simple text input in the Git/settings section**
- [ ] **Step 5: Run targeted web tests**

### Task 3: Distinguish `published` from `approved` in the UI (TAS-88)

**Files:**
- Modify: `apps/web/src/app/features/dashboard/services/standup-service.ts`
- Modify: `apps/web/src/app/features/weekly-digest/weekly-digest-page.ts`
- Modify: `apps/web/src/app/features/dashboard/components/standup-table/standup-table.ts`
- Test: relevant dashboard/weekly digest specs

- [ ] **Step 1: Write/update failing test that `published` is shown distinctly**
- [ ] **Step 2: Remove the `published -> approved` mapping**
- [ ] **Step 3: Update status text/badge rendering to show `Publicado`**
- [ ] **Step 4: Run targeted web tests**

## Chunk 2: Sorting And Metric Changes

### Task 4: Add sorting support to `/standups` (TAS-87)

**Files:**
- Modify: `apps/api/src/contexts/standups/query/standups-query.controller.ts`
- Modify: `apps/api/src/contexts/standups/query/standups-query.service.ts`
- Modify: `apps/api/src/platform/database/repositories/standup.repository.ts`
- Modify: `apps/api/src/shared/openapi/response-dtos.ts` or query DTO surface if needed
- Regenerate: `apps/web` API client

- [ ] **Step 1: Write/update failing repository/controller test for sort params**
- [ ] **Step 2: Add `sort` and `sortDir` query params with defaults**
- [ ] **Step 3: Implement safe parameterized ordering in repository**
- [ ] **Step 4: Regenerate frontend API client**
- [ ] **Step 5: Run targeted API tests + web typecheck**

### Task 5: Replace fake dashboard metric changes with real user-scoped week-over-week metrics (TAS-89)

**Files:**
- Modify: `apps/api/src/platform/database/repositories/standup.repository.ts`
- Modify: `apps/api/src/contexts/standups/query/standups-query.service.ts`
- Modify: `apps/api/src/shared/openapi/response-dtos.ts`
- Modify: `apps/web/src/app/features/dashboard/services/standup-service.ts`
- Delete or stop using: `apps/web/src/app/features/dashboard/services/dashboard-metric-changes.ts`
- Regenerate: `apps/web` API client

- [ ] **Step 1: Write failing API test for `metricChanges`**
- [ ] **Step 2: Add repository query comparing current week vs previous week for authenticated user only**
- [ ] **Step 3: Return `metricChanges` in the list response without changing filtered `summary` semantics**
- [ ] **Step 4: Regenerate frontend API client**
- [ ] **Step 5: Update dashboard service so cards use `metricChanges.current` + `metricChanges.delta`, not `summary` or placeholder constants**
- [ ] **Step 6: Run targeted API/web tests**

## Chunk 3: Empty State And Weekly Digest Refactor

### Task 6: Add first-access empty state in dashboard (TAS-91)

**Files:**
- Modify: `apps/web/src/app/features/dashboard/dashboard-page.ts`
- Possibly modify: `apps/web/src/app/features/dashboard/components/standup-table/standup-table.ts`
- Test: dashboard page spec

- [ ] **Step 1: Write/update failing dashboard spec for first-access empty state**
- [ ] **Step 2: Show first-access empty state only when there are zero standups and no active filters**
- [ ] **Step 3: Keep filtered-empty state distinct from first-access empty state**
- [ ] **Step 4: Run targeted web tests**

### Task 7: Refactor WeeklyDigestPage to use Orval clients (TAS-92)

**Files:**
- Create: `apps/web/src/app/features/weekly-digest/services/weekly-digest-service.ts`
- Modify: `apps/web/src/app/features/weekly-digest/weekly-digest-page.ts`
- Use: generated clients under `apps/web/src/app/api/endpoints/standups/`
- Test: weekly digest specs if present

- [ ] **Step 1: Write/update failing spec that page no longer depends on direct `HttpClient` composition**
- [ ] **Step 2: Create a thin weekly digest service that uses generated clients and maps response data**
- [ ] **Step 3: Update the page to inject the new service and remove direct `HttpClient` usage**
- [ ] **Step 4: Run targeted web tests and typecheck**

## Final Verification

- [ ] Run: `cd apps/api && bun run lint`
- [ ] Run: `cd apps/api && bun run typecheck`
- [ ] Run: `cd apps/api && bun run test --run`
- [ ] Run: `cd apps/web && bun run generate-api`
- [ ] Run: `cd apps/web && npx tsc --noEmit`
- [ ] Run relevant frontend tests for dashboard/settings/weekly-digest touched areas
