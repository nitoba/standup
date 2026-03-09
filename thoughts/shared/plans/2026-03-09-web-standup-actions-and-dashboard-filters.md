# Web Standup Actions and Dashboard Filters Implementation Plan

**Goal:** add the missing standup-detail action UX (`adjust` modal, queued feedback, button locking) and move dashboard status/date filtering to the backend without breaking the existing terminal-style Angular UI.

**Architecture:** keep `StandupService` as the only API boundary for `apps/web`. I am implementing the UX gaps as component-local signal state in `standup-detail-page` and keeping dashboard filter ownership split intentionally: `FilterBar` owns its display cycle state, `DashboardPage` owns the selected values it shows, and `StandupService.setDashboardFilters()` remains the only trigger for server-side list reloads.

**Design:** `thoughts/shared/designs/2026-03-09-web-frontend-api-parity-design.md`

---

## Implementation Decisions

- `adjust` and `regenerate` stay true `202 accepted` flows. The page should never pretend a new standup already exists; it shows a queued message and leaves the current detail loaded until the user refreshes or returns later.
- `approve` and `reject` use the same local busy flag as async rewrite actions so all four buttons lock consistently and double-submit is impossible.
- `DashboardPage` uses explicit change handlers instead of an `effect()` for status/date sync. This avoids an unnecessary extra `GET /api/standups` on first render.
- `FilterBar` keeps the cycle-button UX, but the internal cycle values become semantic (`this_week`, `today`, `yesterday`) and the component resolves `today`/`yesterday` to real `YYYY-MM-DD` strings before emitting.
- The new modal should be accessible enough for the current stack: `role="dialog"`, `aria-modal="true"`, labeled title, textarea focus target, and cancel/submit buttons with disabled state derived from signals.
- I am adding a dedicated modal spec even though the request only named the component file. The repo guidance favors one implementation file plus its own spec so the action page tests can stay focused on orchestration instead of low-level modal rendering.

---

## Dependency Graph

```text
Batch 1 (parallel): 1.1, 1.2 [new UI primitives]
Batch 2 (parallel): 2.1, 2.2, 2.3, 2.4 [page wiring and unit coverage - depend on batch 1 as needed]
Batch 3 (parallel): 3.1, 3.2 [page integration specs - depend on batch 2]
```

---

## Batch 1: UI Primitives

All tasks in this batch are independent and unblock the two page-level rewires.

### Task 1.1: Add the inline adjust modal component
- **File:** `apps/web/src/app/pages/standup-detail/adjust-modal.ts`
- **Test:** `apps/web/src/app/pages/standup-detail/adjust-modal.spec.ts`
- **Depends:** none
- Build a standalone, `OnPush` component with signal inputs via `input(false)` for `open` and `loading`, plus signal outputs via `output<string>()` and `output<void>()`.
- Give the component its own `instruction = signal('')` and a derived `canSubmit = computed(() => instruction().trim().length > 0 && !loading())` so validation is entirely local.
- Render the modal only with `@if (open())`; when closed, nothing remains in the DOM. Use a full-screen backdrop, bordered surface panel, `// adjust standup` title, textarea placeholder, and `$ submit` / `$ cancel` buttons styled with the existing CSS variables.
- Add dialog semantics: outer panel `role="dialog"`, `aria-modal="true"`, `aria-labelledby` bound to the title id, and textarea `aria-label="Adjust standup instructions"`.
- Keep behavior simple: cancel emits `close`, submit trims the textarea, emits `submitInstruction`, and resets the local instruction signal. Also reset the textarea whenever the modal closes so reopening starts clean.
- Focus choice: use a `viewChild` textarea reference and `afterNextRender()` when `open()` becomes true so keyboard users land directly in the input.
- **Verify:** `cd apps/web && bun run test`
- **Commit:** `feat(web): add standup adjust modal`

### Task 1.2: Make dashboard date cycling dynamic and server-ready
- **File:** `apps/web/src/app/pages/dashboard/filter-bar.ts`
- **Test:** `apps/web/src/app/pages/dashboard/filter-bar.spec.ts`
- **Depends:** none
- Replace the current hardcoded date literal state with a semantic cycle signal, e.g. `signal<string>('this_week')`, where the only stored values are `this_week`, `today`, and `yesterday`.
- Add pure helpers inside the component: `formatDate(date: Date)`, `startOfToday()`, `minusDays(date, days)`, `resolveDateValue(selection)`, and `displayDateLabel(selection)`.
- Keep the status cycle unchanged, but update the date button label so `this_week` displays literally while `today` and `yesterday` display the resolved `YYYY-MM-DD` string.
- Change `cycleDate()` to rotate `this_week -> today -> yesterday -> this_week`, update the local signal, and emit the resolved value (`this_week` or a real date string).
- Keep the existing `searchChange` API untouched so `DashboardPage` can adopt server-side status/date filtering without changing child bindings.
- **Verify:** `cd apps/web && bun run test`
- **Commit:** `feat(web): update dashboard date cycle filters`

