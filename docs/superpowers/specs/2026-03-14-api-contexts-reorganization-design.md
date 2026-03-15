# API Contexts Reorganization Design

## Context

This document proposes a logical reorganization of `apps/api` so the top-level
structure reflects bounded contexts and functional ownership instead of mixing
business capabilities with technical mechanisms.

The current structure already has useful building blocks, especially internal
events for decoupling, but it mixes three different concerns at the same level:

- business contexts such as standups and user settings
- technical interfaces such as Discord
- operational mechanisms such as scheduler, background jobs, and pipelines

The main symptom is `modules/worker`, which currently acts as an umbrella for
multiple unrelated responsibilities:

- standup generation orchestration
- scheduler and recovery flows
- reminders
- weekly digest execution
- git collection
- Azure DevOps enrichment
- LLM generation support

`modules/standups` has the correct domain name, but it does not fully own the
standup lifecycle. A meaningful part of the business flow lives under
`modules/worker`.

## Goals

- Make top-level folders reflect business contexts
- Keep the organization pragmatic for NestJS
- Preserve internal event-based decoupling where it adds value
- Move the main standup lifecycle under the standups context
- Reframe Discord, email, HTTP, SSE, and scheduler as interfaces/adapters
- Avoid ceremonial Clean Architecture layers where they do not clarify ownership

## Non-goals

- Rewriting the domain model
- Introducing excessive ports/adapters between classes in the same process
- Replacing every internal call with events
- Changing runtime behavior as part of the first reorganization step

## Current Reading

### What works today

- `standups` already represents a meaningful business concept
- event-driven reactions are used to decouple side effects
- the codebase already separates some infra concerns into `shared/module`
- the main use cases are explicit in code, even if physically split

### Main structural issues

1. `worker` is not a bounded context. It is an operational bucket.
2. `standups` is under-scoped relative to the real product lifecycle.
3. technical interfaces and business contexts compete at the same top level.
4. event names currently mix domain facts, internal commands, and technical
   dispatch semantics.

## Recommended Top-Level Organization

The API should be organized into three explicit zones:

```text
apps/api/src/
  contexts/
  interfaces/
  platform/
  shared/
```

### `contexts/`

Contains business capabilities and application orchestration.

Recommended contexts:

- `identity`
- `preferences`
- `standups`
- optionally `notifications` if cross-channel notification logic becomes large

### `interfaces/`

Contains adapters that expose or receive behavior through a channel:

- `http`
- `discord`
- `email`
- scheduler-facing triggers when they are only transport/adapter code

### `platform/`

Contains technical foundations shared across contexts:

- database
- env
- events
- logger
- observability
- time
- common HTTP infrastructure

### `shared/`

Only for small cross-context helpers that are not platform infrastructure and
not owned by a single context. Keep this small.

## Recommended Bounded Contexts

### `identity`

Owns:

- authentication
- session inspection
- provider identity linking

Current candidates:

- `modules/auth/*`

Suggested note:

The existing name `auth` is technically valid, but `identity` is a better
context name if the module continues to own Discord account linkage and related
user identity concerns.

### `preferences`

Owns:

- user-specific standup preferences
- cron preferences
- timezone
- selected repositories
- reminder and digest preferences

Current candidates:

- `modules/settings/*`

Suggested note:

`settings` is generic. `preferences` better reflects that these values are user
rules driving standup behavior, not system-wide configuration.

### `standups`

This is the central context of the product and should own the full standup
lifecycle:

- trigger
- collect activity
- enrich activity
- generate standup
- regenerate and adjust
- save draft
- review readiness
- approve and reject
- publish
- reminders
- weekly digest
- query and status APIs for standup records

Current candidates:

- `modules/standups/*`
- `modules/worker/standup/*`
- `modules/worker/reminders/*`
- `modules/worker/digests/*`
- `modules/worker/git-collector/*`
- `modules/worker/azure-devops/*`
- `modules/worker/standup-generator/*`

