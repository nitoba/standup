# API Controller HTTP Tests Design

## Context

`apps/api` still has controller specs that instantiate controller classes
directly and call methods as plain functions. That bypasses the HTTP contract:

- request-to-response status mapping
- Nest pipes for params, queries, and DTO bodies
- `ValidationPipe` behavior configured in bootstrap
- the `@Session()` decorator behavior used by authenticated controllers

The user wants controller tests to exercise the HTTP layer with `supertest`
and the Nest testing module.

## Decision Summary

Controller specs in `apps/api/src` should use a shared HTTP test harness built
with `@nestjs/testing` and `supertest`.

The harness should:

- create a Nest application for the tested controller/module slice
- apply the same global `ValidationPipe` settings as `apps/api/src/main.ts`
- inject a fake authenticated session into `request.session`
- allow provider overrides per spec without booting the full app

## Scope

This migration covers every existing `*.controller.spec.ts` under
`apps/api/src`, currently:

- `contexts/preferences/me/me-settings.controller.spec.ts`
- `contexts/standups/approval/approve-standup.controller.spec.ts`
- `contexts/standups/events/standup-events.controller.spec.ts`
- `contexts/standups/query/standups-query.controller.spec.ts`
- `contexts/standups/status/standup-status.controller.spec.ts`
- `contexts/standups/trigger/trigger-standup.controller.spec.ts`
- `contexts/standups/worker/digests/digests.controller.spec.ts`
- `contexts/standups/worker/reminders/reminders.controller.spec.ts`
- `contexts/standups/worker/repos/repos.controller.spec.ts`

## Recommended Architecture

### Shared harness

Add a small shared helper under `apps/api/src/test/http/` that:

- accepts controllers, module imports, and providers
- builds a testing module with `Test.createTestingModule(...)`
- creates a Nest application backed by the default test HTTP adapter
- applies the project `ValidationPipe`
- installs middleware that reads a JSON session header and assigns it to
  `request.session`
- returns the app, `supertest`, and cleanup helpers

### Session injection

`@thallesp/nestjs-better-auth` resolves `@Session()` from `request.session`.
That makes session faking simple and explicit: tests can send a header such as
`x-test-session` with a serialized auth payload, and middleware can map that
header into `request.session`.

This keeps tests on the HTTP path without loading Better Auth or real auth
guards.

### Provider replacement

Each spec should compose a focused Nest module:

- import the relevant application module where it is lightweight and useful
- otherwise register only the controller plus mocked collaborators
- use provider overrides or direct test providers for services/repositories

This keeps tests close to controller contracts while avoiding unrelated
infrastructure such as database, Discord gateway, or scheduler startup.

## Controller Strategy

### Authenticated controllers

For `me-settings`, `trigger`, `query`, `status`, `approve`, `events`,
`reminders`, and `digests`:

- assert `401` when `x-test-session` is absent
- assert success and collaborator calls when the session header is present

### Controllers with pipes and DTOs

For `query`, `status`, `approve`, and `trigger`:

- validate parsing and coercion through HTTP requests
- cover invalid enum, UUID, and integer inputs with HTTP status assertions
- cover body validation through the configured global `ValidationPipe`

### Controllers without auth

For `repos`:

- assert success payloads and `503` mapping from domain/service errors

### SSE controller

For `standup-events`:

- assert unauthorized access with `401`
- assert successful HTTP response and `text/event-stream` content type
- keep the bus mocked; the controller test should verify handshake and
  subscription usage, not long-lived transport semantics

## File Impact

### New

- `apps/api/src/test/http/create-controller-http-test-app.ts`

### Modified

- `apps/api/package.json`
- all controller specs listed in Scope

## Testing Strategy

Follow TDD:

1. write or rewrite one controller spec against the new harness
2. run it and watch it fail for the expected reason
3. add the minimal harness implementation
4. migrate the remaining controller specs incrementally
5. run targeted controller specs, then the full `apps/api` test suite

## Risks and Controls

- Risk: tests silently stop covering validation
  Control: explicitly assert HTTP statuses for invalid params/query/body values

- Risk: session mocking diverges from the actual decorator contract
  Control: rely on `request.session`, which is exactly what the decorator reads

- Risk: repeated setup makes specs noisy
  Control: centralize bootstrap and authenticated request helpers in one shared
  utility