---

## Batch 2: Page Wiring and Focused Specs

These tasks depend on the new primitive pieces and can land in parallel once Batch 1 is ready.

### Task 2.1: Cover the modal in isolation
- **File:** `apps/web/src/app/pages/standup-detail/adjust-modal.spec.ts`
- **Test:** same file
- **Depends:** 1.1
- Add focused rendering tests so the page spec does not need to prove every modal detail.
- Cover: hidden when `open=false`, visible title/textarea/buttons when `open=true`, submit disabled while empty, submit disabled while `loading=true`, submit emits trimmed text, cancel emits close, and textarea resets after submit or close.
- Use direct button clicks and native textarea events; no need for host wrapper components because the modal API is simple.
- **Verify:** `cd apps/web && bun run test`
- **Commit:** `test(web): add adjust modal coverage`

### Task 2.2: Rewire standup detail actions for busy state and queued feedback
- **File:** `apps/web/src/app/pages/standup-detail/standup-detail-page.ts`
- **Test:** `apps/web/src/app/pages/standup-detail/standup-detail-page.spec.ts`
- **Depends:** 1.1
- Import `signal` plus the new `AdjustModal` component and add local page state: `actionLoading`, `actionFeedback`, `showAdjustModal`, and `feedbackTimeoutId` for clearing/replacing the 5-second message timer.
- Add helper methods: `openAdjustModal()`, `closeAdjustModal()`, `setQueuedFeedback()`, and `clearQueuedFeedback()` so approve/reject/regenerate/adjust all use the same state transitions.
- Implement `approve(id)` and `reject(id)` with an early return if `actionLoading()` is already true, then `try/finally` around the awaited service call. On success, clear any stale queued message and reload the detail resource.
- Implement `regenerate(id)` with the same busy guard, but on success set `actionFeedback` to `// standup queued for regeneration...`, schedule a 5-second clear, and reload the detail resource only if you decide the current API should be re-fetched immediately. I recommend still calling `standup.reload()` so the page can pick up status changes such as `rejected` if backend behavior evolves.
- Implement `onAdjustSubmit(instruction)` as: close modal -> set busy -> call `standupService.adjust(id, instruction)` -> show the same queued feedback -> optionally reload -> clear busy in `finally`.
- Render the fourth `$ adjust` button between reject and regenerate, using the same cyan token family as regenerate but keeping its own label. All four buttons must bind `[disabled]="actionLoading()"` and add disabled styling (`opacity`, `cursor-not-allowed`, and remove hover glow while disabled).
- Render `<app-adjust-modal [open]="showAdjustModal()" [loading]="actionLoading()" (submitInstruction)="onAdjustSubmit($event)" (close)="closeAdjustModal()" />` at the end of the page section so it overlays the existing layout cleanly.
- Add a small feedback line under the button row: `@if (actionFeedback(); as feedback) { ... }`, styled in muted cyan terminal copy.
- **Verify:** `cd apps/web && bun run test`
- **Commit:** `feat(web): add queued rewrite feedback to standup detail`

### Task 2.3: Update filter-bar spec for semantic date cycling
- **File:** `apps/web/src/app/pages/dashboard/filter-bar.spec.ts`
- **Test:** same file
- **Depends:** 1.2
- Replace the old hardcoded `2026-03-09` expectation with deterministic time control. Use `vi.useFakeTimers()` and `vi.setSystemTime(new Date('2026-03-09T12:00:00Z'))` so `today` and `yesterday` resolve predictably.
- Keep the existing event-emission pattern but extend it: first status click should still emit `pending_review`; first date click should emit `2026-03-09`; second date click should emit `2026-03-08`; third date click should emit `this_week`.
- Add one assertion on rendered text so the date button label shows `2026-03-09` after the first cycle instead of the semantic word `today`.
- Restore timers after the spec so later Angular tests do not inherit the fake clock.
- **Verify:** `cd apps/web && bun run test`
- **Commit:** `test(web): update filter bar date cycle coverage`

