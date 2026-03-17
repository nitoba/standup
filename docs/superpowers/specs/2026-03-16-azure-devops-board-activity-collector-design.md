# Azure DevOps Board Activity Collector

**Date:** 2026-03-16
**Status:** Draft
**Scope:** Extend standup generation to non-dev roles by collecting work item activity from Azure DevOps boards

## Problem

Standup generation depends entirely on git commits, limiting it to developers. Designers, PMs, POs, QAs, and other team members track their work on Azure DevOps boards (moving cards, commenting, creating/resolving work items) but cannot generate automated standups.

## Decision

Add a second collector that queries the Azure DevOps REST API for board activity (work items the user modified in a given period). This collector runs alongside the existing git collector. Users configure which sources are active via settings. The LLM receives data from all active sources and generates a unified standup.

## Architecture

### New module: `azure-devops-activity`

Location: `apps/api/src/contexts/standups/worker/azure-devops-activity/`

Files:
- `azure-devops-rest-client.service.ts` — HTTP client for Azure DevOps REST API
- `azure-devops-activity-collector.service.ts` — orchestrates WIQL + updates into `GatheredBoardActivity`
- `types.ts` — board activity types
- `azure-devops-activity.module.ts` — NestJS module

This module is separate from the existing `azure-devops/` module (which handles MCP-based enrichment for git commits). Each has a distinct responsibility:
- `azure-devops/` — enriches git commits with work item details (via MCP)
- `azure-devops-activity/` — collects board activity as a standalone data source (via REST API)

### REST API Client

`AzureDevopsRestClientService` uses native `fetch` with the existing `AZURE_DEVOPS_PAT` for Basic Auth. No new env vars required.

Methods:

```ts
class AzureDevopsRestClientService {
  // Execute a WIQL query, return matching work item IDs
  // Endpoint: POST https://dev.azure.com/{org}/{project}/_apis/wit/wiql?api-version=7.1
  queryWorkItems(project: string, wiql: string): Promise<Result<number[], ExternalServiceError>>

  // Fetch details for multiple work items in one call (max 200 per batch)
  // Endpoint: GET https://dev.azure.com/{org}/_apis/wit/workitems?ids=1,2,3&fields=...&api-version=7.1
  // Note: org-scoped endpoint — works across projects
  getWorkItemsBatch(ids: number[], fields: string[]): Promise<Result<WorkItemResponse[], ExternalServiceError>>

  // Fetch update history for a single work item
  // Endpoint: GET https://dev.azure.com/{org}/_apis/wit/workitems/{id}/updates?api-version=7.1
  getWorkItemUpdates(id: number): Promise<Result<WorkItemUpdate[], ExternalServiceError>>
}
```

Authentication: Basic Auth with `:PAT` base64-encoded (standard Azure DevOps pattern). Base URL: `https://dev.azure.com/{AZURE_DEVOPS_ORG}`.

**Rate limiting:** Azure DevOps cloud allows ~200 requests per 5 minutes per PAT. The collector limits concurrent API calls to 5 (`Promise.allSettled` with concurrency control) and respects `Retry-After` headers on 429 responses. For the `getWorkItemUpdates` call (per work item), if a user touched >40 work items, the collector processes them in batches of 10 with a 1-second pause between batches.

### Activity Collector

`AzureDevopsActivityCollectorService` orchestrates the REST client to produce `GatheredBoardActivity`:

1. **WIQL query** — finds work items changed by the configured user in the time window. Runs once per project in `AZURE_DEVOPS_PROJECTS`:
   ```sql
   SELECT [System.Id]
   FROM WorkItems
   WHERE [System.ChangedBy] = '{azureDevopsDisplayName}'
     AND [System.ChangedDate] >= '{sinceDate}'
     AND [System.TeamProject] = '{project}'
   ORDER BY [System.ChangedDate] DESC
   ```

2. **Batch fetch** — gets details (title, type, state, assignedTo) for all matching IDs in a single org-scoped call.

3. **Update history** — for each work item, fetches the update log and filters to changes made by the configured user within the time window. Each relevant change becomes a `BoardAction`.

