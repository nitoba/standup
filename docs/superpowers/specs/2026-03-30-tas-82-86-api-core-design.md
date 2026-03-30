# TAS-82 to TAS-86 API/Core Design

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the backend/core improvements from TAS-82 through TAS-86 with minimal, local changes that reduce configuration drift, remove duplicated auth session types, improve user-facing service errors, and make readiness checks reflect real dependency state.

**Architecture:** This work stays inside the current monolith boundaries. We update existing files in place, reuse shared types/helpers already present in the codebase, and avoid introducing any new framework, subsystem, or broad refactor. Health/readiness remains split into liveness (`/health`) and dependency readiness (`/ready`).

**Tech Stack:** Turbo, NestJS 11, Hono adapter, Drizzle ORM, Better Auth, discord.js, TypeScript strict mode.

---

## Scope

Included:
- `TAS-82` Clean `turbo.json` `globalEnv` from env vars of the old multi-process architecture
- `TAS-83` Externalize large prompt templates from `StandupPromptService`
- `TAS-84` Unify duplicated inline `AuthSession` types
- `TAS-85` Preserve actionable `ExternalServiceError` messages in HTTP translation
- `TAS-86` Make `/ready` check real dependencies instead of returning a static payload

Excluded:
- Any UI/dashboard/settings changes from `TAS-87` onward
- Any new prompt templating engine or runtime prompt editing system
- Any broader auth/session refactor beyond using the existing shared type/helper

---

## File Design

### `turbo.json`
Responsibility: declare monorepo cache inputs and globally relevant env vars.

Change:
- Remove envs tied to the old multi-process/internal-HTTP architecture such as `INTERNAL_SECRET`, `WORKER_INTERNAL_URL`, `BOT_INTERNAL_URL`, `BOT_INTERNAL_PORT`, `WORKER_INTERNAL_PORT`
- Keep or add envs that materially affect builds/tasks in the current architecture

Design rule:
- `globalEnv` should describe the active monolith, not preserve dead architecture history

### `apps/api/src/contexts/standups/worker/standup-generator/standup-prompt.service.ts`
Responsibility today: build all prompt strings inline.

Change:
- Replace large inline prompt bodies with small loader/helper calls reading static prompt files from a colocated directory
- Keep meeting-type selection and interpolation logic in TypeScript
- Ensure prompt files are copied into `dist` during `nest build`

New files:
- `apps/api/src/contexts/standups/worker/standup-generator/prompts/*.md`
- A tiny helper, if needed, to load prompt files once and cache them in memory

Build/runtime contract:
- Add `compilerOptions.assets` in `apps/api/nest-cli.json` so prompt files are copied into the compiled output
- Resolve prompt file paths relative to the compiled module location so the same code works in dev and in `dist`

Design rule:
- Externalize content, not behavior. We are not introducing a prompt engine.

### `apps/api/src/shared/auth/auth-session.ts`
Responsibility: single source of truth for authenticated session shape.

Change:
- Reuse this type everywhere instead of redefining it inline

Files to update:
- `trigger-standup.service.ts`
- `standup-events.controller.ts`
- Any other file in the same pattern if encountered during implementation (for example reminders controller)

### `apps/api/src/contexts/standups/shared/throw-standup-http-error.ts`
Responsibility: translate domain errors to Nest HTTP exceptions.

Change:
- For `ExternalServiceError`, preserve only a curated public/user-safe message instead of always returning `Service unavailable`
- Keep HTTP status as `503`

Design rule:
- Preserve actionable messages, but do not leak raw infra internals, upstream payloads, or stack details
- If the current `ExternalServiceError.message` is not guaranteed safe, introduce a dedicated `publicMessage` (or equivalent small-field contract) instead of blanket-exposing every raw message

### `apps/api/src/platform/http/controllers/health.controller.ts`
Responsibility:
- `/health` = liveness
- `/ready` = readiness

Change:
- Keep `/health` simple
- Make `/ready` perform a DB connectivity check
- When Discord gateway is enabled, include/validate only Discord gateway readiness

Dependencies:
- `DatabaseService` for DB ping
- A narrow Discord-gateway readiness abstraction, or `DiscordMessagesService.isReady()` directly

Design rule:
- Readiness should fail only when the API cannot actually serve traffic correctly
- `/ready` must not depend on worker/scheduler/repo-path checks because those are not API-process readiness concerns

---

## Behavior Design

### TAS-82: Turbo Env Cleanup

Target behavior:
- Turbo cache keys reflect the current runtime architecture only
- Removing dead envs should not change runtime behavior, only reduce stale invalidation inputs and config confusion

