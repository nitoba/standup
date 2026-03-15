# API Contexts Reorganization Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorganize `apps/api/src` so top-level ownership matches `contexts`, `interfaces`, and `platform`, while preserving existing runtime behavior.

**Architecture:** This migration is a physical ownership refactor. Move files into the new top-level zones first, preserve existing internal service/controller behavior, and only absorb `WorkerModule` into `StandupsModule` once the module boundaries are physically under the standups context. Keep `shared/domain`, `shared/auth`, `shared/repos`, and `shared/openapi` in place for now.

**Tech Stack:** Bun, TypeScript, NestJS 11, Vitest, Biome

---

## Chunk 1: Reorg Smoke Guard

### Task 1: Add a failing smoke test for the new top-level entrypoints

**Files:**
- Create: `apps/api/src/app/api-structure.spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";

describe("API structure", () => {
  it("exposes the new top-level Nest entrypoints", async () => {
    const modules = await Promise.all([
      import("../contexts/identity/identity.module"),
      import("../contexts/preferences/preferences.module"),
      import("../contexts/standups/standups.module"),
      import("../interfaces/discord/discord.module"),
      import("../interfaces/email/email.module"),
      import("../platform/database/database.module"),
      import("../platform/env/env.module"),
      import("../platform/events/events.module"),
      import("../platform/http/http.module"),
      import("../platform/logger/logger.module"),
      import("../platform/observability/observability.module"),
      import("../platform/time/time.module"),
    ]);

    expect(modules).toHaveLength(12);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run --cwd apps/api vitest run src/app/api-structure.spec.ts`
Expected: FAIL with missing modules under `contexts`, `interfaces`, and `platform`

## Chunk 2: Platform Migration

### Task 2: Move shared infrastructure entrypoints under `platform`

**Files:**
- Move: `apps/api/src/shared/module/database/*` -> `apps/api/src/platform/database/*`
- Move: `apps/api/src/shared/module/env/*` -> `apps/api/src/platform/env/*`
- Move: `apps/api/src/shared/module/events/*` -> `apps/api/src/platform/events/*`
- Move: `apps/api/src/shared/module/http/*` -> `apps/api/src/platform/http/*`
- Move: `apps/api/src/shared/module/logger/*` -> `apps/api/src/platform/logger/*`
- Move: `apps/api/src/shared/module/observability/*` -> `apps/api/src/platform/observability/*`
- Move: `apps/api/src/shared/time/*` -> `apps/api/src/platform/time/*`
- Modify: `apps/api/src/**/*.ts` imports pointing at `shared/module/*` and `shared/time/*`

- [ ] **Step 1: Move the directories without changing file contents**
- [ ] **Step 2: Update import paths across `apps/api/src`**
- [ ] **Step 3: Run the smoke test**

Run: `bun run --cwd apps/api vitest run src/app/api-structure.spec.ts`
Expected: still FAIL, but only for missing `contexts/*` and `interfaces/*` modules

- [ ] **Step 4: Run focused verification**

Run: `bun run --cwd apps/api test src/shared/module/http/filters/global-exception.filter.spec.ts`
Expected: PASS

## Chunk 3: Identity, Preferences, and Interfaces

### Task 3: Move auth/settings/email/discord into their new top-level zones

**Files:**
- Move: `apps/api/src/modules/auth/*` -> `apps/api/src/contexts/identity/*`
- Move: `apps/api/src/modules/settings/*` -> `apps/api/src/contexts/preferences/*`
- Move: `apps/api/src/modules/email/*` -> `apps/api/src/interfaces/email/*`
- Move: `apps/api/src/modules/discord/*` -> `apps/api/src/interfaces/discord/*`
- Modify: `apps/api/src/app.module.ts`
- Modify: `apps/api/src/main.ts`
- Modify: `apps/api/src/shared/openapi/create-openapi-document.ts`
- Modify: imports referencing the moved files

- [ ] **Step 1: Rename module entry files/classes**
  - `auth.module.ts` -> `identity.module.ts`, class `StandupAuthModule` -> `IdentityModule`
  - `settings.module.ts` -> `preferences.module.ts`, class `SettingsModule` -> `PreferencesModule`
  - Keep `DiscordModule` and `EmailModule` class names

- [ ] **Step 2: Update imports across the codebase**
- [ ] **Step 3: Run the smoke test**

Run: `bun run --cwd apps/api vitest run src/app/api-structure.spec.ts`
Expected: still FAIL only for `contexts/standups/*`

- [ ] **Step 4: Run focused verification**

Run: `bun run --cwd apps/api vitest run src/contexts/preferences/me/me-settings.service.spec.ts src/interfaces/discord/services/discord-service-health.service.spec.ts`
Expected: PASS

## Chunk 4: Standups Context Consolidation

### Task 4: Move standups ownership under `contexts/standups`

**Files:**
- Move: `apps/api/src/modules/standups/*` -> `apps/api/src/contexts/standups/*`
- Move: `apps/api/src/modules/worker/*` -> `apps/api/src/contexts/standups/worker/*`
- Modify: `apps/api/src/contexts/standups/standups.module.ts`
- Modify: `apps/api/src/app.module.ts`
- Modify: imports referencing the moved files

- [ ] **Step 1: Move the directories and update imports**
- [ ] **Step 2: Make `StandupsModule` import `WorkerModule`**
- [ ] **Step 3: Remove the direct `WorkerModule` import from `AppModule`**
- [ ] **Step 4: Run the smoke test**

Run: `bun run --cwd apps/api vitest run src/app/api-structure.spec.ts`
Expected: PASS

- [ ] **Step 5: Run targeted context tests**

Run: `bun run --cwd apps/api vitest run src/contexts/standups/trigger/trigger-standup.service.spec.ts src/contexts/standups/worker/standup/standup-dispatch.service.spec.ts`
Expected: PASS

## Chunk 5: Final Verification

### Task 5: Verify the whole API after the physical reorganization

**Files:**
- Modify: `apps/api/src/app.module.ts` as needed to keep imports coherent
- Modify: any remaining import paths found by typecheck or test failures

- [ ] **Step 1: Run typecheck**

Run: `bun run --cwd apps/api typecheck`
Expected: PASS

- [ ] **Step 2: Run API tests**

Run: `bun run --cwd apps/api test`
Expected: PASS

- [ ] **Step 3: Run lint if imports or formatting changed broadly**

Run: `bun run --cwd apps/api lint`
Expected: PASS
