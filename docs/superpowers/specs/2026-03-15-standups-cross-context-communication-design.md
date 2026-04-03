# Standups Cross-Context Communication Design

## Context

After the API reorganization, `contexts/standups` is now the product core of the
backend. The next architectural decision is how `standups` should communicate
with other contexts and interfaces without recreating tight coupling or turning
the event bus into hidden RPC.

The current implementation mixes two different patterns:

- domain facts published as events, such as standup lifecycle notifications
- synchronous request/reply flows implemented through `EventEmitter2`

Examples of current request-style event flows:

- `STANDUP_TRIGGER_REQUESTED_EVENT`
- `STANDUP_JOB_DISPATCH_REQUESTED_EVENT`
- `WORKER_REPOS_REQUESTED_EVENT`
- `WORKER_REMINDER_ACTION_REQUESTED_EVENT`

These flows technically use the event bus, but semantically they behave like
direct commands or queries because the caller expects an immediate response to
continue.

## Decision Summary

The architecture should adopt this rule:

- use direct application-service calls for commands and queries
- use events only for domain facts and asynchronous reactions

This is the target model for communication inside the monolith.

## Core Communication Rule

### Direct calls

Use direct calls when:

- the caller needs an immediate result to continue the flow
- the action is a command or query
- the interaction is part of the primary successful path
- the dependency is intentional and belongs to a known context boundary

### Events

Use events when:

- something already happened
- other modules may react independently
- the side effect is asynchronous or non-critical to the main transaction
- multiple adapters or listeners may care about the same fact

### Practical heuristic

- "I need an answer now" -> direct call
- "This fact already happened" -> event

## Ownership Rule

`contexts/standups` is the only owner of standup lifecycle state transitions.

That means:

- only `standups` decides when a standup moves to `draft`
- only `standups` decides when it becomes `pending_review`
- only `standups` decides when it becomes `approved`
- only `standups` decides when it becomes `rejected`
- only `standups` decides when it becomes `published`

Interfaces such as Discord, HTTP, SSE, and email:

- receive intentions from the outside world
- call use cases from the owning context
- react to facts emitted by the owning context
- do not own domain state transitions

## Recommended Communication Model

### Interfaces -> contexts

Adapters should call use cases directly.

Examples:

- HTTP controller -> `standups` trigger use case
- Discord slash/button/modal handler -> `standups` trigger/approve/reject/adjust/regenerate use cases
- scheduler adapter -> `standups` due reminder / due standup / weekly digest use cases

### Context -> context

Contexts may call other contexts directly through focused application services.

Examples:

- `standups` -> `preferences` to read timezone, cron, selected repos, reminder preferences
- `standups` -> `identity` to resolve user-to-discord linkage when that is required application data

This is acceptable coupling because it is explicit, typed, traceable, and
bounded to a real business need.

### Context -> interfaces

`standups` should not call Discord or email services directly for channel work.

Instead:

- `standups` publishes facts
- `interfaces/discord` reacts to those facts
- `interfaces/email` reacts when email delivery is appropriate
- SSE listeners react and stream those facts outward

## Event Taxonomy

The target event taxonomy should contain only facts.

### Keep as facts

These event families make sense and should remain event-driven:

- `standup.generation-started`
- `standup.progressed`
- `standup.generated`
- `standup.ready-for-review`
- `standup.approved`
- `standup.rejected`
- `standup.published`
- `standup.generation-failed`
- `standup.reminder-requested`
- `weekly-digest.generated`
- `weekly-digest.failed`

### Remove as request-style events

These should be replaced with direct calls:

- `standup.trigger.requested`
- `standup.job-dispatch.requested`
- `worker.repos.requested`
- `worker.reminder-action.requested`

The issue is not the transport itself. The issue is that these names describe
intentions requiring an immediate response, which means they are commands or
queries, not facts.

## Current Code Mapping

### Flows that should become direct calls

`[trigger-standup.service.ts](/Users/nitoba/Documents/standup/apps/api/src/contexts/standups/trigger/trigger-standup.service.ts)`

- today it emits `requestStandupJobDispatch(...)`
- target: call a standup-owned dispatcher or generation coordinator directly

`[standup-dispatch.service.ts](/Users/nitoba/Documents/standup/apps/api/src/contexts/standups/worker/standup/standup-dispatch.service.ts)`

- today it listens to `STANDUP_JOB_DISPATCH_REQUESTED_EVENT`
- target: become a direct collaborator inside `standups`

