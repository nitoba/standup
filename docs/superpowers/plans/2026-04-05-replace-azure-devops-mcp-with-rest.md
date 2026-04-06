# Replace Azure DevOps MCP with Direct REST API Calls

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate `@modelcontextprotocol/sdk` dependency by moving all Azure DevOps calls from the MCP client to the existing REST client.

**Architecture:** Add 3 new methods to `AzureDevopsRestClientService` (`getWorkItem`, `listPullRequests`, `listRepositories`), swap the dependency in `AzureDevopsEnrichmentService`, then delete the MCP client and remove the SDK dependency.

**Tech Stack:** TypeScript, NestJS, Vitest, Azure DevOps REST API v7.1

---

### Task 1: Add `getWorkItem` to REST client (TDD)

**Files:**
- Modify: `apps/api/src/contexts/standups/worker/azure-devops/azure-devops-rest-client.service.ts`
- Modify: `apps/api/src/contexts/standups/worker/azure-devops/azure-devops-rest-client.service.spec.ts`

- [ ] **Step 1: Write the failing tests**

Add inside the existing `describe('AzureDevopsRestClientService')` block, after the `getWorkItemUpdates` describe, in `azure-devops-rest-client.service.spec.ts`:

```typescript
describe('getWorkItem', () => {
  it('returns work item detail for a valid ID', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        id: 123,
        fields: {
          'System.Title': 'Fix login bug',
          'System.State': 'Active',
          'System.AssignedTo': {
            uniqueName: 'john@company.com',
          },
        },
      }),
    })

    const service = createService()
    const result = await service.getWorkItem(123)

    expect(result.isOk()).toBe(true)
    if (result.isOk()) {
      expect(result.value).toEqual({
        id: '123',
        title: 'Fix login bug',
        state: 'Active',
        assignedTo: 'john@company.com',
      })
    }
  })

  it('handles AssignedTo as plain string', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        id: 456,
        fields: {
          'System.Title': 'Task',
          'System.State': 'New',
          'System.AssignedTo': 'jane@company.com',
        },
      }),
    })

    const service = createService()
    const result = await service.getWorkItem(456)

    expect(result.isOk()).toBe(true)
    if (result.isOk()) {
      expect(result.value?.assignedTo).toBe('jane@company.com')
    }
  })

  it('returns null when work item has no fields', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 789 }),
    })

    const service = createService()
    const result = await service.getWorkItem(789)

    expect(result.isOk()).toBe(true)
    if (result.isOk()) {
      expect(result.value).toBeNull()
    }
  })

  it('returns ExternalServiceError on HTTP error', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      text: async () => 'Work item not found',
    })

    const service = createService()
    const result = await service.getWorkItem(999)

    expect(result.isErr()).toBe(true)
    if (result.isErr()) {
      expect(result.error._tag).toBe('ExternalServiceError')
      expect(result.error.message).toContain('getWorkItem')
    }
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/api && bun run vitest run src/contexts/standups/worker/azure-devops/azure-devops-rest-client.service.spec.ts`
Expected: FAIL — `service.getWorkItem is not a function`

- [ ] **Step 3: Implement `getWorkItem`**

Add this method to `AzureDevopsRestClientService` in `azure-devops-rest-client.service.ts`, after the `getWorkItemUpdates` method and before `resolveIdentity`:

```typescript
async getWorkItem(
  id: number,
): Promise<Result<WorkItemDetail | null, ExternalServiceError>> {
  const { AZURE_DEVOPS_DEFAULT_PROJECT } = this.runtimeConfig.config

  return Result.tryPromise({
    try: async () => {
      const url = `${this.baseUrl}/${AZURE_DEVOPS_DEFAULT_PROJECT}/_apis/wit/workitems/${id}?fields=System.Title,System.State,System.AssignedTo&api-version=7.1`
      const response = await fetch(url, {
        method: 'GET',
        headers: { Authorization: this.authHeader },
      })

      await this.assertOk(response)

      const parsed = (await response.json()) as {
        id?: number
        fields?: {
          'System.Title'?: string
          'System.State'?: string
          'System.AssignedTo'?: { uniqueName?: string } | string
        }
      }

      if (!parsed.fields) {
        return null
      }

      const assignedTo = parsed.fields['System.AssignedTo']
      const assignedToEmail =
        typeof assignedTo === 'object'
          ? (assignedTo?.uniqueName ?? '')
          : (assignedTo ?? '')

      return {
        id: String(parsed.id ?? id),
        title: parsed.fields['System.Title'] ?? '',
        state: parsed.fields['System.State'] ?? '',
        assignedTo: assignedToEmail,
      }
    },
    catch: (error) => this.toError('getWorkItem', error),
  })
}
```