Suggested note:

The problem is not the name `standups`. The problem is that `standups` does not
yet own enough of the domain it names.

### `notifications` (optional)

Only create this as a distinct context if notification composition and delivery
grow beyond a thin adapter concern.

Possible ownership:

- notification intent modeling
- message composition policies that are reused across channels

If it remains small, keep delivery adapters in `interfaces/discord` and
`interfaces/email` and keep the notification intent inside `standups`.

## Recommended Folder Structure

```text
apps/api/src/
  contexts/
    identity/
      identity.module.ts
      application/
      infrastructure/
      interfaces/http/

    preferences/
      preferences.module.ts
      application/
      infrastructure/
      interfaces/http/

    standups/
      standups.module.ts

      domain/
        errors/
        events/
        policies/
        value-objects/

      application/
        trigger/
        generate/
        adjust/
        regenerate/
        approve/
        publish/
        query/
        reminders/
        digests/

      infrastructure/
        persistence/
        collection/
          git/
          azure-devops/
        generation/
        delivery/

      interfaces/
        http/
        sse/
        scheduler/

  interfaces/
    discord/
      discord.module.ts
      gateway/
      commands/
      interactions/
      presenters/
      mappers/

    email/
      email.module.ts
      delivery/
      templates/

  platform/
    database/
    env/
    events/
    http/
    logger/
    observability/
    time/

  shared/
    auth/
    repos/
```

## Mapping from the Current Structure

### Move under `contexts/standups`

- `modules/standups/*`
- `modules/worker/standup/*`
- `modules/worker/reminders/*`
- `modules/worker/digests/*`
- `modules/worker/git-collector/*`
- `modules/worker/azure-devops/*`
- `modules/worker/standup-generator/*`

### Move under `contexts/preferences`

- `modules/settings/*`

### Move under `contexts/identity`

- `modules/auth/*`

### Move under `interfaces/discord`

- `modules/discord/*`

### Move under `interfaces/email`

- `modules/email/*`

### Move under `platform`

- `shared/module/database/*`
- `shared/module/env/*`
- `shared/module/events/*`
- `shared/module/http/*`
- `shared/module/logger/*`
- `shared/module/observability/*`
- `shared/time/*`

## Events and Relationships

### Core rule

Business contexts publish domain facts. Interfaces translate inbound intentions
and react to outbound facts.

### What `standups` should publish

Examples of standup-owned domain events:

- `standup.triggered`
- `standup.generation-started`
- `standup.progressed`
- `standup.generated`
- `standup.ready-for-review`
- `standup.approved`
- `standup.rejected`
- `standup.published`
- `standup.reminder-requested`
- `standup.digest-generated`
- `standup.generation-failed`

These events belong to the standups context because they describe lifecycle
facts of the main product capability.

### What interfaces should do

Interfaces should not own business flow. They should:

- receive a user or system intention
- call a use case in the correct context
- react to published domain events

Examples:

- HTTP trigger endpoint calls the standup trigger use case
- Discord slash command calls the same trigger use case
- scheduler adapter calls the due standup execution use case
- SSE adapter subscribes to standup lifecycle events and streams them

### Where the current event taxonomy is weak

Events such as these reflect technical module ownership more than business
language:

- `WORKER_REPOS_REQUESTED_EVENT`
- `WORKER_REMINDER_ACTION_REQUESTED_EVENT`
- `STANDUP_JOB_DISPATCH_REQUESTED_EVENT`

Recommended replacement strategy:

- use direct application-service calls inside the same context when appropriate
- use explicit commands for inbound intentions
- reserve events for facts and asynchronous reactions

### Scheduler ownership

Scheduler code should be treated as a time-based adapter, not a domain owner.

The current scheduler both detects due work and contains business-flavored
coordination. In the target structure:

- scheduler determines when something is due
- standups application services decide how reminder, recovery, and idempotency
  work