Implementation direction:
- Audit the current `globalEnv`
- Remove legacy internal-service vars
- Add only envs that impact build/test/typecheck behavior in the monolith

### TAS-83: Prompt Externalization

Target behavior:
- Prompt text is easy to iterate on without editing large TypeScript string literals
- Runtime behavior remains identical except for copy fixes intentionally included
- Prompt loading works both from source and from compiled `dist`

Implementation direction:
- Store prompt bodies as `.md` or `.txt`
- Load them once, cache in module scope or service instance
- Keep interpolation placeholders in TypeScript, not inside a generic template engine
- Update Nest asset config so prompt files are emitted during build

### TAS-84: Unified AuthSession Type

Target behavior:
- No duplicated inline `AuthSession` types
- If session shape changes later, one shared type updates all call sites

Implementation direction:
- Import the shared type in affected files
- Prefer existing helper `requireSessionUserId` where appropriate rather than repeated manual null checks

### TAS-85: External Service Error Translation

Target behavior:
- User receives a useful `503` message when the failure is already intentionally user-facing
- Example: Discord not configured should remain understandable in HTTP responses
- Unsafe/raw provider details must still collapse to a generic safe fallback

Implementation direction:
- `throwStandupHttpError()` uses a curated public message from `ExternalServiceError`
- If no curated public message exists, keep the generic `Service unavailable`
- No stack traces, causes, or sensitive machine details are exposed

### TAS-86: Real Readiness

Target behavior:
- `/health` stays cheap and always available for liveness probes
- `/ready` fails when DB is unavailable
- `/ready` reflects Discord readiness only when `DISCORD_GATEWAY_ENABLED=true`
- `/ready` must not fail on Discord when the gateway is intentionally disabled by config
- `/ready` must not depend on scheduler/worker/repo-path health

Implementation direction:
- DB check: a minimal query (`SELECT 1` or equivalent through Drizzle)
- Discord check: use only a gateway-ready signal, not the broader multi-service dashboard checker
- Response should remain compact and machine-readable

Response contract:
- `200`: `{ status: 'ready', database: 'ok', discord: 'ok' | 'disabled' }`
- `503`: `{ status: 'not_ready', database: 'error' | 'ok', discord: 'error' | 'disabled' }`

---

## Error Handling

- Prompt file loading errors should fail fast during startup or first use with a clear internal error, not silently degrade
- `/ready` should return non-2xx when a required dependency is unavailable
- `ExternalServiceError` translation must remain sanitized and user-safe
- Unified auth-session typing should not change runtime behavior, only remove drift risk

---

## Testing Design

### TAS-82
- No dedicated runtime tests required unless current repo already tests `turbo.json`
- Verify by lint/typecheck and ensuring no task config regression

### TAS-83
- Add/update unit tests around `StandupPromptService` to ensure generated prompts still contain expected sections and interpolated data
- Add a loader-level test that verifies prompt file loading works through the helper used in production

### TAS-84
- Type-level refactor; verify through typecheck and any affected unit tests

### TAS-85
- Add/update tests for `throwStandupHttpError()` to assert a curated public `ExternalServiceError` message is preserved in the thrown `ServiceUnavailableException`
- Add a companion test showing an unsafe/raw external-service message still falls back to generic `503`

### TAS-86
- Add/update controller/service tests covering:
  - DB healthy => `/ready` reports ready
  - DB failing => `/ready` reports not ready / throws appropriately
  - Discord enabled but not ready => `/ready` returns `503`
  - Discord disabled => `/ready` remains ready if DB is healthy

Global verification:
- `bun run lint`
- `bun run typecheck`
- relevant `bun run test --run` suites for touched API files

---

## Risks And Mitigations

### Prompt path/loading regressions
Mitigation:
- Keep files colocated with the service
- Use a tiny loader with deterministic paths
- Cover with prompt service tests

### Readiness becoming too strict
Mitigation:
- Only fail on dependencies that are truly required under the active config
- Treat disabled Discord gateway as “not applicable”, not “not ready”

### User-facing service errors becoming too verbose
Mitigation:
- Preserve only curated `ExternalServiceError.message`
- Do not expose raw exception objects or stack traces

---

## Recommended Implementation Order

1. `TAS-84` unify `AuthSession` type
2. `TAS-85` improve `ExternalServiceError` HTTP translation
3. `TAS-86` real readiness checks
4. `TAS-82` clean `turbo.json`
5. `TAS-83` externalize prompt templates last, since it touches the largest file

This order front-loads the smallest, safest behavior improvements and leaves the content refactor for the end.
