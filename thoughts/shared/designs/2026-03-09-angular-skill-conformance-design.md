---
date: 2026-03-09
topic: "Angular Skill Conformance Fixes + HTTP Integration"
status: validated
---

# Angular Skill Conformance Fixes + HTTP Integration

## Problem Statement

The `apps/web/` Angular app follows ~80% of the Angular skill conventions but has 10 identified gaps across component architecture, signals, HTTP, routing, and accessibility. Additionally, the app uses hardcoded mock data in the service layer instead of using Angular's `httpResource()` pattern — even for mock data, the HTTP layer should be wired up to establish the correct patterns for when the real backend integrates.

## Constraints

- Angular v21.2.0 with standalone components (no NgModules)
- Must NOT set `standalone: true` in decorators
- Must use `ChangeDetectionStrategy.OnPush` on all components
- Must follow WCAG AA accessibility minimums
- Must use native control flow (`@if`, `@for`, `@switch`)
- Must use `inject()` over constructor injection
- Must use `input()`/`output()` signal functions over decorators
- Must use `host` object over `@HostBinding`/`@HostListener`
- No real backend yet — use mock HTTP interceptor to simulate API responses
- Keep the existing terminal/hacker aesthetic UI unchanged
- All existing tests must continue passing

## Approach

**Incremental refactoring** in 5 batches, ordered by dependency:

1. **HTTP foundation** — mock interceptor + `httpResource()` in service
2. **Component extraction** — break DashboardPage into small components
3. **Signal/routing fixes** — `input.required`, fix `getStandupById`
4. **Sidebar cleanup** — deduplicate class bindings
5. **Accessibility + guards** — `role="switch"`, `authGuard` skeleton

This order ensures each batch builds on the previous without conflicts.

## Architecture

### HTTP Layer (New)

```
app.config.ts
  └─ provideHttpClient(withInterceptors([mockApiInterceptor]))

interceptors/
  └─ mock-api.interceptor.ts     # Returns mock data for all /api/* routes

services/
  └─ standup.service.ts           # Refactored: httpResource() + resource()
```

The `mockApiInterceptor` intercepts HTTP requests matching `/api/*` patterns and returns mock JSON responses with realistic delays. This lets us wire up `httpResource()` properly without a running backend. When the real API is ready, we simply remove the interceptor — zero changes to components or services.

### Component Extraction (DashboardPage)

```
pages/dashboard/
  ├─ dashboard-page.ts            # Orchestrator only
  ├─ metric-card.ts               # Single metric display
  ├─ standup-table.ts             # Table with header + rows + pagination
  └─ filter-bar.ts                # Status/date/search filters
```

Each extracted component receives data via `input()` signals and emits actions via `output()`.

## Components

### `mockApiInterceptor` (New)
- **Responsibility:** Intercept `/api/*` requests, return mock data with simulated delay
- **Endpoints mocked:**
  - `GET /api/standups` → list of standups (supports `?status=` and `?date=` query params)
  - `GET /api/standups/:id` → single standup by ID
  - `PATCH /api/standups/:id/status` → update status, return updated standup
  - `POST /api/standups/trigger` → return `{ triggered: true }`
- **Delay:** 300-600ms randomized to simulate network latency
- **Data source:** Reuse existing `buildMockStandups()` logic, moved to a `mock-data.ts` file

### `StandupService` (Refactored)
- **Responsibility:** Data access layer using `httpResource()` and `HttpClient`
- **Changes:**
  - `standups` → `httpResource<Standup[]>(() => '/api/standups', { defaultValue: [] })`
  - `metrics` → `computed()` derived from `standups.value()`
  - `getStandupById(id)` → return `httpResource<Standup>(() => id ? '/api/standups/' + id : undefined)`
  - `approve/reject/regenerate` → `HttpClient.patch()` then `standups.reload()`
- **Key pattern:** `httpResource` handles loading/error states natively

