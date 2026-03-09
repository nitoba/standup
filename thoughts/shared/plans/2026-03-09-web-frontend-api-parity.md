# Web Frontend API Parity Implementation Plan

**Goal:** ship browser-safe API parity for the existing standup workflows, then rewire `apps/web` from mock flows to the real API so the web app can authenticate, configure settings, trigger jobs, review standups, and run reminder actions without touching worker internals.

**Architecture:** keep the current four-layer boundary intact: Angular talks only to `apps/api`, API remains the policy boundary, and worker/bot keep orchestration and Discord side effects. I am implementing the open design calls as: Better Auth client-driven browser bootstrap for auth/session, a dedicated `POST /standups/:id/approve` facade that mirrors the Discord approve+publish flow, and end-to-end support for `gitSincePeriod` because the DB schema and current web form already expect it.

**Design:** `thoughts/shared/designs/2026-03-09-web-frontend-api-parity-design.md`

---

## Sequencing

- Backend goes first because the web app must stop depending on mocked contracts before page rewiring is safe.
- Thin facade work is split into service primitives first, then route handlers, then API bootstrap wiring.
- Frontend rewiring starts only after the API surface is stable: session/auth shell first, then data services, then page integration.
- Contract and integration verification lands before page-level UX polish so failures show up at the boundary where they originate.

## Dependency Graph

```text
Batch 1 (parallel): 1.1, 1.2, 1.3, 1.4 [backend foundations]
Batch 2 (parallel): 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7 [API facade handlers - depend on batch 1]
Batch 3 (parallel): 3.1, 3.2, 3.3, 3.4 [API bootstrap + contract verification - depend on batch 2]
Batch 4 (parallel): 4.1, 4.2, 4.3, 4.4, 4.5 [frontend data/auth foundations - depend on batch 3]
Batch 5 (parallel): 5.1, 5.2, 5.3, 5.4 [Angular page rewiring - depend on batch 4]
Batch 6 (parallel): 6.1, 6.2 [cross-service and app-level verification - depend on batch 5]
```

---

## Backend Decisions

- Better Auth client becomes the primary browser bootstrap mechanism for auth state. We only add an app-owned session endpoint if implementation reveals a real need for app-specific session metadata beyond what Better Auth already gives us.
- `POST /standups/:id/approve` becomes a dedicated browser-safe workflow endpoint. It owns optional custom entries merge, approval, best-effort publish, and final `published` transition so Angular does not reproduce Discord logic client-side.
- Settings stay user-scoped under `/settings/me` and support `gitSincePeriod` end-to-end. This matches the existing `user_settings.git_since_period` column and avoids a fake field in the Angular form.
- Reminder/browser actions become public authenticated API routes that proxy the existing worker internal routes. The browser never sends `x-internal-secret` and never talks to worker directly.
- Non-fatal background semantics are preserved. `202`, already-running, already-completed, DM failure, and publish failure stay visible as API outcomes or UI notices, not hidden local state mutations.

---

## Batch 1: Backend Foundations

All tasks in this batch are independent and should land before any new public route is added.

### Task 1.1: Persist `gitSincePeriod` in user settings repository
- **File:** `packages/db/src/repositories/user-settings.ts`
- **Test:** `packages/db/src/repositories/user-settings.test.ts`
- **Depends:** none
- Extend `UpsertUserSettingsInput` and `upsert()` so `gitSincePeriod` is accepted, defaulted, and updated on conflict exactly like the existing cron/timezone fields.
- Keep repository semantics synchronous where they already are; only the data shape changes.
- Add assertions that create/update flows round-trip `gitSincePeriod` and that defaults still apply when the field is omitted.
- **Verify:** `bun test packages/db/src/repositories/user-settings.test.ts`

