# Azure DevOps Per-User Identity Resolution

**Date:** 2026-03-17
**Status:** Draft
**Scope:** Resolve each user's Azure DevOps UUID at settings-save time so the enrichment pipeline filters PRs by the correct user, not the PAT owner

## Problem

`AzureDevopsEnrichmentService.enrichGitActivity()` calls `getMe()` on the MCP client, which returns the UUID of the **global PAT owner** — not the user who triggered the standup. This UUID is used to filter pull requests (`pullRequest.creatorId === userUuid`), causing incorrect results: only PRs created by the PAT owner appear in any user's standup.

The board activity collector (`AzureDevopsActivityCollectorService`) already works correctly per-user because it matches by `azureDevopsUser` (display name) from `user_settings`. But the MCP-based git enrichment has no per-user identity.

### Secondary issue

`worker-scheduler.service.ts` (`contexts/standups/worker/scheduler/`) does not pass `azureDevopsUser` when dispatching scheduled jobs (lines 95-107), so scheduled runs miss board activity collection even if the user has it configured. Only manual triggers via `dispatchStandupJobForUser()` include it.

## Decision

Resolve the user's Azure DevOps UUID via the REST Identity API at `PUT /settings/me` time. Store it in a new `azure_devops_uuid` column in `user_settings`. Pass it through `StandupJobOptions` into the enrichment pipeline. Remove the `getMe()` call from the enrichment flow.

## Architecture

### Identity resolution endpoint

The Azure DevOps Identity API at `vssps.dev.azure.com` supports searching by email or display name:

```
GET https://vssps.dev.azure.com/{org}/_apis/identities?searchFilter=General&filterValue={value}&queryMembership=None&api-version=7.1
```

- `searchFilter=General` matches against display name, account name (email), and unique name
- The PAT used for authentication only needs read access to identities (standard PAT scope)
- Returns `Identity[]` with `id` (UUID), `providerDisplayName`, `isActive`, `isContainer`

**Important:** The base URL is `vssps.dev.azure.com/{org}`, not `dev.azure.com/{org}` used by the existing REST client endpoints. The REST client needs a second base URL for identity calls.

### New method: `AzureDevopsRestClientService.resolveIdentity()`

Location: `contexts/standups/worker/azure-devops/azure-devops-rest-client.service.ts`

```ts
async resolveIdentity(
  filterValue: string,
): Promise<Result<{ id: string; displayName: string }, ExternalServiceError>>
```

Implementation:
- Add a `vsspsBaseUrl` field alongside the existing `baseUrl`, constructed as `https://vssps.dev.azure.com/${org}` using `runtimeConfig.config.AZURE_DEVOPS_ORG`
- Reuse the existing `authHeader` (same PAT, same Basic auth)
- Call `GET ${vsspsBaseUrl}/_apis/identities?searchFilter=General&filterValue=${encodeURIComponent(filterValue)}&queryMembership=None&api-version=7.1`

Logic:
1. Call the Identity API with `searchFilter=General&filterValue={filterValue}`
2. Filter results: `isActive === true && isContainer !== true` (exclude groups and inactive accounts)
3. If 0 active matches: `Result.err(...)` — "No Azure DevOps user found matching '{filterValue}'"
4. If >1 active matches: `Result.err(...)` — "Multiple Azure DevOps users match '{filterValue}'. Use email for a more precise match."
5. If exactly 1: `Result.ok({ id: identity.id, displayName: identity.providerDisplayName })`

### Database schema change

New nullable column in `user_settings`:

```ts
azureDevopsUuid: text('azure_devops_uuid'),
```

This field is **never set by the user directly**. It is computed by the backend from `azureDevopsUser` via the Identity API. Migration generated via `bun run db:generate`.

### Settings save flow (`PUT /settings/me`)

Location: `contexts/preferences/me-settings.service.ts`

In `MeSettingsService.put()`, when `body.azureDevopsUser` is provided:

1. Check if value changed compared to current settings
2. If changed (or new): call `restClient.resolveIdentity(body.azureDevopsUser.trim())`
   - On success: set both `azureDevopsUser` and `azureDevopsUuid` in the upsert
   - On failure: throw `BadRequestException` with the error message (not found / ambiguous)
3. If `azureDevopsUser` is cleared (null/empty): set both fields to `null`
4. If unchanged: skip the lookup, preserve existing `azureDevopsUuid`

**Dependency injection:** `MeSettingsService` needs `AzureDevopsRestClientService` injected. The REST client lives in `AzureDevopsModule` (inside the worker context). The settings context is wired via `PreferencesModule` (`contexts/preferences/preferences.module.ts`).

