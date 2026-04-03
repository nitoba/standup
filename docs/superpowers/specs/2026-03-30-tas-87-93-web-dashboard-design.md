# TAS-87 to TAS-93 Web/Dashboard Design

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the dashboard/web improvements from TAS-87 through TAS-93 while keeping the current `/standups` flow as the main data source and minimizing API churn.

**Architecture:** The dashboard keeps using standup list data as its backbone, but we separate list concerns from metrics concerns. Table data remains filterable/sortable and tied to `/standups`, while dashboard metric deltas become global week-over-week values independent of the table filters. WeeklyDigestPage is refactored to use generated clients and a thin service, not a new read-domain.

**Tech Stack:** NestJS 11, Drizzle ORM, Angular 21, generated Orval clients, signals-based services/pages, TypeScript strict mode.

---

## Scope

Included:
- `TAS-87` Add `sort` / `sortDir` to standup list API and dashboard consumption
- `TAS-88` Distinguish `published` from `approved` in the frontend
- `TAS-89` Replace fake dashboard metric changes with real global week-over-week metrics
- `TAS-90` Expose `gitSincePeriod` in the settings UI
- `TAS-91` Add first-access empty state in dashboard
- `TAS-92` Make `WeeklyDigestPage` use Orval clients instead of direct `HttpClient`
- `TAS-93` Redirect default route to `/dashboard`

Excluded:
- Creating a new persisted digest-read model
- Reworking the standup state machine
- Replacing the dashboard query architecture wholesale
- Adding advanced sorting UI beyond what is needed to consume the new API parameters

---

## Architectural Decision

The dashboard has two distinct data responsibilities and they should no longer be conflated:

1. **Table/list data**
   - Driven by the current `/standups` query
   - Obeys table filters and sorting
   - Powers rows, pagination, and filtered summary

2. **Dashboard metrics**
   - User-scoped but not tied to the active table filters
   - Compare current week vs previous week
   - Feed the top metric cards only

This keeps the list behavior intuitive while making the cards trustworthy and analytically meaningful.

---

## File Design

### Backend list/query flow

#### `apps/api/src/contexts/standups/query/standups-query.controller.ts`
Change:
- Accept `sort` and `sortDir` query params
- Document allowed values in OpenAPI

#### `apps/api/src/contexts/standups/query/standups-query.service.ts`
Change:
- Pass sorting fields to the repository list flow
- Orchestrate a second repository call for global week-over-week metrics

#### `apps/api/src/platform/database/repositories/standup.repository.ts`
Change:
- Support parameterized ordering for list queries
- Add a dedicated query/helper for dashboard metrics comparing current week to previous week

Design rule:
- List query remains the source for table rows and filtered summary
- Metrics query is separate and global by design

### Frontend dashboard flow

#### `apps/web/src/app/features/dashboard/services/standup-service.ts`
Change:
- Stop mapping `published -> approved`
- Pass `sort` and `sortDir`
- Consume the new metrics payload instead of `DASHBOARD_METRIC_CHANGES`

#### `apps/web/src/app/features/dashboard/services/dashboard-metric-changes.ts`
Change:
- Remove or fully retire this placeholder source

#### `apps/web/src/app/features/dashboard/dashboard-page.ts`
Change:
- Render a first-access empty state when there are no standups and no active filters

#### `apps/web/src/app/features/dashboard/components/standup-table/standup-table.ts`
Change:
- Support the distinct `published` status visually
- Optionally expose simple sort interaction if required for this batch

### Settings flow

#### `apps/web/src/app/features/settings/services/settings-service.ts`
Change:
- Add `gitSincePeriod` to the save input used by the page

#### `apps/web/src/app/features/settings/settings-page.ts`
Change:
- Load `gitSincePeriod` from API response
- Bind it to the form model
- Save it back on submit
- Expose a simple text input in the Git/settings section

### Weekly digest flow

#### `apps/web/src/app/features/weekly-digest/weekly-digest-page.ts`
Change:
- Remove direct `HttpClient` usage

#### New thin service
Proposed file:
- `apps/web/src/app/features/weekly-digest/services/weekly-digest-service.ts`

Responsibility:
- Compose Orval client calls
- Map API DTOs into the view model used by the page

Design rule:
- Do not introduce a new backend read model in this batch
- Keep using `/standups` as the data source for the weekly digest view, but through generated clients and local composition

### Routing

#### `apps/web/src/app/app.routes.ts`
Change:
- Redirect `''` and `**` to `/dashboard`
- Rely on the existing auth guard on `/dashboard` to send unauthenticated users to `/login`

---

## Behavior By Issue

### TAS-87: Sorting for standup list

Target behavior:
- `/standups` accepts:
  - `sort`: `date | createdAt | status`
  - `sortDir`: `asc | desc`
- Default remains equivalent to current behavior:
  - `date desc`
  - tie-break with `createdAt desc`

Implementation direction:
- Backend validates/normalizes allowed sort values
- Frontend sends the parameters explicitly when needed
- Keep the default stable so existing consumers do not regress

### TAS-88: Distinguish `published` in UI

Target behavior:
- A published standup renders as `Publicado`, not `Aprovado`
- `published` remains a real UI state in dashboard and weekly digest views

Implementation direction:
- Remove the mapping that collapses `published` into `approved`
- Update badges/text/color mapping in list/table components

### TAS-89: Real dashboard metric changes

Target behavior:
- Top cards show user-scoped week-over-week changes
- Table filters do not affect the metric deltas
- Counts in cards remain trustworthy even when the table is filtered
- Card values and deltas both come from the same `metricChanges` payload