### Task 1.2: Add API-facing worker facade service
- **File:** `apps/api/src/services/worker-facade-service.ts`
- **Test:** `apps/api/src/services/worker-facade-service.test.ts`
- **Depends:** none
- Centralize API->worker proxy calls for repo listing and reminder actions instead of duplicating `fetch()` logic across handlers.
- Expose small functions such as `listRepos()`, `runStandupNow()`, `snoozeReminder()`, and `cancelReminderForToday()` that return `Result` errors shaped like the existing `triggerStandupJob()` service.
- Treat worker non-`2xx` responses as typed external-service failures; preserve `202` for trigger-style accepts and `200` for reminder mutations.
- **Verify:** `bun run --filter @standup/api test -- worker-facade-service.test.ts`

### Task 1.3: Add typed settings facade service
- **File:** `apps/api/src/services/settings-service.ts`
- **Test:** `apps/api/src/services/settings-service.test.ts`
- **Depends:** 1.1
- Encapsulate `UserSettingsRepository` access plus JSON parsing/serialization for `selectedRepos` so handlers operate on typed arrays instead of raw DB strings.
- Normalize the browser contract to the fields the backend actually supports: `standupCron`, `reminderCron`, `recoveryCron`, `timezone`, `gitAuthor`, `gitSincePeriod`, `selectedRepos`, `active`, `snoozedUntil`, `cancelledDate`.
- Implement a "get or defaults" read path so first-time users can render a settings form before an upsert exists.
- **Verify:** `bun run --filter @standup/api test -- settings-service.test.ts`

### Task 1.4: Add dedicated standup approve facade service
- **File:** `apps/api/src/services/standup-approve-service.ts`
- **Test:** `apps/api/src/services/standup-approve-service.test.ts`
- **Depends:** none
- Mirror the Discord approve modal flow from `apps/discord-bot/src/discord/handlers/approve-modal-handler.ts` and `apps/discord-bot/src/discord/handlers/interaction-handler.ts`, but scoped to authenticated browser users.
- Implement the workflow as: load standup with ownership check -> optionally persist `customEntries` -> merge content via `mergeCustomEntries()` -> transition `pending_review -> approved` -> publish via a small extracted API-side Discord publisher helper -> best-effort `approved -> published`.
- Return structured results so the handler can distinguish success, publish failure after approval, invalid transition, and not found without re-encoding bot logic in Angular.
- **Verify:** `bun run --filter @standup/api test -- standup-approve-service.test.ts`

---

## Batch 2: Public API Facade Handlers

All tasks in this batch depend on Batch 1 and can be built in parallel because each file owns one route.

### Task 2.1: Wire Better Auth browser bootstrap contract
- **File:** `apps/web/src/app/services/session.service.ts`
- **Test:** `apps/web/src/app/services/session.service.spec.ts`
- **Depends:** 1.2
- Create the web auth/session foundation around the Better Auth browser client so Angular can resolve the current session, sign in with Discord, and sign out without inventing an API-owned bootstrap route prematurely.
- If implementation reveals we still need app-specific session metadata, add the smallest possible API helper at that point rather than by default.
- This task exists to lock the auth contract early before the rest of the Angular rewiring starts.
- **Verify:** `bun run --filter @standup/web test -- session.service.spec.ts`

### Task 2.2: Add `GET /settings/me`
- **File:** `apps/api/src/settings/get-me.ts`
- **Test:** `apps/api/src/settings/get-me.test.ts`
- **Depends:** 1.3
- Use the settings facade service to return either persisted settings or safe defaults for first login.
- The response envelope should be `{ data }` to match current API style and simplify Angular service parsing.
- Keep ownership implicit through the session user; never accept `userId` from the browser here.
- **Verify:** `bun run --filter @standup/api test -- settings/get-me.test.ts`

### Task 2.3: Add `PUT /settings/me`
- **File:** `apps/api/src/settings/put-me.ts`
- **Test:** `apps/api/src/settings/put-me.test.ts`
- **Depends:** 1.1, 1.3
- Validate the payload with Zod, enforce non-empty repo selection and required strings, then upsert via the settings facade service.
- Serialize `selectedRepos` before persistence and include `gitSincePeriod` in the allowed payload.
- Return `400` for validation problems and `{ data }` for success.
- **Verify:** `bun run --filter @standup/api test -- settings/put-me.test.ts`