Also add the import for `WorkItemDetail` at the top of the file. Update the existing import line:

```typescript
import type { WorkItemDetail, WorkItemResponse, WorkItemUpdate } from './types'
```

Update `makeRuntimeConfig` in the test file to include `AZURE_DEVOPS_DEFAULT_PROJECT`:

```typescript
function makeRuntimeConfig(org = 'my-org', pat = 'my-pat') {
  return {
    config: {
      AZURE_DEVOPS_ORG: org,
      AZURE_DEVOPS_PAT: pat,
      AZURE_DEVOPS_DEFAULT_PROJECT: 'MyProject',
    },
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/api && bun run vitest run src/contexts/standups/worker/azure-devops/azure-devops-rest-client.service.spec.ts`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/contexts/standups/worker/azure-devops/azure-devops-rest-client.service.ts apps/api/src/contexts/standups/worker/azure-devops/azure-devops-rest-client.service.spec.ts
git commit -m "feat: add getWorkItem to AzureDevopsRestClientService"
```

---

### Task 2: Add `listPullRequests` to REST client (TDD)

**Files:**
- Modify: `apps/api/src/contexts/standups/worker/azure-devops/azure-devops-rest-client.service.ts`
- Modify: `apps/api/src/contexts/standups/worker/azure-devops/azure-devops-rest-client.service.spec.ts`

- [ ] **Step 1: Write the failing tests**

Add inside the existing `describe('AzureDevopsRestClientService')` block in the spec file:

```typescript
describe('listPullRequests', () => {
  it('returns pull requests for a repository', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        value: [
          {
            pullRequestId: 1,
            title: 'Add feature',
            status: 'active',
            repository: { id: 'repo-uuid' },
            createdBy: { id: 'user-uuid' },
          },
          {
            pullRequestId: 2,
            title: 'Fix bug',
            status: 'completed',
            repository: { id: 'repo-uuid' },
            createdBy: { id: 'other-uuid' },
          },
        ],
      }),
    })

    const service = createService()
    const result = await service.listPullRequests('my-repo')

    expect(result.isOk()).toBe(true)
    if (result.isOk()) {
      expect(result.value).toHaveLength(2)
      expect(result.value[0]).toEqual({
        id: 1,
        title: 'Add feature',
        status: 'active',
        repoId: 'repo-uuid',
        creatorId: 'user-uuid',
      })
      expect(result.value[1]?.status).toBe('completed')
    }
  })

  it('normalizes unknown status to active', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        value: [
          {
            pullRequestId: 3,
            title: 'Draft',
            status: 'notSet',
            repository: { id: 'r' },
            createdBy: { id: 'u' },
          },
        ],
      }),
    })

    const service = createService()
    const result = await service.listPullRequests('my-repo')

    expect(result.isOk()).toBe(true)
    if (result.isOk()) {
      expect(result.value[0]?.status).toBe('active')
    }
  })

  it('returns empty array when no pull requests exist', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ value: [] }),
    })

    const service = createService()
    const result = await service.listPullRequests('my-repo')

    expect(result.isOk()).toBe(true)
    if (result.isOk()) {
      expect(result.value).toEqual([])
    }
  })

  it('returns ExternalServiceError on HTTP error', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
      statusText: 'Forbidden',
      text: async () => 'Access denied',
    })

    const service = createService()
    const result = await service.listPullRequests('my-repo')

    expect(result.isErr()).toBe(true)
    if (result.isErr()) {
      expect(result.error._tag).toBe('ExternalServiceError')
      expect(result.error.message).toContain('listPullRequests')
    }
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/api && bun run vitest run src/contexts/standups/worker/azure-devops/azure-devops-rest-client.service.spec.ts`
Expected: FAIL — `service.listPullRequests is not a function`

- [ ] **Step 3: Implement `listPullRequests`**

Add this method to `AzureDevopsRestClientService` after `getWorkItem`, and add the `PullRequestDetail` import:

Update the import line:
```typescript
import type { PullRequestDetail, WorkItemDetail, WorkItemResponse, WorkItemUpdate } from './types'
```

Add the method:
```typescript
async listPullRequests(
  repositoryId: string,
): Promise<Result<PullRequestDetail[], ExternalServiceError>> {
  const { AZURE_DEVOPS_DEFAULT_PROJECT } = this.runtimeConfig.config

  return Result.tryPromise({
    try: async () => {
      const url = `${this.baseUrl}/${AZURE_DEVOPS_DEFAULT_PROJECT}/_apis/git/repositories/${repositoryId}/pullrequests?searchCriteria.status=all&api-version=7.1`
      const response = await fetch(url, {
        method: 'GET',
        headers: { Authorization: this.authHeader },
      })

      await this.assertOk(response)

      const data = (await response.json()) as {
        value: Array<{
          pullRequestId?: number
          title?: string
          status?: string
          repository?: { id?: string }
          createdBy?: { id?: string }
        }>
      }

      return data.value
        .filter((pr) => typeof pr.pullRequestId === 'number')
        .map((pr) => ({
          id: pr.pullRequestId ?? 0,
          title: pr.title ?? '',
          status: this.normalizePullRequestStatus(pr.status),
          repoId: pr.repository?.id ?? repositoryId,
          creatorId: pr.createdBy?.id ?? '',
        }))
    },
    catch: (error) => this.toError('listPullRequests', error),
  })
}