**Multi-project handling:** The collector iterates over all projects in `AZURE_DEVOPS_PROJECTS` sequentially. If one project query fails, it logs a warning and continues to the next. Results from all projects are merged into a single `GatheredBoardActivity` with work items carrying their own `project` field.

**`azureDevopsUser` identity format:** The `System.ChangedBy` field in Azure DevOps stores the user's **display name** (e.g., "Bruno Oliveira"), not email. The `azureDevopsUser` setting must therefore store the display name as shown in Azure DevOps. The settings UI should label this field clearly: "Nome de exibicao no Azure DevOps". The help text should instruct the user to check their Azure DevOps profile for the exact display name.

### Types

```ts
interface BoardWorkItemActivity {
  id: number
  title: string
  type: string            // Bug, Task, User Story, Epic, Feature, etc.
  state: string           // current state
  assignedTo: string
  project: string         // which Azure DevOps project this item belongs to
  actions: BoardAction[]  // what the user did to this item
}

interface BoardAction {
  type: BoardActionType
  timestamp: string
  details: string         // e.g., "Moved from 'To Do' to 'In Progress'"
}

type BoardActionType =
  | 'created'             // user created the work item
  | 'state_change'        // state field changed (includes resolve, close, reactivate)
  | 'assigned'            // assigned to someone
  | 'commented'           // comment added
  | 'field_changed'       // priority, area path, iteration, tags, or other field changed
                          // details string specifies which field (e.g., "Priority: 2 -> 1")

// Note: 'resolved' and 'closed' are NOT separate types — they are state_change
// with details like "State: Active -> Resolved". This avoids redundancy with
// the state_change type and keeps the discriminator clean.

interface GatheredBoardActivity {
  timestamp: string
  workItems: BoardWorkItemActivity[]   // merged from all projects
}
```

## Pipeline Orchestration

### Changes to `ExecuteGenerateStrategy`

Today: `gitCollector.collect() -> generator.generateStandup()`

After: resolve which collectors are active for the user, run them in parallel, combine results.

```
1. Determine active collectors from user_settings (via StandupJobOptions)
2. Run active collectors in parallel (Promise.allSettled)
3. Handle partial failures (one fails, other succeeds = continue with warning)
4. If both return empty/null -> return Result.ok(null) (no activity)
5. Combine results into unified LLM input
6. Generate standup
```

### Collector activation rules

Based on `user_settings`:

| `selectedRepos` | `azureDevopsUser` | Result |
|---|---|---|
| configured | configured | Git + Board (hybrid) |
| configured | empty/null | Git only (current behavior) |
| empty/null | configured | Board only (non-devs) |
| empty/null | empty/null | Error: no source configured |

`NULL` and `''` (empty string) are both treated as "not configured" for both `selectedRepos` and `azureDevopsUser`.

### "No activity" detection

A standup is generated if **any** active collector returns data. Only when all active collectors return empty results does the pipeline report "no activity found."

**DM message update:** The "no activity" DM message currently says "Nao encontrei commits hoje nos repositorios configurados." This must be updated to be source-aware:
- Git only: "Nao encontrei commits hoje nos repositorios configurados."
- Board only: "Nao encontrei atividade no board do Azure DevOps hoje."
- Hybrid: "Nao encontrei commits nem atividade no board hoje."

### SSE progress events

New stage: `collecting_board` added to `StrategyProgressStep`.

Updated type:
```ts
type StrategyProgressStep =
  | 'collecting_git'
  | 'collecting_board'
  | 'enriching_data'
  | 'generating_standup'
```

**All locations that need updating for the new stage:**
- `StrategyProgressStep` in `worker/standup/types.ts`
- `StandupProgressStep` in `platform/events/standup-events.ts`
- `StandupSseEvent` step union in SSE types
- `StandupStrategyBase.reportStage()` if it validates steps
- `StandupProgressStep` in `apps/web/src/app/shared/models/standup-models.ts`
- Frontend rendering logic that maps steps to UI labels

**Stage ordering:**
- Git+Board mode: `collecting_git` -> `collecting_board` -> `enriching_data` (git only) -> `generating_standup`
- Git only: `collecting_git` -> `enriching_data` -> `generating_standup` (unchanged)
- Board only: `collecting_board` -> `generating_standup` (skip `collecting_git` and `enriching_data`)