### Task 2.4: Add `GET /repos`
- **File:** `apps/api/src/repos/list.ts`
- **Test:** `apps/api/src/repos/list.test.ts`
- **Depends:** 1.2
- Proxy the worker's `/internal/repos/list` via the worker facade service and expose a browser-safe `{ data: RepoInfo[] }` response.
- Keep this route authenticated because repo selection is part of the user settings workflow.
- Convert worker transport errors to `503` and keep partial worker results transparent if the worker already returns them.
- **Verify:** `bun run --filter @standup/api test -- repos/list.test.ts`

### Task 2.5: Add `POST /reminders/run-now`
- **File:** `apps/api/src/reminders/run-now.ts`
- **Test:** `apps/api/src/reminders/run-now.test.ts`
- **Depends:** 1.2, 1.3
- Resolve the authenticated user, load settings to get repo/git inputs, resolve Discord identity, and proxy the existing trigger flow instead of inventing new worker behavior.
- This route should return `202` with the same accepted semantics as `/standups/trigger`.
- Missing settings or no repos configured should remain `400` with actionable copy.
- **Verify:** `bun run --filter @standup/api test -- reminders/run-now.test.ts`

### Task 2.6: Add `POST /reminders/snooze` and `POST /reminders/cancel-today`
- **File:** `apps/api/src/reminders/snooze.ts`
- **Test:** `apps/api/src/reminders/snooze.test.ts`
- **Depends:** 1.2
- Implement the snooze public facade first in this file; it simply proxies the authenticated user id to worker and returns the worker acknowledgement payload.
- Create a sibling handler for cancel-today in the next task rather than combining both actions into one file, keeping the one-responsibility rule intact.
- **Verify:** `bun run --filter @standup/api test -- reminders/snooze.test.ts`

### Task 2.7: Add `POST /reminders/cancel-today` and `POST /standups/:id/approve`
- **File:** `apps/api/src/reminders/cancel-today.ts`
- **Test:** `apps/api/src/reminders/cancel-today.test.ts`
- **Depends:** 1.2
- This route mirrors Task 2.6 for the cancel action and keeps worker state changes behind the API boundary.
- In the same sequencing window, add the dedicated approve workflow route in `apps/api/src/standup/approve.ts` with its own test file `apps/api/src/standup/approve.test.ts`; that route depends on 1.4 and should validate optional custom entries payload before delegating to the approve service.
- The approve handler must map invalid transitions to `409`, missing standups to `404`, publish failure after approval to `200` with a warning field, and full success to `{ data }` with status `published` when the channel post succeeds.
- **Verify:** `bun run --filter @standup/api test -- reminders/cancel-today.test.ts && bun run --filter @standup/api test -- standup/approve.test.ts`

---

## Batch 3: API Bootstrap and Contract Wiring

These tasks depend on Batch 2 because they mount and verify the newly added handlers.

### Task 3.1: Wire new authenticated API routes into the bootstrap app
- **File:** `apps/api/src/index.ts`
- **Test:** `none` (verified through route tests and integration contract tests)
- **Depends:** 2.2, 2.3, 2.4, 2.5, 2.6, 2.7
- Extend auth protection beyond `/standups/*` so `/settings/*`, `/repos`, and `/reminders/*` use `sessionAuthMiddleware()` while keeping Better Auth and health routes public.
- Mount new handlers with the same env dependencies already available in `index.ts`; do not push business logic into bootstrap.
- Keep the existing `/standups/trigger` route intact because web adjust/regenerate flows reuse it.
- **Verify:** `bun run --filter @standup/api test`