### Task 2.4: Move dashboard status/date filtering to the service boundary
- **File:** `apps/web/src/app/pages/dashboard/dashboard-page.ts`
- **Test:** `apps/web/src/app/pages/dashboard/dashboard-page.spec.ts`
- **Depends:** 1.2
- Keep `statusFilter`, `dateFilter`, and `searchFilter` as local signals because the view still needs current values, but stop using `statusFilter` and `dateFilter` inside the list filtering computed.
- Rename `filteredStandups` to something like `searchFilteredStandups` and limit it to client-side search over the already server-filtered `standupService.standups.value()` list.
- Update `visibleStandups` and table `total` bindings to use the renamed computed.
- Replace the inline event handlers in the template with page methods, e.g. `onStatusChange(value: string)` and `onDateChange(value: string)`, so each handler both updates the local signal and calls `standupService.setDashboardFilters({ status: this.statusFilter(), date: this.dateFilter() })`.
- Keep search purely local with `onSearchChange(value: string)` updating only `searchFilter`.
- Do not push search into `setDashboardFilters()` yet because the backend contract explicitly does not support it.
- **Verify:** `cd apps/web && bun run test`
- **Commit:** `feat(web): use server filters on dashboard`

---

## Batch 3: Page Integration Specs

These tasks prove the rewired pages behave correctly with the updated component contracts.

### Task 3.1: Expand standup detail page tests for the new action flow
- **File:** `apps/web/src/app/pages/standup-detail/standup-detail-page.spec.ts`
- **Test:** same file
- **Depends:** 1.1, 2.2
- Refactor the current single test into a reusable test setup helper that returns the fixture, mock service, and standup resource. Add `adjust: vi.fn()` to the service mock.
- Add `renders all four action buttons` by asserting the presence of `$ approve`, `$ reject`, `$ adjust`, and `$ regenerate` in the DOM.
- Add `opens adjust modal when adjust button clicked` by clicking the adjust button, calling `fixture.detectChanges()`, and asserting the modal title or textarea placeholder is rendered.
- Add `calls adjust service with instruction on modal submit` by opening the modal, setting the textarea value, dispatching an `input` event, clicking submit, awaiting the fixture to stabilize, and asserting `adjust` received the standup id plus the typed instruction.
- Add `disables buttons while action is loading` using a deferred promise for one mutation (approve is simplest): click button, detect changes before resolving the promise, assert all four buttons are disabled, then resolve and flush microtasks.
- Add `shows feedback message after regenerate` by mocking `regenerate` to resolve immediately, clicking regenerate, detecting changes, and asserting `// standup queued for regeneration...` appears. Use fake timers if you also want to prove it disappears after 5 seconds.
- Keep the original header render assertion as a smoke test, but fold it into the first broader render test instead of leaving a redundant single-assertion case.
- **Verify:** `cd apps/web && bun run test`
- **Commit:** `test(web): cover standup detail review actions`

### Task 3.2: Verify dashboard filter changes trigger server reloads
- **File:** `apps/web/src/app/pages/dashboard/dashboard-page.spec.ts`
- **Test:** same file
- **Depends:** 2.4
- Keep the current real-service + `HttpTestingController` approach because it proves the page and service integration together.
- After the initial `/api/standups` flush, click the status filter button and assert the next request is `/api/standups?status=pending_review`; flush the same mock list and re-run change detection.
- Click the date filter button next and assert the next request adds the resolved date query parameter. Use a fixed system time so the expected URL is stable, for example `/api/standups?status=pending_review&date=2026-03-09`.
- Add one assertion that search still remains client-side by typing into the search input and confirming no extra HTTP request is generated while the rendered table row count changes locally.
- Preserve the existing header smoke test so the spec still covers the page rendering path after the first response.
- **Verify:** `cd apps/web && bun run test`
- **Commit:** `test(web): verify dashboard server-side filters`

---

## Verification Strategy

- Run `cd apps/web && bun run test` after each batch to catch Angular template or signal regressions early.
- Final pass should specifically confirm the standup detail page locks all action buttons during async work, the adjust modal resets cleanly between openings, and the queued feedback text clears on timer without leaving stale DOM.
- Final dashboard verification should confirm only status/date trigger HTTP reloads, while search continues to filter the already-loaded list in memory.
- If a targeted failure appears around fake timers, restore real timers in every spec `afterEach` to avoid cross-test contamination.

## Risks To Watch

- `standup.reload()` after a `202` rewrite may briefly show no visible change because the backend work is asynchronous; that is expected, so the queued feedback copy becomes the primary UX confirmation.
- A component-level `effect()` in either `AdjustModal` or `DashboardPage` can accidentally trigger duplicate work if it observes broad state. Keep effects narrowly scoped or prefer explicit handlers.
- Angular signal inputs are read-only. The modal should never try to mutate `open()` or `loading()` directly; it must communicate exclusively through outputs.
- Fake timer usage in Vitest can interfere with Angular async rendering if not restored. Keep clock control local to the specs that need date or timeout determinism.