Implementation direction:
- Add a dedicated metrics block to the backend response used by the dashboard
- Compare current week vs previous week at the repository level for the authenticated user only
- Remove the static `DASHBOARD_METRIC_CHANGES`

Rules:
- The metrics query must always be constrained by authenticated `userId`
- It must ignore active dashboard table filters (`status`, `date`, `search`, pagination, sorting)
- `summary` remains filtered and must not power the top metric cards
- Cards render:
  - value = `metricChanges.<key>.current`
  - delta = formatting derived from `metricChanges.<key>.delta`

Response design:
- Keep existing `summary`
- Add a separate `metricChanges` (or similarly named) payload for the cards

### TAS-90: Expose `gitSincePeriod` in settings

Target behavior:
- User can view and edit the commit collection period from the UI
- Default remains the backend-defined value when empty/not configured

Implementation direction:
- Surface a plain text input first
- Do not introduce presets, dropdowns, or parser UX in this batch

### TAS-91: First-access empty state

Target behavior:
- If the user has no standups and no active filters, the dashboard shows a contextual empty state with CTA
- Example CTA direction: configure repositories/settings and generate the first standup
- If filters are active and zero results are found, show a regular “no results” state instead

Implementation direction:
- Empty state branch should live at dashboard-page level, not be buried inside pagination footer logic

### TAS-92: WeeklyDigestPage via Orval clients

Target behavior:
- No direct `HttpClient` in the page component
- Page reads through generated clients and a small dedicated service

Implementation direction:
- Add a thin service for orchestration/mapping
- Keep the current `/standups` source and date window behavior for now

### TAS-93: Default route to `/dashboard`

Target behavior:
- `''` and `**` redirect to `/dashboard`
- Authenticated users land directly on the dashboard
- Unauthenticated users are redirected by the existing dashboard guard

---

## Data Contract Design

### Backend list response

Current response already contains:
- `data`
- `pagination`
- `summary`

Proposed extension:
- add `metricChanges` with fields aligned to the cards

Contract rule:
- `summary` remains filtered and is only for filtered table/list summary UI
- `metricChanges` is user-scoped, filter-independent, and powers the top cards exclusively

Example shape:

```json
{
  "data": [...],
  "pagination": {...},
  "summary": {
    "total": 12,
    "approved": 8,
    "pending": 3,
    "rejected": 1
  },
  "metricChanges": {
    "total": { "current": 12, "previous": 9, "delta": 3 },
    "approved": { "current": 8, "previous": 7, "delta": 1 },
    "pending": { "current": 3, "previous": 1, "delta": 2 },
    "rejected": { "current": 1, "previous": 2, "delta": -1 }
  }
}
```

Design rule:
- `summary` remains tied to the filtered list
- `metricChanges` is always user-scoped, filter-independent week-over-week

Contract update requirements:
- Update `apps/api/src/shared/openapi/response-dtos.ts` to include the new `metricChanges` schema
- Update `apps/api/src/contexts/standups/query/standups-query.controller.ts` OpenAPI query docs to include `sort` and `sortDir`
- Regenerate the web API client after backend contract changes
- Frontend must consume regenerated types for:
  - `ListStandupsParams`
  - `StandupListResponseDto`

---

## Error Handling

- Sorting params must fall back safely to defaults when omitted
- Empty state should not appear during loading or error states
- Weekly digest service should keep existing API error handling semantics from generated clients
- Settings save should continue using the same API-level validation behavior for `gitSincePeriod`

---

## Testing Design

### TAS-87
- Repository tests for sorting behavior and defaults
- Query/controller tests for accepted params

### TAS-88
- Frontend tests asserting `published` is rendered distinctly from `approved`

### TAS-89
- Repository/service tests for current-week vs previous-week metrics
- Frontend service tests verifying cards consume `metricChanges` instead of static constants

### TAS-90
- Settings page/service tests for load + save of `gitSincePeriod`

### TAS-91
- Dashboard page/component tests for:
  - first-access empty state
  - filtered empty state

### TAS-92
- Weekly digest page/service tests verifying Orval client usage and mapping behavior

### TAS-93
- Route tests (if present) or component/navigation tests to verify default redirect behavior

Global verification:
- `cd apps/api && bun run lint`
- `cd apps/api && bun run typecheck`
- `cd apps/api && bun run test --run`
- `cd apps/web && bun run generate-api`
- `cd apps/web && npx tsc --noEmit`
- relevant frontend tests for touched areas

---

## Risks And Mitigations

### Metric confusion between filtered and global values
Mitigation:
- Keep `summary` and `metricChanges` explicitly separate in the contract and naming

### Sorting contract drift between backend and frontend
Mitigation:
- Use explicit allowed values and test them on both sides

### WeeklyDigestPage refactor becoming a new backend feature
Mitigation:
- Keep it as a service/client refactor only in this batch

### Empty state accidentally hiding valid filtered-empty results
Mitigation:
- Gate first-access empty state on both `no standups` and `no active filters`

---

## Recommended Implementation Order

1. `TAS-93` default routing
2. `TAS-90` `gitSincePeriod` in settings
3. `TAS-88` distinct `published` status
4. `TAS-87` sorting support
5. `TAS-89` real metric changes
6. `TAS-91` dashboard empty state
7. `TAS-92` WeeklyDigestPage via Orval service

This order front-loads isolated, low-risk UI/contract changes and leaves the broader dashboard data refactor for the middle/end.
