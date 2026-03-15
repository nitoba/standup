# API Controller HTTP Tests Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate all `apps/api` controller specs from direct method calls to real HTTP tests using `supertest` and the Nest testing module.

**Architecture:** Build a shared controller-test harness that boots a focused Nest app, applies the same global validation settings as production, and injects fake session data through `request.session`. Then migrate every controller spec to HTTP requests with mocked collaborators and status/payload assertions.

**Tech Stack:** Bun, TypeScript, NestJS 11, `@nestjs/testing`, `supertest`, Vitest

---

## Chunk 1: Test Harness Foundation

### Task 1: Add the shared HTTP controller test bootstrap

**Files:**
- Create: `apps/api/src/test/http/create-controller-http-test-app.ts`
- Modify: `apps/api/package.json`

- [ ] **Step 1: Add a failing controller spec that expects HTTP behavior**

Use one existing controller spec with authentication and validation, preferably
`apps/api/src/contexts/standups/query/standups-query.controller.spec.ts`, and
rewrite one test to use `supertest` before the harness exists.

- [ ] **Step 2: Run the focused spec to verify it fails**

Run: `bun run --cwd apps/api vitest run src/contexts/standups/query/standups-query.controller.spec.ts`
Expected: FAIL because the shared HTTP test helper and/or `supertest` setup do not exist yet

- [ ] **Step 3: Add `supertest` support and the minimal shared harness**

The helper must:

- create a `TestingModule`
- create a Nest application
- apply the global `ValidationPipe`
- install middleware that maps `x-test-session` into `request.session`
- expose a `request(app.getHttpServer())` client and cleanup

- [ ] **Step 4: Re-run the focused spec**

Run: `bun run --cwd apps/api vitest run src/contexts/standups/query/standups-query.controller.spec.ts`
Expected: PASS

## Chunk 2: Authenticated Controller Migration

### Task 2: Migrate the authenticated controller specs

**Files:**
- Modify: `apps/api/src/contexts/preferences/me/me-settings.controller.spec.ts`
- Modify: `apps/api/src/contexts/standups/approval/approve-standup.controller.spec.ts`
- Modify: `apps/api/src/contexts/standups/events/standup-events.controller.spec.ts`
- Modify: `apps/api/src/contexts/standups/query/standups-query.controller.spec.ts`
- Modify: `apps/api/src/contexts/standups/status/standup-status.controller.spec.ts`
- Modify: `apps/api/src/contexts/standups/trigger/trigger-standup.controller.spec.ts`
- Modify: `apps/api/src/contexts/standups/worker/digests/digests.controller.spec.ts`
- Modify: `apps/api/src/contexts/standups/worker/reminders/reminders.controller.spec.ts`

- [ ] **Step 1: Migrate unauthorized-path tests to HTTP `401` assertions**
- [ ] **Step 2: Migrate success-path tests to HTTP requests with `x-test-session`**
- [ ] **Step 3: Add assertions for collaborator calls and HTTP payloads**
- [ ] **Step 4: Preserve controller-specific error mapping**
  - `reminders/run-now` should assert `400` on validation/domain error
  - `standup-events` should assert SSE content type on success

- [ ] **Step 5: Run the migrated authenticated controller specs**

Run: `bun run --cwd apps/api vitest run src/contexts/preferences/me/me-settings.controller.spec.ts src/contexts/standups/approval/approve-standup.controller.spec.ts src/contexts/standups/events/standup-events.controller.spec.ts src/contexts/standups/query/standups-query.controller.spec.ts src/contexts/standups/status/standup-status.controller.spec.ts src/contexts/standups/trigger/trigger-standup.controller.spec.ts src/contexts/standups/worker/digests/digests.controller.spec.ts src/contexts/standups/worker/reminders/reminders.controller.spec.ts`
Expected: PASS

## Chunk 3: Non-Auth Controller Migration and Validation Coverage

### Task 3: Migrate the remaining controller spec and strengthen HTTP coverage

**Files:**
- Modify: `apps/api/src/contexts/standups/worker/repos/repos.controller.spec.ts`
- Modify: `apps/api/src/contexts/standups/query/standups-query.controller.spec.ts`
- Modify: `apps/api/src/contexts/standups/status/standup-status.controller.spec.ts`

- [ ] **Step 1: Migrate `repos.controller.spec.ts` to HTTP `200`/`503` assertions**
- [ ] **Step 2: Add invalid-input HTTP assertions where pipes matter most**
  - invalid UUID for standup id routes
  - invalid `status` query enum
  - invalid `page` or `pageSize` query values where useful

- [ ] **Step 3: Run the focused validation-sensitive specs**

Run: `bun run --cwd apps/api vitest run src/contexts/standups/query/standups-query.controller.spec.ts src/contexts/standups/status/standup-status.controller.spec.ts src/contexts/standups/worker/repos/repos.controller.spec.ts`
Expected: PASS

## Chunk 4: Full Verification

### Task 4: Verify the API package after the migration

**Files:**
- Modify: any spec or helper files needed to fix failures uncovered by verification

- [ ] **Step 1: Run all API tests**

Run: `bun run --cwd apps/api test`
Expected: PASS

- [ ] **Step 2: Run API typecheck**

Run: `bun run --cwd apps/api typecheck`
Expected: PASS

- [ ] **Step 3: Run API lint if formatting or imports changed broadly**

Run: `bun run --cwd apps/api lint`
Expected: PASS
