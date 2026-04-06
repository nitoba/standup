# Replace Azure DevOps MCP Client with Direct REST API Calls

## Summary

Eliminate the `@modelcontextprotocol/sdk` dependency and the `AzureDevopsMcpClientService` by consolidating all Azure DevOps API calls into the existing `AzureDevopsRestClientService`. The MCP client currently spawns a subprocess (`bun x @tiberriver256/mcp-server-azure-devops`) via stdio transport for 3-4 calls that happen at specific moments — this overhead is unnecessary when the same data is available via direct REST.

## Motivation

- The MCP server subprocess is spawned on module init and kept alive, consuming resources for calls that happen only during standup generation
- All 4 MCP tools (`get_work_item`, `list_pull_requests`, `list_repositories`, `get_me`) have direct REST API equivalents
- The project already has a REST client (`AzureDevopsRestClientService`) with auth, error handling, and the same `Result` pattern
- Removing MCP simplifies deployment (no MCP server binary needed) and debugging (pure HTTP calls)

## Scope

### What changes

1. **`AzureDevopsRestClientService`** gains 3 new methods:
   - `getWorkItem(id: number)` — `GET /{defaultProject}/_apis/wit/workitems/{id}?fields=System.Title,System.State,System.AssignedTo&api-version=7.1` → `Result<WorkItemDetail | null, ExternalServiceError>`
   - `listPullRequests(repositoryId: string)` — `GET /{defaultProject}/_apis/git/repositories/{repositoryId}/pullrequests?searchCriteria.status=all&api-version=7.1` → `Result<PullRequestDetail[], ExternalServiceError>`
   - `listRepositories(project: string)` — `GET /{project}/_apis/git/repositories?api-version=7.1` → `Result<RepoInfo[], ExternalServiceError>`

2. **`AzureDevopsEnrichmentService`** swaps dependency:
   - Constructor: `AzureDevopsMcpClientService` → `AzureDevopsRestClientService`
   - `enrichGitActivity()`: calls `restClient.getWorkItem(Number(cardNumber))` and `restClient.listPullRequests(repo.repoName)` instead of MCP equivalents
   - `listRepositories()`: calls `restClient.listRepositories(project)` instead of MCP equivalent; removes `isConnected()` check (not needed for REST)

3. **`AzureDevopsModule`**: removes `AzureDevopsMcpClientService` from providers and exports

4. **Deleted files**: `azure-devops-mcp-client.service.ts`

5. **Dependency removal**: `@modelcontextprotocol/sdk` from `apps/api/package.json`

### What does NOT change

- `AzureDevopsActivityCollectorService` — already uses REST, untouched
- Types (`WorkItemDetail`, `PullRequestDetail`, `RepoInfo`, etc.) — remain identical
- Public interface of `AzureDevopsEnrichmentService` — same method signatures and return types
- Activity collector tests — untouched
- Environment variables — same `AZURE_DEVOPS_ORG`, `AZURE_DEVOPS_PAT`, `AZURE_DEVOPS_DEFAULT_PROJECT`, `AZURE_DEVOPS_PROJECTS`

## New REST Methods Detail

### `getWorkItem(id: number)`

- Endpoint: `GET /{defaultProject}/_apis/wit/workitems/{id}?fields=System.Title,System.State,System.AssignedTo&api-version=7.1`
- Uses `AZURE_DEVOPS_DEFAULT_PROJECT` from config (work items are cross-project but the API requires a project context)
- Returns `null` on 404 (work item not found)
- `AssignedTo` parsing: handles both object (`{ uniqueName }`) and string formats, matching current MCP client behavior
- Status normalization: maps raw state string directly (no transformation needed)

### `listPullRequests(repositoryId: string)`

- Endpoint: `GET /{defaultProject}/_apis/git/repositories/{repositoryId}/pullrequests?searchCriteria.status=all&api-version=7.1`
- Maps response to `PullRequestDetail[]` with status normalization (`active`/`completed`/`abandoned`)
- Extracts `createdBy.id` for UUID-based filtering in the enrichment service

### `listRepositories(project: string)`

- Endpoint: `GET /{project}/_apis/git/repositories?api-version=7.1`
- Maps to `RepoInfo[]` (id, name, project)
- Filters out entries missing `id` or `name`, matching current MCP client behavior

## Enrichment Service Changes

The `AzureDevopsEnrichmentService` changes are minimal:

- **Constructor injection**: swap `AzureDevopsMcpClientService` → `AzureDevopsRestClientService`
- **`enrichGitActivity()`**: replace `this.azureDevopsMcpClient.getWorkItem(cardNumber)` with `this.restClient.getWorkItem(Number(cardNumber))` and `this.azureDevopsMcpClient.listPullRequests(repo.repoName)` with `this.restClient.listPullRequests(repo.repoName)`
- **`listRepositories()`**: remove `isConnected()` guard, replace `this.azureDevopsMcpClient.listRepositories(project)` with `this.restClient.listRepositories(project)`
- PR filtering by `azureDevopsUuid` remains identical

## Tests

### `azure-devops-rest-client.service.spec.ts`

Add tests for the 3 new methods, following the existing pattern (mock `global.fetch`):
- `getWorkItem`: success with full fields, success returning null on 404, HTTP error
- `listPullRequests`: success with multiple PRs, status normalization, empty result
- `listRepositories`: success with multiple repos, filtering invalid entries, HTTP error

### `azure-devops-enrichment.service.spec.ts`

- Update mock provider from `AzureDevopsMcpClientService` to `AzureDevopsRestClientService`
- Same test scenarios and assertions — only the mock target changes
- Remove any `isConnected()` related tests

### Deleted

- `azure-devops-mcp-client.service.spec.ts` (if it exists) — deleted with the service

## Cleanup Checklist

1. Delete `azure-devops-mcp-client.service.ts`
2. Remove `@modelcontextprotocol/sdk` from `apps/api/package.json`
3. Run `bun install` to update lockfile
4. Remove `AzureDevopsMcpClientService` from `AzureDevopsModule` providers and exports
5. Verify no other imports reference the MCP client (confirmed: only enrichment service and module)
6. Run full test suite: `bun run test` in `apps/api`
7. Run `bun run lint` and `bun run typecheck`