Preferred approach: Import `AzureDevopsModule` into `PreferencesModule`. The REST client is a stateless HTTP wrapper that depends only on `WorkerRuntimeConfigService` (env config). This transitively imports `WorkerRuntimeConfigModule`, which is acceptable since it only provides env values. The MCP client and activity collector are also imported but only instantiated when injected — `MeSettingsService` only injects the REST client, so there is no startup overhead from unused providers.

### StandupJobOptions

Location: `contexts/standups/worker/standup/types.ts`

New optional field:

```ts
export interface StandupJobOptions {
  // ... existing fields ...
  azureDevopsUuid?: string  // Azure DevOps identity UUID for the user
}
```

### Dispatch changes

**`StandupDispatchService.resolveStandupJobOptionsForUser()`:**
Location: `contexts/standups/worker/standup/standup-dispatch.service.ts`

- Read `azureDevopsUuid` from `user_settings` alongside `azureDevopsUser`
- Include in the constructed `StandupJobOptions`:
  ```ts
  azureDevopsUuid: settings.azureDevopsUuid || undefined,
  ```

**`WorkerSchedulerService` (scheduled jobs):**
Location: `contexts/standups/worker/scheduler/worker-scheduler.service.ts`

The scheduler constructs `StandupJobOptions` directly (lines 98-106), bypassing `resolveStandupJobOptionsForUser()`. Two fields must be added to the inline construction:

```ts
this.standupDispatch.dispatchStandupJob({
  userId: settings.userId,
  discordUserId: discordResult.value,
  selectedRepos,
  gitAuthor: settings.gitAuthor,
  timezone,
  gitSincePeriod: settings.gitSincePeriod,
  azureDevopsUser: settings.azureDevopsUser || undefined,   // new
  azureDevopsUuid: settings.azureDevopsUuid || undefined,   // new
})
```

The same change applies to the recovery cron dispatch block (lines ~130-140).

### Enrichment service changes

Location: `contexts/standups/worker/azure-devops/azure-devops-enrichment.service.ts`

`AzureDevopsEnrichmentService.enrichGitActivity()` signature changes:

```ts
// Before
async enrichGitActivity(
  activity: GatheredGitActivity,
): Promise<Result<EnrichedGitActivity, ExternalServiceError>>

// After
async enrichGitActivity(
  activity: GatheredGitActivity,
  azureDevopsUuid?: string,
): Promise<Result<EnrichedGitActivity, ExternalServiceError>>
```

Changes:
1. **Remove** the `getMe()` call entirely
2. Use the `azureDevopsUuid` parameter for PR filtering
3. If `azureDevopsUuid` is not provided: skip PR filtering (include all PRs as a fallback)
4. The `EnrichedGitActivity.userUuid` field is populated from the parameter (or `'unknown'` if absent) instead of `getMe()`

### Full call chain: StandupJobOptions → enrichment

The UUID must flow through several layers. Here is the exact call chain:

1. **`ExecuteGenerateStrategy.execute(input, options)`** (`contexts/standups/worker/standup/strategies/execute-generate-strategy.ts`)
   - Has access to `options: StandupJobOptions` (including the new `azureDevopsUuid`)
   - Builds `GenerateStandupInput` and calls `this.standupGenerator.generateStandup(input, onStageChange)`
   - **Change needed:** pass `azureDevopsUuid` into `GenerateStandupInput`

2. **`GenerateStandupInput`** (`shared/domain/types.ts`, lines 88-94)
   - Currently: `{ date, meetingType, gitActivity?, boardActivity?, extraContext? }`
   - **Add:** `azureDevopsUuid?: string`

3. **`StandupGeneratorService.generateStandup(input)`** (`contexts/standups/worker/standup-generator/standup-generator.service.ts`)
   - Calls `this.enrichWithFallback(input.gitActivity)` at line 60
   - **Change:** pass UUID through: `this.enrichWithFallback(input.gitActivity, input.azureDevopsUuid)`

4. **`StandupGeneratorService.enrichWithFallback(gitActivity, azureDevopsUuid?)`** (private method, lines 265-287)
   - Currently calls `this.azureDevopsEnrichment.enrichGitActivity(gitActivity)`
   - **Change:** `this.azureDevopsEnrichment.enrichGitActivity(gitActivity, azureDevopsUuid)`

### getMe() disposition

The `getMe()` method on `AzureDevopsMcpClientService` is **preserved but no longer called** in the enrichment pipeline. It may be useful for future diagnostics or admin tooling. Zero cost to keep.

## Data flow summary