### Task 3.2: Extend standup router with dedicated approve action
- **File:** `apps/api/src/standup/router.ts`
- **Test:** `apps/api/src/standup/update-status.test.ts` and new `apps/api/src/standup/approve.test.ts`
- **Depends:** 2.7
- Add `POST /standups/:id/approve` next to the existing list/detail/status/trigger routes.
- Keep `PATCH /standups/:id/status` for reject-only and state-machine-safe direct transitions; Angular should stop using it for publish/approve.
- **Verify:** `bun run --filter @standup/api test -- standup`

### Task 3.3: Add API->worker and browser-safe route contract coverage
- **File:** `apps/worker/src/integration/service-contracts.test.js`
- **Test:** same file
- **Depends:** 3.1, 3.2
- Extend the existing integration harness to cover API->worker repo listing and reminder proxies, plus one approve facade contract if publish is API-owned.
- Keep these tests at the HTTP boundary level: real Hono routers, mocked downstream services.
- This is the main regression net that proves the browser-safe facade matches worker/bot contracts.
- **Verify:** `bun run --filter @standup/worker test -- service-contracts.test.js`

### Task 3.4: Add API auth/session behavior coverage for new public routes
- **File:** `apps/api/src/auth/middleware.test.ts`
- **Test:** same file
- **Depends:** 3.1
- Expand middleware tests so unauthenticated browser requests to `/session`, `/settings/me`, `/repos`, and `/reminders/*` get `401`, while internal-secret bypass remains limited to service-to-service routes that still need it.
- This prevents accidentally exposing worker-proxy behavior without a session cookie.
- **Verify:** `bun run --filter @standup/api test -- auth/middleware.test.ts`

---

## Batch 4: Frontend Auth and Data Foundations

Do not start these tasks until Batch 3 is green, because they switch the Angular app from mocks to real contracts.

### Task 4.1: Align frontend standup/session/settings types to backend contracts
- **File:** `apps/web/src/app/types/standup.ts`
- **Test:** `apps/web/src/app/types/standup.spec.ts`
- **Depends:** 3.1, 3.2
- Expand status support to include `draft` and `published`, replace mock-only preview fields with shapes derived from the real API, and add browser-facing DTOs for session, settings, reminder acknowledgements, and approve responses.
- Keep view helpers separate from transport types inside the same file only if they are tightly coupled; otherwise prefer pure types/interfaces.
- **Verify:** `bun run --filter @standup/web test -- standup.spec.ts`

### Task 4.2: Add session bootstrap service and real auth-aware interceptor
- **File:** `apps/web/src/app/services/session.service.ts`
- **Test:** `apps/web/src/app/services/session.service.spec.ts`
- **Depends:** 3.1, 4.1
- Create a root service that wraps the Better Auth client session APIs, exposes `session`, `isAuthenticated`, `isLoading`, and a `redirectToLogin(returnUrl)` helper.
- Update `apps/web/src/app/interceptors/auth.interceptor.ts` and `apps/web/src/app/interceptors/auth.interceptor.spec.ts` in the same implementation stream to catch `401`, clear local session state, and route the browser back to `/login` while preserving return navigation.
- This replaces the current pass-through interceptor with real expired-session handling.
- **Verify:** `bun run --filter @standup/web test -- session.service.spec.ts auth.interceptor.spec.ts`

### Task 4.3: Replace placeholder route guard with session-aware guard
- **File:** `apps/web/src/app/guards/auth.guard.ts`
- **Test:** `apps/web/src/app/guards/auth.guard.spec.ts`
- **Depends:** 4.2
- Remove `FutureAuthService`; the guard should depend on the real session service and return either `true` or a `UrlTree` to `/login` with a `returnUrl` query param.
- Guard behavior must cover authenticated, unauthenticated, and bootstrap-loading cases without flickering into protected pages.
- **Verify:** `bun run --filter @standup/web test -- auth.guard.spec.ts`