`enriching_data` always applies only to git data (Azure DevOps MCP enrichment of commits). Board data comes pre-enriched from the REST API.

## Changes to `StandupJobOptions`

The `StandupJobOptions` interface needs a new field to carry the Azure DevOps user identity:

```ts
export interface StandupJobOptions {
  userId: string
  discordUserId: string
  selectedRepos: string[]        // can be empty for board-only users
  gitAuthor: string              // can be empty for board-only users
  azureDevopsUser?: string       // display name in Azure DevOps (new)
  timezone: string
  gitSincePeriod?: string
  extraContext?: string
  forceRegenerate?: boolean
  rewriteFromStandupId?: string
  rewriteInstruction?: string
  replaceStandupId?: string
  reuseExistingSource?: boolean
}
```

### Changes to `StandupDispatchService`

`resolveStandupJobOptionsForUser()` currently rejects users with `selectedRepos.length === 0`. This validation must be relaxed:

```ts
// BEFORE: hard reject if no repos
if (selectedRepos.length === 0) {
  return Result.err(new ValidationError({ field: 'selectedRepos', message: '...' }))
}

// AFTER: reject only if NEITHER source is configured
const azureDevopsUser = settingsResult.value.azureDevopsUser?.trim() || ''
if (selectedRepos.length === 0 && !azureDevopsUser) {
  return Result.err(new ValidationError({
    field: 'sources',
    message: 'At least one data source must be configured (git repos or Azure DevOps user)',
  }))
}
```

The method also populates the new `azureDevopsUser` field in `StandupJobOptions`.

## Changes to `GenerateStandupInput` and Related Types

### `GenerateStandupInput` — make `gitActivity` optional, add `boardActivity`

```ts
export interface GenerateStandupInput {
  date: string
  meetingType: string
  gitActivity?: GatheredGitActivity    // optional (was required)
  boardActivity?: GatheredBoardActivity // new
  extraContext?: string
}
```

At least one of `gitActivity` or `boardActivity` must be present. This is enforced at the call site, not in the type.

### `GenerateStandupInputSchema` — updated Zod schema

```ts
export const GatheredBoardActivitySchema = z.object({
  timestamp: z.string(),
  workItems: z.array(z.object({
    id: z.number(),
    title: z.string(),
    type: z.string(),
    state: z.string(),
    assignedTo: z.string(),
    project: z.string(),
    actions: z.array(z.object({
      type: z.enum(['created', 'state_change', 'assigned', 'commented', 'field_changed']),
      timestamp: z.string(),
      details: z.string(),
    })),
  })),
})

export const GenerateStandupInputSchema = z.object({
  date: z.string().min(10),
  meetingType: z.string().min(1),
  gitActivity: z.object({ /* existing schema */ }).optional(),  // now optional
  boardActivity: GatheredBoardActivitySchema.optional(),        // new
  extraContext: z.string().optional(),
})
```

## Source Data

### Change to `sourceData` format

Current format: raw `GatheredGitActivity` JSON.

New format:
```ts
interface StandupSourceData {
  git: GatheredGitActivity | null
  board: GatheredBoardActivity | null
}
```

### Backward compatibility — dual-format parsing

The database will permanently contain two formats (old standups store raw git activity, new standups store the wrapper). A parsing utility handles both:

```ts
function parseSourceData(raw: string): Result<StandupSourceData, ValidationError> {
  const parsed = JSON.parse(raw)

  // Discriminator: new format has a top-level 'git' or 'board' key
  if ('git' in parsed || 'board' in parsed) {
    // New format — validate with StandupSourceDataSchema
    return StandupSourceDataSchema.safeParse(parsed)
  }

  // Old format — treat as { git: <parsed>, board: null }
  const gitResult = GenerateStandupInputSchema.shape.gitActivity.safeParse(parsed)
  if (!gitResult.success) {
    return Result.err(new ValidationError({ field: 'sourceData', message: 'Invalid sourceData' }))
  }
  return Result.ok({ git: gitResult.data, board: null })
}
```

A new `StandupSourceDataSchema` Zod schema validates the new format.

## Changes to Regenerate and Adjust Strategies

### `ExecuteRegenerateStrategy`