```
PUT /settings/me { azureDevopsUser: "john@company.com" }
    │
    ▼
MeSettingsService.put()  (contexts/preferences/)
    │  calls restClient.resolveIdentity("john@company.com")
    │  Azure DevOps returns { id: "abc-123", providerDisplayName: "John Doe" }
    │  saves: azure_devops_user = "john@company.com"
    │         azure_devops_uuid = "abc-123"
    ▼
user_settings row: { ..., azure_devops_user: "john@company.com", azure_devops_uuid: "abc-123" }

--- later, standup job triggers ---

WorkerScheduler / StandupDispatch
    │  reads user_settings
    │  constructs StandupJobOptions { ..., azureDevopsUser: "john@company.com", azureDevopsUuid: "abc-123" }
    ▼
ExecuteGenerateStrategy.execute(input, options)
    │  builds GenerateStandupInput { ..., azureDevopsUuid: "abc-123" }
    ▼
StandupGeneratorService.generateStandup(input)
    │  calls enrichWithFallback(gitActivity, "abc-123")
    ▼
AzureDevopsEnrichmentService.enrichGitActivity(gitActivity, "abc-123")
    │  filters PRs: pullRequest.creatorId === "abc-123"  ✓ correct user
    │  returns EnrichedGitActivity { userUuid: "abc-123", ... }
    ▼
LLM prompt includes only John's PRs
```

## Files changed

| File | Change |
|------|--------|
| `platform/database/schema.ts` | + `azureDevopsUuid` column |
| `contexts/standups/worker/azure-devops/azure-devops-rest-client.service.ts` | + `resolveIdentity()` method, + `vsspsBaseUrl` field |
| `contexts/preferences/me-settings.service.ts` | + identity resolution on save when `azureDevopsUser` changes |
| `contexts/preferences/preferences.module.ts` | + import `AzureDevopsModule` for REST client access |
| `contexts/standups/worker/standup/types.ts` | + `azureDevopsUuid?` in `StandupJobOptions` |
| `shared/domain/types.ts` | + `azureDevopsUuid?` in `GenerateStandupInput` |
| `contexts/standups/worker/standup/standup-dispatch.service.ts` | pass `azureDevopsUuid` from settings |
| `contexts/standups/worker/scheduler/worker-scheduler.service.ts` | pass `azureDevopsUser` + `azureDevopsUuid` in scheduled jobs + recovery |
| `contexts/standups/worker/standup/strategies/execute-generate-strategy.ts` | pass `azureDevopsUuid` into `GenerateStandupInput` |
| `contexts/standups/worker/standup-generator/standup-generator.service.ts` | thread UUID through `enrichWithFallback()` to enrichment |
| `contexts/standups/worker/azure-devops/azure-devops-enrichment.service.ts` | remove `getMe()` call, accept UUID param |
| `platform/database/repositories/user-settings.repository.ts` | include `azureDevopsUuid` in upsert |
| migration (generated via `bun run db:generate`) | add `azure_devops_uuid` column |

## Testing strategy

- **Unit test `resolveIdentity()`**: mock fetch, test 0/1/multiple results, inactive filtering, group exclusion
- **Unit test settings save**: mock `resolveIdentity`, verify UUID is persisted on success, verify `BadRequestException` on not-found/ambiguous, verify both fields cleared when `azureDevopsUser` is null
- **Unit test enrichment**: verify `getMe()` is no longer called, UUID param used for PR filtering, fallback when UUID absent
- **Unit test dispatch**: verify `azureDevopsUuid` flows from settings into job options
- **Unit test scheduler**: verify `azureDevopsUser` and `azureDevopsUuid` are passed in both scheduled and recovery job dispatches
- **Unit test execute-generate-strategy**: verify `azureDevopsUuid` from options is passed into `GenerateStandupInput`

## Edge cases

- **Azure DevOps not configured** (`AZURE_DEVOPS_PAT` empty): `resolveIdentity()` returns error, user cannot save `azureDevopsUser`. Existing behavior for board activity already handles this gracefully.
- **User changes display name in Azure DevOps**: UUID remains valid (it's immutable). Display name in our DB becomes stale for board activity matching, but UUID-based PR filtering still works. User can re-save settings to update the display name match.
- **PAT lacks identity read scope**: `resolveIdentity()` returns 401/403 — surfaced as a clear error message in the settings save response.
- **azureDevopsUser cleared**: both `azureDevopsUser` and `azureDevopsUuid` set to null. Enrichment skips PR filtering (includes all PRs).
- **Existing users with `azureDevopsUser` but no `azureDevopsUuid`**: After migration, existing rows have `azure_devops_uuid = NULL`. PR filtering falls back to "include all" until the user re-saves settings, which triggers the lookup. This is a graceful degradation — no data loss, slightly more PRs shown temporarily.