private normalizePullRequestStatus(
  status: string | undefined,
): 'active' | 'completed' | 'abandoned' {
  if (status === 'completed') return 'completed'
  if (status === 'abandoned') return 'abandoned'
  return 'active'
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/api && bun run vitest run src/contexts/standups/worker/azure-devops/azure-devops-rest-client.service.spec.ts`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/contexts/standups/worker/azure-devops/azure-devops-rest-client.service.ts apps/api/src/contexts/standups/worker/azure-devops/azure-devops-rest-client.service.spec.ts
git commit -m "feat: add listPullRequests to AzureDevopsRestClientService"
```

---

### Task 3: Add `listRepositories` to REST client (TDD)

**Files:**
- Modify: `apps/api/src/contexts/standups/worker/azure-devops/azure-devops-rest-client.service.ts`
- Modify: `apps/api/src/contexts/standups/worker/azure-devops/azure-devops-rest-client.service.spec.ts`

- [ ] **Step 1: Write the failing tests**

Add inside the existing `describe('AzureDevopsRestClientService')` block in the spec file:

```typescript
describe('listRepositories', () => {
  it('returns repositories for a project', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        value: [
          { id: 'repo-1', name: 'frontend', project: { name: 'AGROTRACE' } },
          { id: 'repo-2', name: 'backend', project: { name: 'AGROTRACE' } },
        ],
      }),
    })

    const service = createService()
    const result = await service.listRepositories('AGROTRACE')

    expect(result.isOk()).toBe(true)
    if (result.isOk()) {
      expect(result.value).toHaveLength(2)
      expect(result.value[0]).toEqual({
        id: 'repo-1',
        name: 'frontend',
        project: 'AGROTRACE',
      })
    }
  })

  it('filters out entries missing id or name', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        value: [
          { id: 'repo-1', name: 'valid', project: { name: 'P' } },
          { id: null, name: 'no-id', project: { name: 'P' } },
          { id: 'repo-3', name: null, project: { name: 'P' } },
        ],
      }),
    })

    const service = createService()
    const result = await service.listRepositories('P')

    expect(result.isOk()).toBe(true)
    if (result.isOk()) {
      expect(result.value).toHaveLength(1)
      expect(result.value[0]?.name).toBe('valid')
    }
  })

  it('falls back to project param when project.name is missing', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        value: [{ id: 'repo-1', name: 'app' }],
      }),
    })

    const service = createService()
    const result = await service.listRepositories('FALLBACK')

    expect(result.isOk()).toBe(true)
    if (result.isOk()) {
      expect(result.value[0]?.project).toBe('FALLBACK')
    }
  })

  it('returns ExternalServiceError on HTTP error', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      text: async () => 'Server error',
    })

    const service = createService()
    const result = await service.listRepositories('P')

    expect(result.isErr()).toBe(true)
    if (result.isErr()) {
      expect(result.error._tag).toBe('ExternalServiceError')
      expect(result.error.message).toContain('listRepositories')
    }
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/api && bun run vitest run src/contexts/standups/worker/azure-devops/azure-devops-rest-client.service.spec.ts`
Expected: FAIL — `service.listRepositories is not a function`

- [ ] **Step 3: Implement `listRepositories`**

Add the `RepoInfo` import:
```typescript
import type { PullRequestDetail, RepoInfo, WorkItemDetail, WorkItemResponse, WorkItemUpdate } from './types'
```

Add the method after `listPullRequests`:
```typescript
async listRepositories(
  project: string,
): Promise<Result<RepoInfo[], ExternalServiceError>> {
  return Result.tryPromise({
    try: async () => {
      const url = `${this.baseUrl}/${project}/_apis/git/repositories?api-version=7.1`
      const response = await fetch(url, {
        method: 'GET',
        headers: { Authorization: this.authHeader },
      })

      await this.assertOk(response)

      const data = (await response.json()) as {
        value: Array<{
          id?: string
          name?: string
          project?: { name?: string }
        }>
      }

      return data.value
        .filter(
          (repo) =>
            typeof repo.id === 'string' && typeof repo.name === 'string',
        )
        .map((repo) => ({
          id: repo.id ?? '',
          name: repo.name ?? '',
          project: repo.project?.name ?? project,
        }))
    },
    catch: (error) => this.toError('listRepositories', error),
  })
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/api && bun run vitest run src/contexts/standups/worker/azure-devops/azure-devops-rest-client.service.spec.ts`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/contexts/standups/worker/azure-devops/azure-devops-rest-client.service.ts apps/api/src/contexts/standups/worker/azure-devops/azure-devops-rest-client.service.spec.ts
git commit -m "feat: add listRepositories to AzureDevopsRestClientService"
```

---

### Task 4: Swap EnrichmentService dependency from MCP to REST

**Files:**
- Modify: `apps/api/src/contexts/standups/worker/azure-devops/azure-devops-enrichment.service.ts`
- Modify: `apps/api/src/contexts/standups/worker/azure-devops/azure-devops-enrichment.service.spec.ts`

- [ ] **Step 1: Update the enrichment service**

In `azure-devops-enrichment.service.ts`, replace the full file imports and constructor:

Replace the import:
```typescript
import { AzureDevopsMcpClientService } from './azure-devops-mcp-client.service'
```
with:
```typescript
import { AzureDevopsRestClientService } from './azure-devops-rest-client.service'
```

Replace the constructor parameter:
```typescript
private readonly azureDevopsMcpClient: AzureDevopsMcpClientService,
```
with:
```typescript
private readonly restClient: AzureDevopsRestClientService,
```

In `enrichGitActivity`, replace:
```typescript
const workItemResult =
  await this.azureDevopsMcpClient.getWorkItem(cardNumber)
```
with:
```typescript
const workItemResult =
  await this.restClient.getWorkItem(Number(cardNumber))
```

Replace:
```typescript
const pullRequestsResult =
  await this.azureDevopsMcpClient.listPullRequests(repo.repoName)
```
with:
```typescript
const pullRequestsResult =
  await this.restClient.listPullRequests(repo.repoName)
```

In `listRepositories`, remove the `isConnected()` check (lines 100-106):
```typescript
if (!this.azureDevopsMcpClient.isConnected()) {
  return Result.err(
    new ExternalServiceError({
      service: 'azure-devops',
      message: 'Azure MCP client is not connected',
    }),
  )
}
```

Replace:
```typescript
const result = await this.azureDevopsMcpClient.listRepositories(project)
```
with:
```typescript
const result = await this.restClient.listRepositories(project)
```

- [ ] **Step 2: Update the enrichment service tests**

In `azure-devops-enrichment.service.spec.ts`, the `createService` function currently creates a mock `mcpClient` and passes it as the second constructor arg. The mock shape already matches `AzureDevopsRestClientService` methods (`getWorkItem`, `listPullRequests`), so just rename the variable for clarity:

Replace:
```typescript
function createService(mcpOverrides: Record<string, unknown> = {}) {
  const mcpClient = {
    getMe: vi.fn(),
    getWorkItem: vi.fn().mockResolvedValue(
```
with:
```typescript
function createService(restOverrides: Record<string, unknown> = {}) {
  const restClient = {
    getWorkItem: vi.fn().mockResolvedValue(
```

Remove the `getMe: vi.fn(),` line.

Replace:
```typescript
    ...mcpOverrides,
  }
  const service = new AzureDevopsEnrichmentService(
    makeLoggerFactory() as never,
    mcpClient as never,
  )
  return { service, mcpClient }
```
with:
```typescript
    ...restOverrides,
  }
  const service = new AzureDevopsEnrichmentService(
    makeLoggerFactory() as never,
    restClient as never,
  )
  return { service, restClient }
```

Update the test that references `mcpClient`:
```typescript
it('should not call getMe when azureDevopsUuid is provided', async () => {
  const { service, mcpClient } = createService()
  await service.enrichGitActivity(makeActivity([{}]), 'uuid-match')
  expect(mcpClient.getMe).not.toHaveBeenCalled()
})
```

Delete this entire test — `getMe` no longer exists.

Update remaining destructuring from `mcpClient` to `restClient` if any tests reference it.

- [ ] **Step 3: Run tests to verify they pass**

Run: `cd apps/api && bun run vitest run src/contexts/standups/worker/azure-devops/azure-devops-enrichment.service.spec.ts`
Expected: ALL PASS

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/contexts/standups/worker/azure-devops/azure-devops-enrichment.service.ts apps/api/src/contexts/standups/worker/azure-devops/azure-devops-enrichment.service.spec.ts
git commit -m "refactor: swap enrichment service dependency from MCP to REST client"
```

---

### Task 5: Remove MCP client and clean up module

**Files:**
- Delete: `apps/api/src/contexts/standups/worker/azure-devops/azure-devops-mcp-client.service.ts`
- Modify: `apps/api/src/contexts/standups/worker/azure-devops/azure-devops.module.ts`
- Modify: `apps/api/package.json`

- [ ] **Step 1: Update the module**

In `azure-devops.module.ts`, remove the MCP import and provider/export entries.

Remove the import line:
```typescript
import { AzureDevopsMcpClientService } from './azure-devops-mcp-client.service'
```

Remove `AzureDevopsMcpClientService` from both `providers` and `exports` arrays. The file should look like:

```typescript
import { Module } from '@nestjs/common'
import { WorkerRuntimeConfigModule } from '../worker-runtime-config.module'
import { AzureDevopsActivityCollectorService } from './azure-devops-activity-collector.service'
import { AzureDevopsEnrichmentService } from './azure-devops-enrichment.service'
import { AzureDevopsRestClientService } from './azure-devops-rest-client.service'

@Module({
  imports: [WorkerRuntimeConfigModule],
  providers: [
    AzureDevopsEnrichmentService,
    AzureDevopsRestClientService,
    AzureDevopsActivityCollectorService,
  ],
  exports: [
    AzureDevopsEnrichmentService,
    AzureDevopsRestClientService,
    AzureDevopsActivityCollectorService,
  ],
})
export class AzureDevopsModule {}
```

- [ ] **Step 2: Delete the MCP client file**

```bash
rm apps/api/src/contexts/standups/worker/azure-devops/azure-devops-mcp-client.service.ts
```

- [ ] **Step 3: Remove `@modelcontextprotocol/sdk` from package.json**

In `apps/api/package.json`, remove the line:
```json
"@modelcontextprotocol/sdk": "^1.27.1",
```

- [ ] **Step 4: Install dependencies to update lockfile**

Run: `cd apps/api && bun install`
Expected: lockfile updates, no errors

- [ ] **Step 5: Verify no remaining MCP references**

Run: `grep -r "modelcontextprotocol\|AzureDevopsMcpClient\|azure-devops-mcp-client" apps/api/src/ --include="*.ts"`
Expected: no output (zero matches)

- [ ] **Step 6: Run full test suite**

Run: `cd apps/api && bun run vitest run src/contexts/standups/worker/azure-devops/`
Expected: ALL PASS

- [ ] **Step 7: Run lint and typecheck**

Run: `cd apps/api && bun run lint && bun run typecheck`
Expected: no errors

- [ ] **Step 8: Commit**

```bash
git add -A apps/api/src/contexts/standups/worker/azure-devops/ apps/api/package.json bun.lock
git commit -m "refactor: remove Azure DevOps MCP client and @modelcontextprotocol/sdk dependency"
```