## Integration Boundaries

The target organization should make these boundaries explicit:

- `contexts/standups` owns standup lifecycle orchestration and depends on
  platform services plus its own infrastructure folders
- `contexts/preferences` owns user automation preferences and exposes them to
  standups as application data, not as a transport concern
- `contexts/identity` owns authenticated identity and external account linkage
- `interfaces/discord` translates Discord interactions into context use case
  calls and reacts to standup events
- `interfaces/email` translates delivery requests into SMTP/email rendering
- `platform/events` remains the common mechanism for event publication and
  subscription, but event ownership belongs to the publishing context

The key architectural rule is that adapters initiate or reflect behavior, but
they do not define where that behavior belongs.

## Error Handling and Resilience

The reorganization should preserve the current resilience patterns, but move
their ownership to the correct context:

- idempotency for standup generation remains a standups concern
- distributed lock and recovery behavior remain in standups application logic,
  even if triggered by scheduler adapters
- failures in Discord DM or email delivery remain non-fatal when the main
  standup or digest record was already persisted
- standup generation retries remain attached to the standup generation use case,
  not to a generic worker module

Practical implication:

- adapters may log and surface channel-specific failures
- contexts decide whether a failure changes domain state or is only a failed
  side effect

This keeps operational safety without letting technical modules become business
owners.

## Practical NestJS Guidance

This reorganization should stay pragmatic:

- use top-level modules for real contexts or adapters
- use subfolders before introducing many extra Nest modules
- only split into submodules when a context becomes operationally too large
- keep one main responsibility per file

Recommended posture:

- organize by context first
- organize by use case second
- only then separate technical details beneath that

## Anti-patterns to Avoid

- recreating `worker` under a different generic name such as `automation` or
  `jobs`
- keeping `standups` as only HTTP query/status while the real lifecycle lives
  elsewhere
- letting Discord become the owner of standup review and publication logic
- using events as a universal replacement for direct calls
- introducing ports and interfaces between classes that live in the same
  process and same context without a real boundary reason
- reorganizing the top level by technical type such as controllers, services,
  repositories

## Testing Implications

The new structure should improve test clarity rather than expand test surface
area arbitrarily.

Recommended testing posture:

- unit tests for standup application services by use case
- unit tests for infrastructure adapters such as git collection, Azure DevOps,
  and generation services
- unit tests for Discord and HTTP adapters focused on translation and side
  effects
- integration-style tests only at context seams where event publication,
  persistence, or scheduler triggering must be verified together

The practical benefit is that test ownership becomes easier to reason about:

- if a test validates standup lifecycle behavior, it belongs under
  `contexts/standups`
- if a test validates Discord interaction mapping, it belongs under
  `interfaces/discord`
- if a test validates shared technical bootstrapping, it belongs under
  `platform`

## Incremental Migration Sequence

1. Create the new top-level structure without changing behavior.
2. Move clearly standup-owned code under `contexts/standups`.
3. Move settings into `contexts/preferences`.
4. Move auth into `contexts/identity`.
5. Reframe Discord and email as interface adapters.
6. Move `shared/module/*` into `platform/*`.
7. Only after physical ownership is clear, simplify event names and internal
   request/reply flows.
8. Remove `WorkerModule` after its contents have been fully redistributed.

## Decision Summary

- Keep `standups` as the main domain context
- Remove `worker` as a top-level domain module
- Rename `settings` to `preferences`
- Optionally rename `auth` to `identity`
- Treat Discord, email, HTTP, SSE, and scheduler as adapters/interfaces
- Keep events for decoupled reactions, but reduce technical request-style events

## Expected Outcome

After this reorganization:

- the top-level tree will match the product language
- ownership of the standup lifecycle will be obvious
- `worker` will stop accumulating unrelated responsibilities
- Discord and scheduler will stop competing with business contexts
- future features will have a clearer home and fewer ambiguous boundaries