The `parseStoredGitActivity()` function is replaced by `parseSourceData()` (defined above). The strategy then passes both `gitActivity` and `boardActivity` to `generateStandup()`:

```ts
const sourceData = parseSourceData(existingResult.value.sourceData)
// ...
this.standupGenerator.generateStandup({
  date: today,
  meetingType: existingResult.value.meetingType,
  gitActivity: sourceData.git ?? undefined,
  boardActivity: sourceData.board ?? undefined,
  extraContext: options.extraContext?.trim() || undefined,
})
```

**Enrichment during regeneration:** The current behavior re-runs Azure DevOps MCP enrichment on stored git data. This continues unchanged — enrichment only applies to git data. Board data stored in `sourceData` is already complete and does not need re-enrichment.

### `ExecuteAdjustStrategy`

**No changes needed.** The adjust strategy operates on the standup's `content` string (already-generated text) and passes `sourceData` through as-is. It never parses or interprets `sourceData`. The format change is transparent.

## Database Changes

### `user_settings` — new column

```sql
ALTER TABLE user_settings ADD COLUMN azure_devops_user TEXT;
```

- Default: `NULL` (implicit in SQLite for `ALTER TABLE ADD COLUMN`)
- `NULL` means board collector is disabled for this user
- The `azureDevopsUser` field stores the user's **display name** in Azure DevOps (e.g., "Bruno Oliveira")
- Analogous to `gitAuthor` — manually configured in settings

No changes to the `standups` table schema. The `sourceData` column is TEXT/JSON and the format change is internal.

### Migration

Generated via `bun run db:generate` as per project rules. Never created manually.

## Changes to `PutMeSettingsDto`

The DTO currently requires `gitAuthor` (with `@MinLength(1)`) and `selectedRepos` (with `@ArrayMinSize(1)`). For board-only users, these fields may be empty.

Updated validation:

```ts
export class PutMeSettingsDto {
  @IsString()
  @IsOptional()                          // was @MinLength(1)
  gitAuthor?: string                     // was required

  @IsArray()
  @IsOptional()                          // was @ArrayMinSize(1)
  @IsString({ each: true })
  selectedRepos?: string[]               // was required with min 1

  @IsString()
  @IsOptional()
  azureDevopsUser?: string               // new field

  // ... other fields unchanged
}
```