### Task 4.4: Replace mock standup data service with typed API integration
- **File:** `apps/web/src/app/services/standup.service.ts`
- **Test:** `apps/web/src/app/services/standup.service.spec.ts`
- **Depends:** 3.2, 4.1
- Swap the hard-coded list resource for real `{ data }` parsing, add filter-aware fetches for dashboard use, and add methods for `reject`, `approve`, `adjust`, and `regenerate` that call the new API routes and `/standups/trigger` with the correct payloads.
- `approve()` must target the dedicated approve endpoint; `reject()` can keep using the status patch; `adjust()` uses `rewriteFromStandupId` plus `rewriteInstruction`; `regenerate()` uses `forceRegenerate` and optional extra context.
- Preserve `202` semantics by returning acknowledgement objects instead of pretending a new standup already exists.
- **Verify:** `bun run --filter @standup/web test -- standup.service.spec.ts`

### Task 4.5: Add settings/reminder API services and remove mock transport from app config
- **File:** `apps/web/src/app/services/settings.service.ts`
- **Test:** `apps/web/src/app/services/settings.service.spec.ts`
- **Depends:** 3.1, 4.1
- Add real settings and repo-loading resources plus save/reminder mutations; create a small sibling `apps/web/src/app/services/reminder.service.ts` with `apps/web/src/app/services/reminder.service.spec.ts` if keeping reminder actions separate makes call sites cleaner.
- Update `apps/web/src/app/app.config.ts` to remove `mockApiInterceptor` from the provider chain once the real services are in place.
- After this task, `apps/web/src/app/interceptors/mock-api.interceptor.ts` becomes dead code and should be deleted in the implementation branch after all dependent tests are updated.
- **Verify:** `bun run --filter @standup/web test -- settings.service.spec.ts reminder.service.spec.ts && bun run --filter @standup/web test`

---

## Batch 5: Angular Page Rewiring

These tasks depend on Batch 4 because every page now consumes real session/data services.

### Task 5.1: Protect and redirect routes with the real auth shell
- **File:** `apps/web/src/app/app.routes.ts`
- **Test:** `apps/web/src/app/app.routes.spec.ts`
- **Depends:** 4.2, 4.3
- Turn on `canActivate: [authGuard]` for `/dashboard`, `/standups/:id`, and `/settings`; keep `/login` public.
- Add a logged-in redirect from `/login` to `/dashboard` so session bootstrap does not strand authenticated users on the sign-in screen.
- **Verify:** `bun run --filter @standup/web test -- app.routes.spec.ts`

### Task 5.2: Wire login page to Discord OAuth entrypoint
- **File:** `apps/web/src/app/pages/login/login-page.ts`
- **Test:** `apps/web/src/app/pages/login/login-page.spec.ts`
- **Depends:** 4.2, 5.1
- Replace the static sign-in button with a click handler or anchor to `/auth/login/discord`, preserving `returnUrl` if present.
- If the session service says the user is already authenticated, redirect immediately to `/dashboard`.
- Keep the visual design intact; this task is behavior-only.
- **Verify:** `bun run --filter @standup/web test -- login-page.spec.ts`

### Task 5.3: Rewire dashboard to real API data and queued trigger feedback
- **File:** `apps/web/src/app/pages/dashboard/dashboard-page.ts`
- **Test:** `apps/web/src/app/pages/dashboard/dashboard-page.spec.ts`
- **Depends:** 4.4, 5.1
- Keep client-side search/filter presentation, but derive it from the real standup dataset returned by the API instead of the mock list semantics.
- Add UI feedback for `202` trigger acknowledgements, already-running/already-completed responses, and refresh after background actions.
- Metric counts must account for `published` separately from `approved` in presentation logic; choose whether to count published inside approved totals and document that in the component spec.
- **Verify:** `bun run --filter @standup/web test -- dashboard-page.spec.ts`

