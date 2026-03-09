---
date: 2026-03-09
topic: "Angular web frontend parity with API and bot"
status: validated
---

## Problem Statement

The Angular app in `apps/web` is visually built, but it still runs on mocked data and placeholder auth. We need the web frontend to cover the same user workflows already available through the API and Discord bot: authentication, settings, standup review, generation, rejection, approval, regeneration, and reminder actions.

The current blocker is not just frontend wiring. Several user-facing capabilities still exist only in Discord handlers or internal worker routes, so true parity requires a small API expansion layer in addition to Angular integration.

## Constraints

- Keep Better Auth as the source of truth for browser authentication and session cookies.
- Keep the worker and Discord bot architecture intact; the browser must never call worker internal routes with `x-internal-secret`.
- Preserve the existing standup state machine and only expose valid transitions from the UI.
- Reuse the Angular patterns already present in `apps/web`: standalone lazy routes, signals, `httpResource`, and Signal Forms.
- Do not duplicate business rules in the Angular app; API routes remain the policy boundary.
- Maintain the current non-fatal behavior for background outcomes like DM failure, no activity found, already running, and already completed.

## Approach

We will use an **API-first parity facade**.

That means the Angular app talks only to public API routes, while the API app grows a thin browser-safe surface for the features that currently live only in Discord or internal worker endpoints. This keeps auth, ownership checks, and orchestration centralized instead of leaking bot/worker details into the browser.

**Chosen approach:** expand the API with a small set of typed user-facing routes, then rewire the Angular app from mock data to real contracts.

I considered two alternatives and rejected both:

- **Direct browser-to-worker access:** rejected because it would expose internal-secret mechanics and break the current trust boundary.
- **Frontend-only parity using existing standup routes:** rejected because approval, settings CRUD, repo discovery, reminder actions, and rewrite workflows are not fully available through the current public API.

## Architecture

The architecture becomes a four-layer flow.

**Browser layer:** Angular handles session-aware navigation, data fetches, forms, optimistic local feedback, and review UX.

**API facade layer:** Hono exposes authenticated browser routes for session bootstrap, settings, standup actions, reminder actions, and repo discovery. This layer translates browser intent into the existing repositories and worker calls.

**Worker orchestration layer:** The worker remains responsible for generation, rewrite/regenerate jobs, repo discovery from Azure, reminder state changes, job locks, retries, and notification side effects.

**Bot/publish layer:** Discord keeps DM and channel publication responsibilities. The web UI does not replace Discord delivery; it adds a parallel user interface over the same data and actions.

## Components

The work breaks into three main slices.

**1. Auth and session shell**

- Replace the placeholder guard/interceptor with real session-aware behavior.
- Use the Better Auth browser client as the primary auth integration point for sign-in, session checks, and sign-out.
- Keep `/auth/login/discord` as the browser-safe entrypoint when we want server-controlled redirect behavior, but avoid inventing an app-specific session API unless we discover a real gap.
- Redirect unauthenticated users to `/login` and preserve return navigation.

**2. Standup workspace**

- Rewire dashboard and detail pages to real `/standups` contracts.
- Align Angular standup types to the backend shape, including `draft` and `published`.
- Replace fake regenerate behavior with the real trigger-based flow.
- Add a review action surface that supports approve, reject, adjust, regenerate, and copy/export.
- Surface async outcomes clearly because generation and publication are background operations.

**3. Settings and schedule management**

- Add browser-facing settings CRUD endpoints.
- Add browser-facing repo listing via API proxy to worker.
- Add browser-facing reminder endpoints for run now, snooze, and cancel today.
- Normalize the settings contract so Angular only renders fields that the backend truly supports.

## Data Flow

There are five core user journeys.

**Authentication**

- User lands on `/login`.
- Login action uses the Better Auth client social sign-in flow for Discord.
- Better Auth completes OAuth and establishes the session cookie.
- Angular boots by resolving the current session through the Better Auth client and uses that result for route protection and shell state.

**Dashboard and detail**

- Dashboard calls `GET /standups` with real filters.
- Detail calls `GET /standups/:id`.
- Angular derives client-side search and presentation state from the returned dataset instead of expecting backend search semantics that do not exist.

**Approve / reject / publish**

- Reject remains a status transition driven by the API.
- Approve should move behind a dedicated API action instead of a raw status patch, because the real flow may include custom entries, content adjustment, publish-to-Discord, and a final `published` transition.
- The UI should treat approval as a workflow result, not just a local state flip.

**Adjust / regenerate / run now**

- Adjust uses `POST /standups/trigger` with `rewriteFromStandupId` and `rewriteInstruction`.
- Regenerate uses `POST /standups/trigger` with `forceRegenerate` and optional `extraContext`, after marking the current item rejected when that behavior is desired.
- Run now uses the same trigger endpoint from settings/reminder surfaces.

**Settings and reminders**

- Angular loads current settings from `GET /settings/me`.
- Angular loads repo options from `GET /repos`.
- Save uses `PUT` or `PATCH /settings/me`.
- Reminder actions use public API endpoints that proxy the existing worker flows.

## Error Handling

The frontend should mirror the backend's real semantics instead of hiding them.

**Authentication errors:** `401` clears local session state, refreshes Better Auth session knowledge, and returns the user to `/login`.

**Validation errors:** `400` responses from trigger or settings save should show actionable copy, especially for missing settings, empty repo selection, or invalid rewrite input.

**Transition conflicts:** `409` on status changes should refresh the standup and show that the state changed elsewhere.

**Async acceptance:** `202` from trigger means the job was accepted, not completed. The UI should show queued/in-progress feedback and rely on refresh or polling rather than pretending a new standup already exists.

**Non-fatal background outcomes:** expose worker/bot outcomes in the UI where possible: already running, already completed today, no activity found, job failure, and publish failure. These should be visible as notifications or activity states, not silent failures.

## Testing Strategy

Testing should follow the same boundary split as the design.

**Angular tests**

- Update service tests to real response envelopes like `{ data }` and `202` acknowledgements.
- Add auth guard/interceptor tests for authenticated, unauthenticated, and expired-session flows.
- Add page tests for login redirect, settings load/save, repo selection, reminder actions, and review actions.
- Add mutation-state tests so buttons disable correctly during in-flight approve/reject/regenerate operations.

**API tests**

- Add contract tests for Better Auth-backed browser session behavior plus `/settings/me`, `/repos`, and reminder routes.
- Add workflow tests for approve/publish behavior if a new dedicated endpoint is introduced.
- Keep ownership and auth tests strict so browser users can only act on their own standups and settings.

**Integration tests**

- Extend service-contract tests to cover API -> worker repo proxy and reminder proxies.
- Add one end-to-end happy path for login -> configure settings -> trigger standup -> review -> publish.

## Open Questions

These are the only design decisions that still need a deliberate call before implementation starts.

- **Approve contract:** whether we keep approval as a composed frontend flow over existing routes or add a dedicated API endpoint that wraps custom entries, approve, and publish. I recommend the dedicated endpoint because it matches real bot behavior and avoids fragile frontend orchestration.
- **Settings contract cleanup:** whether `gitSincePeriod` should become a supported persisted field end-to-end or be removed from the web form for now. I recommend supporting it end-to-end because it already exists in schema and UI intent.
- **Notification visibility:** whether background outcomes should appear as transient toasts only or also as a durable activity feed in the dashboard. I recommend starting with toasts plus inline empty/error states, then adding a feed only if users need history.