**Cross-field validation:** At least one source must be configured. If both `gitAuthor`/`selectedRepos` and `azureDevopsUser` are empty/missing, the PUT endpoint returns 400 with a validation error. This is enforced in `MeSettingsService.put()`, not in the DTO decorators (class-validator doesn't handle cross-field validation cleanly).

The `MeSettingsRecord` type also gains `azureDevopsUser: string | null`.

## LLM Prompt Adaptation

### System prompt

The current system prompt is git-centric ("dados estruturados de commits git"). It must become source-aware:

**When git only:** Current system prompt unchanged.

**When board only:** Replace the system prompt with a board-specific version:
- Remove references to commits, repositories, branches, file paths
- Formatting rules focus on work item activity: status changes, card movements, new items
- Structure: by project, then by work item, with actions listed under each

**When hybrid:** Use a combined system prompt that explains both sources:
- "Voce recebera dados de duas fontes: commits git e atividade no board do Azure DevOps"
- Git-specific formatting rules apply to the code section
- Board-specific formatting rules apply to the board section
- Instruction to consolidate items that appear in both sources (same card number)

The `buildSystemPrompt()` method gains a parameter indicating which sources are active:

```ts
buildSystemPrompt(sources: { hasGit: boolean; hasBoard: boolean }): string
```

### User message structure

The `buildUserMessage()` signature changes to accept the new input type:

```ts
buildUserMessage(
  input: GenerateStandupInput,
  enrichedActivity?: EnrichedGitActivity,  // optional now
): string
```

The message is built from conditional blocks:

```
[If git data present]
## Atividade em Codigo
(repos, commits, enriched work items — same as today)

[If board data present]
## Atividade no Board
- [Task] #1234 "Implementar feature Y" (Projeto: AGROTRACE)
  - Movida de 'To Do' para 'In Progress' (14:30)
  - Comentario adicionado (15:45)
- [Bug] #5678 "Erro no login" (Projeto: AGROTRACE)
  - Criada (10:00)
  - Atribuida para @fulano (10:05)

[If both present — deduplication note]
Nota: Alguns itens podem aparecer em ambas as secoes (mesmo numero de card).
Consolide-os no standup final sem duplicar informacoes.
```

### Deduplication

When both sources reference the same work item (card number from git branch matches work item ID from board), both are included in the prompt with the consolidation instruction above. The LLM consolidates them.

**Programmatic cross-reference (optional enhancement):** Before sending to the LLM, the prompt builder can flag duplicates by matching `cardNumbers` from git repos against `workItem.id` from board activity. Flagged items get an explicit note in the prompt: "Este item aparece nos commits E no board — consolide as informacoes." This helps the LLM but is not strictly required for v1.

## Error Handling

Follows the existing `enrichWithFallback` pattern — graceful degradation:

| Scenario | Behavior |
|---|---|
| Board fails + git ok | Generate standup from git only (log warning) |
| Git fails + board ok | Generate standup from board only (log warning) |
| Both fail | Job fails, notify user via DM |
| Board returns no activity | `null` (not an error) |
| One project fails in board collector | Log warning, continue to next project |

No new TaggedErrors. `ExternalServiceError` with `service: 'azure-devops-rest'` covers REST API failures. Transient errors (timeout, 429) are retryable via existing `withRetry`.

## Settings UI

The Angular settings page gains an input field for `azureDevopsUser` alongside the existing `gitAuthor` field. The API settings endpoint (`GET/PUT /settings/me`) includes the new field.

**UI details:**
- Label: "Nome de exibicao no Azure DevOps"
- Help text: "Informe seu nome de exibicao exatamente como aparece no Azure DevOps. Este nome e usado para buscar sua atividade no board."
- The field is optional — leaving it empty disables board activity collection
- `gitAuthor` and `selectedRepos` also become optional (but at least one source must be configured)
- Validation error shown if both `gitAuthor`/`selectedRepos` AND `azureDevopsUser` are empty

**Optional validation on save:** The backend can run a simple WIQL query to verify the display name returns results. If not, return a warning (not a blocking error) — the user may have no recent activity.

## Testing Strategy

### Unit tests

- **`AzureDevopsRestClientService`**: mock `fetch`. Cover: WIQL success/failure, batch work items, work item updates, auth failure (401), rate limiting (429 with Retry-After), batching for >200 IDs.
- **`AzureDevopsActivityCollectorService`**: mock REST client. Cover: activity found, no activity, filtering actions by user, multiple projects (one fails / one succeeds), rate limit batching for many work items.
- **`ExecuteGenerateStrategy` (updated)**: test all 4 activation combinations (git+board, git only, board only, none). Test partial failure scenarios (one collector fails). Test that `sourceData` is saved in new `{ git, board }` format.
- **`ExecuteRegenerateStrategy` (updated)**: test parsing old-format `sourceData` (raw git activity) and new-format `sourceData` (`{ git, board }`). Test regeneration with board-only source data.
- **`StandupPromptService` (updated)**: test system prompt generation for git-only, board-only, and hybrid. Test user message with git-only, board-only, and hybrid inputs.
- **`StandupDispatchService` (updated)**: test new validation rules — reject when no sources, allow board-only, allow git-only, allow hybrid.
- **`PutMeSettingsDto` (updated)**: test cross-field validation — at least one source required.
- **`parseSourceData` utility**: test old format, new format, invalid JSON, invalid structure.

### Integration considerations

The REST API calls are isolated behind `AzureDevopsRestClientService`, making the collector fully testable without network access. The existing MCP-based enrichment remains unchanged.

## Non-goals

- Replacing the MCP client for git enrichment — the existing flow works and is not touched
- Supporting data sources beyond Azure DevOps (Jira, Linear, etc.) — out of scope
- Role-specific standup templates (different format for QA vs PM) — the LLM adapts naturally based on the type of activity data it receives
- Webhooks or real-time event ingestion — polling via WIQL is sufficient for daily standup generation
- Per-user PATs — the shared PAT from env vars is used for all board queries (same as git/MCP today)