### `MetricCard` (New)
- **Responsibility:** Display a single metric with label, value, change indicator
- **Inputs:** `label`, `value`, `change`, `dotColor`, `valueColor`, `changeColor`
- **Host:** `host: { 'class': 'metric-card' }`

### `StandupTable` (New)
- **Responsibility:** Display standup list in table format with header and pagination
- **Inputs:** `standups` (required), `total` (required)
- **Outputs:** `viewStandup` emits standup ID when "view" is clicked

### `FilterBar` (New)
- **Responsibility:** Status filter, date filter, search input
- **Outputs:** `statusChange`, `dateChange`, `searchChange`
- **State:** Local signals for current filter values

### `SidebarLayout` (Refactored)
- **Changes:** Deduplicate conditional class bindings using `computed()` signals for each nav item's class string, or use `[class.xxx]` individual bindings

### `StandupDetailPage` (Refactored)
- **Changes:**
  - `id = input.required<string>()` instead of `input<string>('')`
  - Use `httpResource` for fetching standup detail
  - Add loading/error states in template

### `SettingsPage` (Refactored)
- **Changes:** Add `role="switch"` to toggle buttons

### `authGuard` (New)
- **Responsibility:** Skeleton guard that checks a signal in a future AuthService
- **Behavior for now:** Always returns `true` (passthrough) — establishes the pattern
- **Applied to:** `dashboard`, `standups/:id`, `settings` routes

### `authInterceptor` (New)
- **Responsibility:** Skeleton interceptor that will attach auth headers
- **Behavior for now:** Passthrough — just calls `next(req)`
- **Purpose:** Establish the interceptor chain pattern

## Data Flow

### Standup List (Dashboard)
```
DashboardPage
  → StandupService.standups (httpResource GET /api/standups)
  → mockApiInterceptor returns mock data
  → httpResource.value() feeds computed() for metricCards
  → MetricCard receives data via input()
  → StandupTable receives standups via input()
  → User clicks "view" → StandupTable.viewStandup.emit(id) → router.navigate
```

### Standup Detail
```
StandupDetailPage
  → id = input.required<string>() (from route param via withComponentInputBinding)
  → httpResource GET /api/standups/:id
  → mockApiInterceptor returns single standup
  → Template renders with @if loading / @else if error / @else content
  → User clicks approve → HttpClient.patch → standups.reload()
```

### Status Update
```
User clicks approve/reject/regenerate
  → StandupService.approve(id) → HttpClient.patch('/api/standups/:id/status', { status })
  → mockApiInterceptor processes PATCH, returns updated standup
  → Service calls this.standups.reload() to refresh list
  → httpResource refetches, UI updates reactively
```

## Error Handling

- `httpResource` provides `.error()` signal natively — templates use `@if (resource.error())` blocks
- `mockApiInterceptor` returns 404 for unknown standup IDs
- `authInterceptor` (skeleton) will handle 401 → redirect to `/login` when real auth is added
- All error states show user-friendly messages in the terminal aesthetic

## Testing Strategy

### Unit Tests (Vitest)
- **mockApiInterceptor:** Test each endpoint returns correct shape and status codes
- **StandupService:** Test with `provideHttpClient(withInterceptors([mockApiInterceptor]))` — real HTTP flow through mock
- **MetricCard:** Test renders label, value, change with different inputs
- **StandupTable:** Test renders rows, emits viewStandup on click
- **FilterBar:** Test emits filter changes
- **StandupDetailPage:** Test loading state, error state, rendered content, button actions
- **authGuard:** Test returns true (for now)
- **Existing tests:** Must continue passing — update TestBed providers where needed

### Test Pattern
All component tests use `TestBed` with `provideHttpClient(withInterceptors([mockApiInterceptor]))` so the mock interceptor handles HTTP calls during tests — no manual mocking of HttpClient needed.

## Open Questions

None — all decisions are made. The mock interceptor approach is the cleanest path to establish HTTP patterns without a backend.