`[discord-trigger.service.ts](/Users/nitoba/Documents/standup/apps/api/src/interfaces/discord/services/discord-trigger.service.ts)`

- today it uses `requestStandupTrigger(...)`
- target: call a `standups` use case directly

`[discord-available-repos.service.ts](/Users/nitoba/Documents/standup/apps/api/src/interfaces/discord/services/discord-available-repos.service.ts)`

- today it uses `requestWorkerRepos(...)`
- target: call the owner service directly

`[reminder-interaction.service.ts](/Users/nitoba/Documents/standup/apps/api/src/interfaces/discord/handlers/reminder-interaction.service.ts)`

- today it uses `requestWorkerReminderAction(...)`
- target: call a `standups` reminder action use case directly

### Flows that should remain event-driven

`[standup-sse.listener.ts](/Users/nitoba/Documents/standup/apps/api/src/contexts/standups/events/standup-sse.listener.ts)`

- should keep reacting to standup lifecycle facts for SSE

`[standup-notification.service.ts](/Users/nitoba/Documents/standup/apps/api/src/interfaces/discord/services/standup-notification.service.ts)`

- should keep reacting to standup-ready facts to send review DMs

`[discord-messages.service.ts](/Users/nitoba/Documents/standup/apps/api/src/interfaces/discord/notifications/discord-messages.service.ts)`

- may continue reacting to notification-oriented facts such as reminder/failure/login-success delivery

## Publication and Approval Ownership

The biggest ownership correction is publication.

Today, parts of publication behavior live inside Discord-facing services and
handlers. That makes the adapter partially own lifecycle transitions.

Target rule:

- approval and publication are domain decisions in `standups`
- Discord performs channel effects only
- Discord does not decide when a record becomes `published`

Implications:

`[standup-status-sync.service.ts](/Users/nitoba/Documents/standup/apps/api/src/interfaces/discord/services/standup-status-sync.service.ts)`

- should not publish to channel and then update repository state to `published`
- instead, `standups` should decide when publication happens and emit `standup.published`

`[standup-interaction.service.ts](/Users/nitoba/Documents/standup/apps/api/src/interfaces/discord/handlers/standup-interaction.service.ts)`

- should translate interaction input into direct calls such as `approveStandup`, `rejectStandup`, `regenerateStandup`, `adjustStandup`
- it should not own the state transition logic itself

## Recommended Use Case Shape

The target shape inside `contexts/standups` should look like this:

- `triggerStandup(...)`
- `dispatchStandupJob(...)`
- `approveStandup(...)`
- `rejectStandup(...)`
- `regenerateStandup(...)`
- `adjustStandup(...)`
- `publishStandup(...)`
- `snoozeReminder(...)`
- `cancelTodayReminder(...)`
- `listAvailableRepos(...)` if repository listing remains standup-owned

These use cases may internally depend on:

- standup persistence
- git collection
- Azure DevOps enrichment
- generation services
- `preferences` data access
- `identity` data access

After persisting state changes, the use case emits facts to the event bus.

## Module Dependency Guidance

The goal is not zero imports between contexts.

The goal is:

- no imports from another context's internal implementation details
- dependencies only on a small, explicit application surface
- no adapter becoming the owner of business state
- no event bus used to hide synchronous dependency chains

This means direct context-to-context calls are acceptable when:

- the dependency is small and explicit
- the owner of the operation is obvious
- the caller still depends on an application boundary, not internal files

## Incremental Migration Strategy

### Step 1

Keep `platform/events` but remove request/reply usage from the target design.

### Step 2

Replace these request-style event flows with direct calls:

- standup trigger
- standup dispatch
- repo listing
- reminder actions

### Step 3

Move approval/publication ownership fully into `standups`.

### Step 4

Rename remaining fact events to reflect lifecycle facts rather than technical dispatch language.

### Step 5

Keep SSE, Discord notifications, and email delivery as event consumers.

## Testing Guidance

### Standups use case tests

Test:

- domain decision
- persistence behavior
- emitted facts

Do not require listeners to run for the use case to be considered correct.

### Interface tests

Test:

- input translation into use case calls
- reaction to emitted facts
- channel-specific side effects

### Anti-pattern to avoid

Avoid tests where:

- the main flow only works if a listener responds synchronously
- command success depends on event bus request/reply behavior

## Expected Outcome

After this redesign:

- context boundaries become explicit and readable
- synchronous command/query paths become typed and traceable
- event usage becomes simpler and semantically correct
- `standups` clearly owns lifecycle state
- Discord, SSE, and email become adapters reacting to facts, not partial domain owners