### Task 5.4: Rewire standup detail review actions to real workflows
- **File:** `apps/web/src/app/pages/standup-detail/standup-detail-page.ts`
- **Test:** `apps/web/src/app/pages/standup-detail/standup-detail-page.spec.ts`
- **Depends:** 4.4, 5.1
- Replace the fake approve/reject/regenerate buttons with the real action surface: approve (dedicated endpoint, optional custom entries UI), reject (status patch), adjust (rewrite instruction), regenerate (trigger accept flow), and copy/export affordances.
- Buttons must disable during in-flight mutations and show distinct feedback for `409`, `202`, publish warning, and success.
- The page should treat approval as a workflow result, not a blind local status flip.
- **Verify:** `bun run --filter @standup/web test -- standup-detail-page.spec.ts`

### Task 5.5: Rewire settings page to real settings, repo discovery, and reminder actions
- **File:** `apps/web/src/app/pages/settings/settings-page.ts`
- **Test:** `apps/web/src/app/pages/settings/settings-page.spec.ts`
- **Depends:** 4.5, 5.1
- Load `/settings/me` and `/repos` on init, bind Signal Forms to the backend-backed model, save via `PUT /settings/me`, and replace free-text repo entry with API-driven selectable repos while preserving the current visual language.
- Add buttons or command surfaces for `run now`, `snooze 15m`, and `cancel today`, each driven by the new public reminder routes.
- Surface validation problems from `400` responses inline near the form or action that caused them.
- **Verify:** `bun run --filter @standup/web test -- settings-page.spec.ts`

---

## Batch 6: Final Verification

These tasks confirm parity rather than adding new features.

### Task 6.1: Add one browser-facing happy-path flow test
- **File:** `apps/web/src/app/app.spec.ts`
- **Test:** same file
- **Depends:** 5.2, 5.3, 5.4, 5.5
- Expand the top-level app spec into a thin integration test that covers: authenticated bootstrap -> dashboard render -> settings load/save -> trigger acknowledgement -> standup detail action visibility.
- Keep downstream HTTP mocked at the Angular boundary; this is a shell regression test, not a full e2e suite.
- **Verify:** `bun run --filter @standup/web test -- app.spec.ts`

### Task 6.2: Run full parity verification across API and web
- **File:** `thoughts/shared/plans/2026-03-09-web-frontend-api-parity.md`
- **Test:** none
- **Depends:** 6.1
- Manual verification checklist:
  - log in via `/auth/login/discord`
  - load `/dashboard` with real `/session`
  - open `/settings`, load repos, save settings including `gitSincePeriod`
  - run reminder actions from the web UI and confirm worker DB mutations
  - trigger, reject, adjust, regenerate, and approve a standup from the browser
  - verify publish success and publish-failure warning semantics match Discord behavior
- Automated verification command set:
  - `bun run --filter @standup/api test`
  - `bun run --filter @standup/worker test -- service-contracts.test.js`
  - `bun run --filter @standup/web test`
  - `bun run ci`

---

## Verification Strategy

- **Repository layer:** prove `gitSincePeriod` persistence before any API contract depends on it.
- **API contract layer:** each new handler gets direct route tests for auth, ownership, validation, success, and error mapping.
- **Cross-service layer:** extend the existing worker integration contract test so API proxy routes are validated against the real worker Hono router shape.
- **Frontend service layer:** Angular service specs must assert `{ data }` envelopes, `202` accepted semantics, and `401` session-expiry handling.
- **Frontend page layer:** route guard, login redirect, settings save, reminder actions, and detail review buttons all need in-flight/disabled-state coverage.
- **End-to-end confidence:** finish with `bun run ci` plus a manual browser smoke test through the real API session and publish flow.

## Risks To Watch

- The approve flow is the highest-risk parity gap because the Discord bot currently owns custom-entry merge plus publish sequencing. Keep that orchestration server-side.
- Removing `mockApiInterceptor` too early will break most current Angular tests. Land service specs and app config changes together.
- `published` vs `approved` presentation can drift if dashboard metrics keep the old three-status assumptions. Update type-level and component-level assertions together.
- `/session` must stay minimal; if it starts mirroring Better Auth internals, the Angular app will become tightly coupled to an implementation detail again.
