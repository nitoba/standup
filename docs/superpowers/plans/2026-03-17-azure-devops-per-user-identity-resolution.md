# Azure DevOps Per-User Identity Resolution Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolve each user's Azure DevOps UUID at settings-save time so PR filtering in the enrichment pipeline uses the correct identity, not the global PAT owner's.

**Architecture:** Add `resolveIdentity()` to the existing REST client using the `vssps.dev.azure.com` Identity API. On `PUT /settings/me`, resolve `azureDevopsUser` (email or display name) to a UUID stored in a new `azure_devops_uuid` column. Thread this UUID through `StandupJobOptions` → `GenerateStandupInput` → `enrichWithFallback()` → `enrichGitActivity()`, replacing the `getMe()` MCP call.

**Tech Stack:** NestJS, Drizzle ORM (SQLite/libSQL), Azure DevOps REST API v7.1, Vitest, better-result

**Spec:** `docs/superpowers/specs/2026-03-17-azure-devops-per-user-identity-resolution-design.md`

---

## Chunk 1: Foundation — Schema, REST Client, Repository

### Task 1: Add `azureDevopsUuid` column to database schema

**Files:**
- Modify: `apps/api/src/platform/database/schema.ts:116`
- Modify: `apps/api/src/platform/database/repositories/user-settings.repository.ts:8-20,85,117-119`

- [ ] **Step 1: Add column to Drizzle schema**

In `apps/api/src/platform/database/schema.ts`, add the new column after `azureDevopsUser` (line 116):

```ts
azureDevopsUser: text('azure_devops_user'),
azureDevopsUuid: text('azure_devops_uuid'),
```

- [ ] **Step 2: Add field to `UpsertUserSettingsInput`**

In `apps/api/src/platform/database/repositories/user-settings.repository.ts`, add to the `UpsertUserSettingsInput` interface (after line 19):

```ts
export interface UpsertUserSettingsInput {
  userId: string
  standupCron?: string
  reminderCron?: string
  recoveryCron?: string
  timezone?: string
  selectedRepos?: string
  gitAuthor: string
  gitSincePeriod?: string
  active?: boolean
  emailTheme?: 'light' | 'dark'
  azureDevopsUser?: string | null
  azureDevopsUuid?: string | null
}
```

- [ ] **Step 3: Add `azureDevopsUuid` to upsert insert values**

In the `upsert()` method, add after line 85 (`azureDevopsUser: input.azureDevopsUser ?? null,`):

```ts
azureDevopsUuid: input.azureDevopsUuid ?? null,
```

- [ ] **Step 4: Add `azureDevopsUuid` to upsert conflict update set**

After lines 117-119 (`azureDevopsUser` conditional update), add:

```ts
...(input.azureDevopsUuid !== undefined && {
  azureDevopsUuid: input.azureDevopsUuid,
}),
```

- [ ] **Step 5: Generate and apply migration**

```bash
cd apps/api && bun run db:generate && bun run db:migrate
```

Expected: new migration SQL file with `ALTER TABLE user_settings ADD COLUMN azure_devops_uuid text`.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/platform/database/schema.ts apps/api/src/platform/database/repositories/user-settings.repository.ts apps/api/drizzle/
git commit -m "feat(db): add azure_devops_uuid column to user_settings"
```

---

### Task 2: Add `resolveIdentity()` to REST client (TDD)

**Files:**
- Modify: `apps/api/src/contexts/standups/worker/azure-devops/azure-devops-rest-client.service.ts`
- Modify: `apps/api/src/contexts/standups/worker/azure-devops/azure-devops-rest-client.service.spec.ts`

- [ ] **Step 1: Write failing tests for `resolveIdentity()`**

Add the following test cases to `azure-devops-rest-client.service.spec.ts`. The test file already exists and has a pattern for mocking `fetch`. Add a new `describe('resolveIdentity')` block:

```ts
describe('resolveIdentity', () => {
  it('should return id and displayName when exactly one active non-group user matches', async () => {
    mockFetch({
      ok: true,
      json: async () => ({
        count: 1,
        value: [
          {
            id: 'abc-123-uuid',
            providerDisplayName: 'John Doe',
            isActive: true,
            isContainer: false,
          },
        ],
      }),
    })

    const result = await service.resolveIdentity('john@company.com')

    expect(result.isOk()).toBe(true)
    expect(result.value).toEqual({
      id: 'abc-123-uuid',
      displayName: 'John Doe',
    })
  })

  it('should filter out inactive users and groups', async () => {
    mockFetch({
      ok: true,
      json: async () => ({
        count: 3,
        value: [
          {
            id: 'active-user',
            providerDisplayName: 'John Doe',
            isActive: true,
            isContainer: false,
          },
          {
            id: 'inactive-user',
            providerDisplayName: 'Jane Inactive',
            isActive: false,
            isContainer: false,
          },
          {
            id: 'group-id',
            providerDisplayName: 'Some Group',
            isActive: true,
            isContainer: true,
          },
        ],
      }),
    })

    const result = await service.resolveIdentity('john@company.com')

    expect(result.isOk()).toBe(true)
    expect(result.value).toEqual({
      id: 'active-user',
      displayName: 'John Doe',
    })
  })

  it('should return error when no active users match', async () => {
    mockFetch({
      ok: true,
      json: async () => ({ count: 0, value: [] }),
    })

    const result = await service.resolveIdentity('nobody@company.com')

    expect(result.isErr()).toBe(true)
    expect(result.error.message).toContain('nobody@company.com')
  })

  it('should return error when multiple active users match', async () => {
    mockFetch({
      ok: true,
      json: async () => ({
        count: 2,
        value: [
          { id: 'user-1', providerDisplayName: 'John A', isActive: true, isContainer: false },
          { id: 'user-2', providerDisplayName: 'John B', isActive: true, isContainer: false },
        ],
      }),
    })

    const result = await service.resolveIdentity('John')

    expect(result.isErr()).toBe(true)
    expect(result.error.message).toContain('Multiple')
  })

  it('should return error on HTTP failure', async () => {
    mockFetch({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      text: async () => 'Invalid PAT',
    })

    const result = await service.resolveIdentity('john@company.com')

    expect(result.isErr()).toBe(true)
    expect(result.error.message).toContain('resolveIdentity failed')
  })

  it('should call vssps.dev.azure.com with correct parameters', async () => {
    mockFetch({
      ok: true,
      json: async () => ({ count: 1, value: [{ id: 'x', providerDisplayName: 'X', isActive: true, isContainer: false }] }),
    })

    await service.resolveIdentity('test user')

    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining('vssps.dev.azure.com'),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: expect.any(String) }),
      }),
    )
    const calledUrl = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
    expect(calledUrl).toContain('searchFilter=General')
    expect(calledUrl).toContain('filterValue=test%20user')
  })
})
```

Note: adapt the `mockFetch` helper to match the existing test file's pattern. The test file already mocks `globalThis.fetch`.

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd apps/api && bun vitest run src/contexts/standups/worker/azure-devops/azure-devops-rest-client.service.spec.ts
```

Expected: FAIL — `resolveIdentity` is not a function.

- [ ] **Step 3: Implement `resolveIdentity()` in the REST client**

In `apps/api/src/contexts/standups/worker/azure-devops/azure-devops-rest-client.service.ts`:

Add a `vsspsBaseUrl` field (after line 10):

```ts
private readonly baseUrl: string
private readonly vsspsBaseUrl: string
private readonly authHeader: string
```

In the constructor (after line 15):

```ts
constructor(private readonly runtimeConfig: WorkerRuntimeConfigService) {
  const { AZURE_DEVOPS_ORG, AZURE_DEVOPS_PAT } = this.runtimeConfig.config
  this.baseUrl = `https://dev.azure.com/${AZURE_DEVOPS_ORG}`
  this.vsspsBaseUrl = `https://vssps.dev.azure.com/${AZURE_DEVOPS_ORG}`
  this.authHeader = `Basic ${Buffer.from(`:${AZURE_DEVOPS_PAT}`).toString('base64')}`
}
```

Add the method after `getWorkItemUpdates()` (before `assertOk`):

```ts
async resolveIdentity(
  filterValue: string,
): Promise<Result<{ id: string; displayName: string }, ExternalServiceError>> {
  return Result.tryPromise({
    try: async () => {
      const encoded = encodeURIComponent(filterValue)
      const url = `${this.vsspsBaseUrl}/_apis/identities?searchFilter=General&filterValue=${encoded}&queryMembership=None&api-version=7.1`
      const response = await fetch(url, {
        method: 'GET',
        headers: { Authorization: this.authHeader },
      })

      await this.assertOk(response)

      const data = (await response.json()) as {
        value: Array<{
          id: string
          providerDisplayName: string
          isActive: boolean
          isContainer?: boolean
        }>
      }

      const activeUsers = data.value.filter(
        (identity) => identity.isActive && !identity.isContainer,
      )

      if (activeUsers.length === 0) {
        throw new Error(
          `No Azure DevOps user found matching '${filterValue}'`,
        )
      }

      if (activeUsers.length > 1) {
        throw new Error(
          `Multiple Azure DevOps users match '${filterValue}'. Use email for a more precise match.`,
        )
      }

      return {
        id: activeUsers[0].id,
        displayName: activeUsers[0].providerDisplayName,
      }
    },
    catch: (error) => this.toError('resolveIdentity', error),
  })
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd apps/api && bun vitest run src/contexts/standups/worker/azure-devops/azure-devops-rest-client.service.spec.ts
```

Expected: all `resolveIdentity` tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/contexts/standups/worker/azure-devops/azure-devops-rest-client.service.ts apps/api/src/contexts/standups/worker/azure-devops/azure-devops-rest-client.service.spec.ts
git commit -m "feat(azure-devops): add resolveIdentity to REST client for user UUID lookup"
```

---

## Chunk 2: Settings Integration — DI and Identity Resolution on Save

### Task 3: Extract REST client provider for settings module (avoid MCP side-effect)

**Context:** `AzureDevopsModule` registers `AzureDevopsMcpClientService` which implements `OnModuleInit` and auto-connects to an MCP subprocess. Importing the full `AzureDevopsModule` into `PreferencesModule` would trigger this connection on app startup even when the preferences context doesn't need MCP. Instead, provide the REST client directly in `PreferencesModule`.

**Files:**
- Modify: `apps/api/src/contexts/preferences/preferences.module.ts`

- [ ] **Step 1: Add REST client and its dependency to PreferencesModule**

```ts
import { Module } from '@nestjs/common'
import { DatabaseModule } from '../../platform/database/database.module'
import { AzureDevopsRestClientService } from '../standups/worker/azure-devops/azure-devops-rest-client.service'
import { WorkerRuntimeConfigModule } from '../standups/worker/worker-runtime-config.module'
import { MeSettingsController } from './me/me-settings.controller'
import { MeSettingsService } from './me/me-settings.service'

@Module({
  imports: [DatabaseModule, WorkerRuntimeConfigModule],
  controllers: [MeSettingsController],
  providers: [MeSettingsService, AzureDevopsRestClientService],
})
export class PreferencesModule {}
```

`WorkerRuntimeConfigModule` provides `WorkerRuntimeConfigService` which the REST client constructor needs. This avoids importing the full `AzureDevopsModule` and its MCP `OnModuleInit`.

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/contexts/preferences/preferences.module.ts
git commit -m "feat(preferences): provide AzureDevopsRestClientService for identity resolution"
```

---

### Task 4: Add identity resolution to settings save flow (TDD)

**Files:**
- Modify: `apps/api/src/contexts/preferences/me/me-settings.service.ts`
- Modify: `apps/api/src/contexts/preferences/me/me-settings.service.spec.ts`
- Modify: `apps/api/src/contexts/preferences/me/me-settings.dto.ts`

- [ ] **Step 1: Write failing tests for identity resolution in settings save**

Add test cases to `me-settings.service.spec.ts`. The service already has tests. Add a new `describe('azureDevopsUuid resolution')` block. The test needs to mock `AzureDevopsRestClientService`:

```ts
// Add to the existing mocks setup
const mockResolveIdentity = vi.fn()

// In the test module setup, add to providers:
// { provide: AzureDevopsRestClientService, useValue: { resolveIdentity: mockResolveIdentity } }

describe('azureDevopsUuid resolution', () => {
  it('should resolve UUID when azureDevopsUser is provided and changed', async () => {
    mockResolveIdentity.mockResolvedValue(
      Result.ok({ id: 'resolved-uuid', displayName: 'John Doe' }),
    )
    // mock findByUserId to return existing settings with different azureDevopsUser
    mockFindByUserId.mockResolvedValue(
      Result.ok({ ...existingSettings, azureDevopsUser: 'old-user' }),
    )

    await service.put(userId, {
      ...validBody,
      azureDevopsUser: 'john@company.com',
    })

    expect(mockResolveIdentity).toHaveBeenCalledWith('john@company.com')
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        azureDevopsUser: 'john@company.com',
        azureDevopsUuid: 'resolved-uuid',
      }),
    )
  })

  it('should throw BadRequestException when user not found in Azure DevOps', async () => {
    mockResolveIdentity.mockResolvedValue(
      Result.err(new ExternalServiceError({
        service: 'azure-devops',
        message: "No Azure DevOps user found matching 'nobody@x.com'",
      })),
    )

    await expect(
      service.put(userId, { ...validBody, azureDevopsUser: 'nobody@x.com' }),
    ).rejects.toThrow(BadRequestException)
  })

  it('should clear both fields when azureDevopsUser is empty', async () => {
    mockFindByUserId.mockResolvedValue(
      Result.ok({ ...existingSettings, azureDevopsUser: 'old-user', azureDevopsUuid: 'old-uuid' }),
    )

    await service.put(userId, { ...validBody, azureDevopsUser: '' })

    expect(mockResolveIdentity).not.toHaveBeenCalled()
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        azureDevopsUser: null,
        azureDevopsUuid: null,
      }),
    )
  })

  it('should skip lookup when azureDevopsUser has not changed', async () => {
    mockFindByUserId.mockResolvedValue(
      Result.ok({ ...existingSettings, azureDevopsUser: 'same@company.com' }),
    )

    await service.put(userId, {
      ...validBody,
      azureDevopsUser: 'same@company.com',
    })

    expect(mockResolveIdentity).not.toHaveBeenCalled()
  })
})
```

Note: Adapt mock names and setup patterns to match the existing test file structure. Read the existing test file to understand the mock patterns before writing.

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd apps/api && bun vitest run src/contexts/preferences/me/me-settings.service.spec.ts
```

Expected: FAIL — `resolveIdentity` not called / `azureDevopsUuid` not in upsert call.

- [ ] **Step 3: Inject REST client into MeSettingsService**

In `apps/api/src/contexts/preferences/me/me-settings.service.ts`, add import and constructor injection:

```ts
import { AzureDevopsRestClientService } from '../../standups/worker/azure-devops/azure-devops-rest-client.service'
```

Update constructor (add after `eventBus` parameter):

```ts
constructor(
  private readonly loggerFactory: AppLoggerFactory,
  private readonly userSettingsRepository: UserSettingsRepository,
  private readonly localDateService: LocalDateService,
  private readonly eventBus: EventBusService,
  private readonly azureDevopsRestClient: AzureDevopsRestClientService,
) {
```

- [ ] **Step 4: Implement identity resolution in `put()` method**

In the `put()` method, after the data source validation block (line 94) and before the `currentResult` read (line 97), add identity resolution logic:

```ts
// Resolve Azure DevOps UUID if user changed
const currentResult = await this.userSettingsRepository.findByUserId(userId)
const previousRepos =
  currentResult.isOk() && currentResult.value
    ? parseSelectedRepos(currentResult.value.selectedRepos)
    : []

let azureDevopsUuid: string | null = null
const trimmedAzureUser = body.azureDevopsUser?.trim() || null

if (trimmedAzureUser) {
  const currentAzureUser =
    currentResult.isOk() && currentResult.value
      ? currentResult.value.azureDevopsUser
      : null

  if (trimmedAzureUser !== currentAzureUser) {
    const resolveResult =
      await this.azureDevopsRestClient.resolveIdentity(trimmedAzureUser)

    if (resolveResult.isErr()) {
      throw new BadRequestException(resolveResult.error.message)
    }

    azureDevopsUuid = resolveResult.value.id
  } else {
    // Preserve existing UUID
    azureDevopsUuid =
      currentResult.isOk() && currentResult.value
        ? currentResult.value.azureDevopsUuid ?? null
        : null
  }
}

const result = await this.userSettingsRepository.upsert({
  userId,
  standupCron: body.standupCron,
  reminderCron: body.reminderCron,
  recoveryCron: body.recoveryCron,
  timezone: body.timezone,
  gitAuthor: body.gitAuthor ?? '',
  gitSincePeriod: body.gitSincePeriod ?? DEFAULT_SETTINGS.gitSincePeriod,
  selectedRepos: JSON.stringify(body.selectedRepos ?? []),
  azureDevopsUser: trimmedAzureUser,
  azureDevopsUuid,
  ...(body.active !== undefined && { active: body.active }),
  ...(body.emailTheme !== undefined && { emailTheme: body.emailTheme }),
})
```

Note: The `currentResult` read (which was already there for repo diff) is reused. Remove the duplicate read. Since Task 1 already added the column to the Drizzle schema, the inferred type includes `azureDevopsUuid` — no cast needed.

- [ ] **Step 5: Add `azureDevopsUuid` to the return value mapping**

In the `get()` and `put()` return blocks, the `MeSettingsRecord` type needs `azureDevopsUuid`. Update the DTO and both methods.

In `me-settings.dto.ts`, update `MeSettingsRecord`:

```ts
export type MeSettingsRecord = {
  standupCron: string
  reminderCron: string
  recoveryCron: string
  timezone: string
  gitAuthor: string
  gitSincePeriod: string
  selectedRepos: string[]
  active: boolean
  emailTheme: 'light' | 'dark'
  snoozedUntil: number | null
  cancelledDate: string | null
  azureDevopsUser: string | null
  azureDevopsUuid: string | null
}
```

Update `DEFAULT_SETTINGS` in `me-settings.service.ts`:

```ts
const DEFAULT_SETTINGS: MeSettingsRecord = {
  standupCron: '30 17 * * 1-5',
  reminderCron: '20 17 * * 1-5',
  recoveryCron: '0 18 * * 1-5',
  timezone: 'America/Sao_Paulo',
  gitAuthor: '',
  gitSincePeriod: '8 hours ago',
  selectedRepos: [],
  active: true,
  emailTheme: 'dark',
  snoozedUntil: null,
  cancelledDate: null,
  azureDevopsUser: null,
  azureDevopsUuid: null,
}
```

Add to `get()` return (after line 81):

```ts
azureDevopsUuid: result.value.azureDevopsUuid ?? null,
```

Add to `put()` return (after line 153):

```ts
azureDevopsUuid: result.value.azureDevopsUuid ?? null,
```

- [ ] **Step 6: Update existing tests for the new `azureDevopsUuid` field**

Existing tests in `me-settings.service.spec.ts` will break because:
- `createService()` helper now needs a 5th constructor arg (the REST client mock)
- `get()` and `put()` return values now include `azureDevopsUuid`
- `upsert` call assertions need `azureDevopsUuid` in the expected object

Update the test file:
- Add `resolveIdentity: vi.fn()` to a mock object and pass it as the 5th `as never` arg in `createService()`
- Update `makeSettingsRow()` (or equivalent fixture) to include `azureDevopsUuid: null`
- Update all return value assertions to include `azureDevopsUuid: null` (or the expected value)
- Update `upsert` call assertions to include `azureDevopsUuid: null`

- [ ] **Step 7: Run tests to verify they pass**

```bash
cd apps/api && bun vitest run src/contexts/preferences/me/me-settings.service.spec.ts
```

Expected: all tests PASS including the new `azureDevopsUuid resolution` describe block and the updated existing tests.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/contexts/preferences/me/
git commit -m "feat(settings): resolve Azure DevOps UUID on settings save via Identity API"
```

---

## Chunk 3: Pipeline Threading — StandupJobOptions to Enrichment

### Task 5: Add `azureDevopsUuid` to `StandupJobOptions` and `GenerateStandupInput`

**Files:**
- Modify: `apps/api/src/contexts/standups/worker/standup/types.ts:3-17`
- Modify: `apps/api/src/shared/domain/types.ts:88-94`

- [ ] **Step 1: Add field to `StandupJobOptions`**

In `apps/api/src/contexts/standups/worker/standup/types.ts`, add after `azureDevopsUser?` (line 8):

```ts
export interface StandupJobOptions {
  userId: string
  discordUserId: string
  selectedRepos: string[]
  gitAuthor: string
  azureDevopsUser?: string
  azureDevopsUuid?: string
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

- [ ] **Step 2: Add field to `GenerateStandupInput`**

In `apps/api/src/shared/domain/types.ts`, add after `extraContext?` (line 93):

```ts
export interface GenerateStandupInput {
  date: string
  meetingType: string
  gitActivity?: GatheredGitActivity
  boardActivity?: GatheredBoardActivity
  extraContext?: string
  azureDevopsUuid?: string
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/contexts/standups/worker/standup/types.ts apps/api/src/shared/domain/types.ts
git commit -m "feat(types): add azureDevopsUuid to StandupJobOptions and GenerateStandupInput"
```

---

### Task 6: Thread UUID through dispatch and scheduler

**Files:**
- Modify: `apps/api/src/contexts/standups/worker/standup/standup-dispatch.service.ts:82-90`
- Modify: `apps/api/src/contexts/standups/worker/standup/standup-dispatch.service.spec.ts`
- Modify: `apps/api/src/contexts/standups/worker/scheduler/worker-scheduler.service.ts:95-106,131-141`
- Modify: `apps/api/src/contexts/standups/worker/scheduler/worker-scheduler.service.spec.ts`

- [ ] **Step 1: Write failing test for dispatch — UUID in job options**

In `standup-dispatch.service.spec.ts`, add a test that verifies `azureDevopsUuid` flows from settings to job options:

```ts
it('should include azureDevopsUuid in job options when available in settings', async () => {
  mockFindByUserId.mockResolvedValue(
    Result.ok({
      ...mockSettings,
      azureDevopsUser: 'john@company.com',
      azureDevopsUuid: 'resolved-uuid-123',
    }),
  )

  await service.dispatchStandupJobForUser('user-1')

  expect(mockRunStandupJob).toHaveBeenCalledWith(
    expect.objectContaining({
      azureDevopsUuid: 'resolved-uuid-123',
    }),
  )
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/api && bun vitest run src/contexts/standups/worker/standup/standup-dispatch.service.spec.ts
```

- [ ] **Step 3: Add `azureDevopsUuid` to dispatch resolve**

In `standup-dispatch.service.ts`, in `resolveStandupJobOptionsForUser()` at line 87, add the UUID:

```ts
return Result.ok({
  userId,
  discordUserId: discordResult.value,
  selectedRepos,
  gitAuthor: settingsResult.value.gitAuthor,
  azureDevopsUser: azureDevopsUser || undefined,
  azureDevopsUuid: settingsResult.value.azureDevopsUuid || undefined,
  timezone: settingsResult.value.timezone,
  gitSincePeriod: settingsResult.value.gitSincePeriod,
})
```

- [ ] **Step 4: Run dispatch tests**

```bash
cd apps/api && bun vitest run src/contexts/standups/worker/standup/standup-dispatch.service.spec.ts
```

Expected: PASS.

- [ ] **Step 5: Write failing tests for scheduler — passes azureDevopsUser and UUID**

In `worker-scheduler.service.spec.ts`, first update `makeSettings` to include the new column (after `azureDevopsUser: null,`):

```ts
azureDevopsUuid: null,
```

Then add two new test cases after the existing recovery test:

```ts
it('dispatches standup job with azureDevopsUser and azureDevopsUuid when configured', async () => {
  isCronDueNowMock.mockImplementation(
    (expression: string) => expression === 'standup-cron',
  )

  const standupDispatch = {
    dispatchStandupJob: vi.fn(),
  }
  const service = new WorkerSchedulerService(
    makeLoggerFactory() as never,
    {
      config: { REPOS_ROOT_PATH: '/repos', SCHEDULER_ENABLED: true },
    } as never,
    {
      clearExpiredSnoozes: vi.fn().mockResolvedValue(Result.ok(0)),
      findAllActive: vi.fn().mockResolvedValue(
        Result.ok([
          makeSettings({
            azureDevopsUser: 'john@company.com',
            azureDevopsUuid: 'uuid-123',
          }),
        ]),
      ),
    } as never,
    {
      findDiscordIdByUserId: vi.fn().mockResolvedValue(Result.ok('discord-1')),
    } as never,
    {
      findStaleRuns: vi.fn().mockResolvedValue(Result.ok([])),
      findByJobAndDate: vi.fn().mockResolvedValue(Result.ok(null)),
      releaseLock: vi.fn(),
    } as never,
    standupDispatch as never,
    { dispatchWeeklyDigestJob: vi.fn() } as never,
    { notifyReminder: vi.fn() } as never,
    {
      fromDate: vi.fn().mockReturnValue({
        iso: '2026-03-13',
        display: '13/03/2026',
      }),
    } as never,
  )

  await service.handleSchedulerTick()

  expect(standupDispatch.dispatchStandupJob).toHaveBeenCalledWith(
    expect.objectContaining({
      userId: 'user-1',
      discordUserId: 'discord-1',
      azureDevopsUser: 'john@company.com',
      azureDevopsUuid: 'uuid-123',
    }),
  )
})

it('dispatches recovery job with azureDevopsUser and azureDevopsUuid', async () => {
  isCronDueNowMock.mockImplementation(
    (expression: string) => expression === 'recovery-cron',
  )

  const standupDispatch = {
    dispatchStandupJob: vi.fn(),
  }
  const service = new WorkerSchedulerService(
    makeLoggerFactory() as never,
    {
      config: { REPOS_ROOT_PATH: '/repos', SCHEDULER_ENABLED: true },
    } as never,
    {
      clearExpiredSnoozes: vi.fn().mockResolvedValue(Result.ok(0)),
      findAllActive: vi.fn().mockResolvedValue(
        Result.ok([
          makeSettings({
            azureDevopsUser: 'john@company.com',
            azureDevopsUuid: 'uuid-123',
          }),
        ]),
      ),
    } as never,
    {
      findDiscordIdByUserId: vi.fn().mockResolvedValue(Result.ok('discord-1')),
    } as never,
    {
      findStaleRuns: vi.fn().mockResolvedValue(Result.ok([])),
      findByJobAndDate: vi.fn().mockResolvedValue(Result.ok(null)),
      releaseLock: vi.fn(),
    } as never,
    standupDispatch as never,
    { dispatchWeeklyDigestJob: vi.fn() } as never,
    { notifyReminder: vi.fn() } as never,
    {
      fromDate: vi.fn().mockReturnValue({
        iso: '2026-03-13',
        display: '13/03/2026',
      }),
    } as never,
  )

  await service.handleSchedulerTick()

  expect(standupDispatch.dispatchStandupJob).toHaveBeenCalledWith(
    expect.objectContaining({
      azureDevopsUser: 'john@company.com',
      azureDevopsUuid: 'uuid-123',
    }),
  )
})
```

- [ ] **Step 6: Run tests to verify they fail**

```bash
cd apps/api && bun vitest run src/contexts/standups/worker/scheduler/worker-scheduler.service.spec.ts
```

Expected: FAIL — dispatch calls don't include `azureDevopsUser` or `azureDevopsUuid`.

- [ ] **Step 7: Add fields to scheduler dispatch**

In `worker-scheduler.service.ts`, update the standup cron dispatch block (lines 98-106):

```ts
if (isCronDueNow(settings.standupCron, timezone, now)) {
  const selectedRepos = parseSelectedRepos(settings.selectedRepos)
  const azureDevopsUser = settings.azureDevopsUser?.trim() || ''
  if (selectedRepos.length > 0 || azureDevopsUser) {
    this.standupDispatch.dispatchStandupJob({
      userId: settings.userId,
      discordUserId: discordResult.value,
      selectedRepos,
      gitAuthor: settings.gitAuthor,
      azureDevopsUser: azureDevopsUser || undefined,
      azureDevopsUuid: settings.azureDevopsUuid || undefined,
      timezone,
      gitSincePeriod: settings.gitSincePeriod,
    })
  }
}
```

Do the same for the recovery cron dispatch block (lines 131-141):

```ts
const recoveryRepos = parseSelectedRepos(settings.selectedRepos)
const recoveryAzureUser = settings.azureDevopsUser?.trim() || ''
if (recoveryRepos.length > 0 || recoveryAzureUser) {
  this.standupDispatch.dispatchStandupJob({
    userId: settings.userId,
    discordUserId: discordResult.value,
    selectedRepos: recoveryRepos,
    gitAuthor: settings.gitAuthor,
    azureDevopsUser: recoveryAzureUser || undefined,
    azureDevopsUuid: settings.azureDevopsUuid || undefined,
    timezone,
    gitSincePeriod: settings.gitSincePeriod,
  })
}
```

Note: The condition changes from `recoveryRepos.length > 0` to also accept Azure DevOps-only users (who have no git repos). Same for the standup cron block.

- [ ] **Step 8: Run scheduler tests**

```bash
cd apps/api && bun vitest run src/contexts/standups/worker/scheduler/worker-scheduler.service.spec.ts
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/contexts/standups/worker/standup/standup-dispatch.service.ts apps/api/src/contexts/standups/worker/standup/standup-dispatch.service.spec.ts apps/api/src/contexts/standups/worker/scheduler/worker-scheduler.service.ts apps/api/src/contexts/standups/worker/scheduler/worker-scheduler.service.spec.ts
git commit -m "feat(worker): thread azureDevopsUuid through dispatch and scheduler"
```

---

### Task 7: Thread UUID through execute-generate-strategy → generator → enrichment (TDD)

**Files:**
- Modify: `apps/api/src/contexts/standups/worker/standup/strategies/execute-generate-strategy.ts:136-143`
- Modify: `apps/api/src/contexts/standups/worker/standup-generator/standup-generator.service.ts:49-61,265-287`
- Modify: `apps/api/src/contexts/standups/worker/azure-devops/azure-devops-enrichment.service.ts:27-48`
- Create: `apps/api/src/contexts/standups/worker/azure-devops/azure-devops-enrichment.service.spec.ts`

- [ ] **Step 1: Write enrichment service tests (new test file)**

Create `apps/api/src/contexts/standups/worker/azure-devops/azure-devops-enrichment.service.spec.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import { Result } from '../../../../shared/domain'
import type { GatheredGitActivity, RepoActivity } from '../../../../shared/domain'
import { AzureDevopsEnrichmentService } from './azure-devops-enrichment.service'

function makeLoggerFactory() {
  return {
    create: vi.fn(() => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      child: vi.fn(),
    })),
  }
}

function makeActivity(repos: Partial<RepoActivity>[] = []): GatheredGitActivity {
  return {
    timestamp: '2026-03-17T17:00:00Z',
    repos: repos.map((r) => ({
      repoName: r.repoName ?? 'repo-a',
      repoPath: r.repoPath ?? '/repos/repo-a',
      commits: r.commits ?? [{ hash: 'abc', subject: 'feat: x', body: '', sourceBranch: 'main', filesChanged: 1, insertions: 1, deletions: 0, files: ['a.ts'] }],
      cardNumbers: r.cardNumbers ?? ['123'],
    })),
  }
}

describe('AzureDevopsEnrichmentService', () => {
  function createService(mcpOverrides: Record<string, unknown> = {}) {
    const mcpClient = {
      getMe: vi.fn(),
      getWorkItem: vi.fn().mockResolvedValue(Result.ok({ id: '123', title: 'Task', state: 'Active', assignedTo: 'user' })),
      listPullRequests: vi.fn().mockResolvedValue(Result.ok([
        { id: 1, title: 'PR 1', status: 'active', repoId: 'repo-a', creatorId: 'uuid-match' },
        { id: 2, title: 'PR 2', status: 'active', repoId: 'repo-a', creatorId: 'uuid-other' },
      ])),
      ...mcpOverrides,
    }
    const service = new AzureDevopsEnrichmentService(
      makeLoggerFactory() as never,
      mcpClient as never,
    )
    return { service, mcpClient }
  }

  it('should not call getMe when azureDevopsUuid is provided', async () => {
    const { service, mcpClient } = createService()

    await service.enrichGitActivity(makeActivity([{}]), 'uuid-match')

    expect(mcpClient.getMe).not.toHaveBeenCalled()
  })

  it('should filter PRs by the provided azureDevopsUuid', async () => {
    const { service } = createService()

    const result = await service.enrichGitActivity(makeActivity([{}]), 'uuid-match')

    expect(result.isOk()).toBe(true)
    if (result.isOk()) {
      const prs = result.value.repos[0].enrichedItems[0].pullRequests
      expect(prs).toHaveLength(1)
      expect(prs[0].creatorId).toBe('uuid-match')
    }
  })

  it('should include all PRs when azureDevopsUuid is not provided', async () => {
    const { service } = createService()

    const result = await service.enrichGitActivity(makeActivity([{}]))

    expect(result.isOk()).toBe(true)
    if (result.isOk()) {
      const prs = result.value.repos[0].enrichedItems[0].pullRequests
      expect(prs).toHaveLength(2)
    }
  })

  it('should set userUuid from the provided parameter', async () => {
    const { service } = createService()

    const result = await service.enrichGitActivity(makeActivity([{}]), 'my-uuid')

    expect(result.isOk()).toBe(true)
    if (result.isOk()) {
      expect(result.value.userUuid).toBe('my-uuid')
    }
  })

  it('should set userUuid to unknown when parameter is absent', async () => {
    const { service } = createService()

    const result = await service.enrichGitActivity(makeActivity([{}]))

    expect(result.isOk()).toBe(true)
    if (result.isOk()) {
      expect(result.value.userUuid).toBe('unknown')
    }
  })

  it('should return error when no repos have commits', async () => {
    const { service } = createService()
    const emptyActivity: GatheredGitActivity = {
      timestamp: '2026-03-17T17:00:00Z',
      repos: [{ repoName: 'repo-a', repoPath: '/repos/repo-a', commits: [], cardNumbers: [] }],
    }

    const result = await service.enrichGitActivity(emptyActivity, 'uuid')

    expect(result.isErr()).toBe(true)
  })
})
```

- [ ] **Step 2: Run enrichment tests to verify they fail**

```bash
cd apps/api && bun vitest run src/contexts/standups/worker/azure-devops/azure-devops-enrichment.service.spec.ts
```

Expected: FAIL — `getMe` is still called, PR filtering doesn't use the parameter, `userUuid` comes from `getMe`.

- [ ] **Step 3: Pass `azureDevopsUuid` into `GenerateStandupInput` from strategy**

In `execute-generate-strategy.ts`, update the `generateStandup` call (lines 136-143):

```ts
this.standupGenerator.generateStandup(
  {
    date: today,
    meetingType,
    gitActivity: gitActivity ?? undefined,
    boardActivity: boardActivity ?? undefined,
    extraContext: options.extraContext?.trim() || undefined,
    azureDevopsUuid: options.azureDevopsUuid,
  },
```

- [ ] **Step 4: Thread UUID through `generateStandup` → `enrichWithFallback`**

In `standup-generator.service.ts`, update `enrichWithFallback` signature (line 265):

```ts
private async enrichWithFallback(
  gitActivity: GatheredGitActivity,
  azureDevopsUuid?: string,
): Promise<EnrichedGitActivity> {
  const enrichmentResult = await this.withRetry(
    () =>
      this.azureDevopsEnrichment.enrichGitActivity(
        gitActivity,
        azureDevopsUuid,
      ),
    'Azure DevOps enrichment',
    2,
    3_000,
  )

  if (enrichmentResult.isOk()) {
    return enrichmentResult.value
  }

  return {
    timestamp: gitActivity.timestamp,
    userUuid: azureDevopsUuid ?? 'unknown',
    repos: gitActivity.repos.map((repo) => ({
      ...repo,
      enrichedItems: [],
    })),
  }
}
```

Update the call site in `generateStandup` (line 60):

```ts
enrichedActivity = await this.enrichWithFallback(
  input.gitActivity,
  input.azureDevopsUuid,
)
```

- [ ] **Step 5: Update enrichment service — remove `getMe()`, accept UUID param**

In `azure-devops-enrichment.service.ts`, update `enrichGitActivity`:

```ts
async enrichGitActivity(
  activity: GatheredGitActivity,
  azureDevopsUuid?: string,
): Promise<Result<EnrichedGitActivity, ExternalServiceError>> {
  const activeRepos = activity.repos.filter(
    (repo: RepoActivity) => repo.commits.length > 0,
  )

  if (activeRepos.length === 0) {
    return Result.err(
      new ExternalServiceError({
        service: 'git',
        message: 'No commits found in the configured time window',
      }),
    )
  }

  const userUuid = azureDevopsUuid ?? 'unknown'
  const enrichedRepos: EnrichedRepo[] = []

  for (const repo of activeRepos) {
    const cardNumbers = [...repo.cardNumbers]
    const enrichedItems: EnrichedWorkItem[] = []

    for (const cardNumber of cardNumbers) {
      const workItemResult =
        await this.azureDevopsMcpClient.getWorkItem(cardNumber)

      if (workItemResult.isErr()) {
        this.logger.warn(
          `Failed to fetch work item ${cardNumber}: ${workItemResult.error.message}`,
        )
        enrichedItems.push({ cardNumber, workItem: null, pullRequests: [] })
        continue
      }

      const pullRequestsResult =
        await this.azureDevopsMcpClient.listPullRequests(repo.repoName)
      const pullRequests = pullRequestsResult.isOk()
        ? azureDevopsUuid
          ? pullRequestsResult.value.filter(
              (pullRequest) => pullRequest.creatorId === azureDevopsUuid,
            )
          : pullRequestsResult.value
        : []

      enrichedItems.push({
        cardNumber,
        workItem: workItemResult.value,
        pullRequests,
      })
    }

    enrichedRepos.push({
      repoName: repo.repoName,
      repoPath: repo.repoPath,
      commits: repo.commits,
      cardNumbers: repo.cardNumbers,
      enrichedItems,
    })
  }

  return Result.ok({
    timestamp: activity.timestamp,
    repos: enrichedRepos,
    userUuid,
  })
}
```

Key changes from original:
- Removed `getMe()` call and its error handling (lines 43-48 deleted)
- UUID comes from parameter, defaults to `'unknown'`
- PR filtering: if `azureDevopsUuid` provided, filter by it; otherwise include all PRs (graceful fallback)

- [ ] **Step 6: Run enrichment tests to verify they pass**

```bash
cd apps/api && bun vitest run src/contexts/standups/worker/azure-devops/azure-devops-enrichment.service.spec.ts
```

Expected: all 6 enrichment tests PASS.

- [ ] **Step 7: Run all affected tests**

```bash
cd apps/api && bun vitest run
```

Expected: all tests PASS. Some existing tests in other files may need updating since `getMe()` is no longer called — remove mock expectations for `getMe` where encountered.

- [ ] **Step 8: Fix any broken tests**

If existing tests mock `getMe()` in the enrichment flow, remove those mocks and update expectations. The enrichment now receives the UUID as a parameter instead of calling `getMe()`.

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/contexts/standups/worker/standup/strategies/execute-generate-strategy.ts apps/api/src/contexts/standups/worker/standup-generator/standup-generator.service.ts apps/api/src/contexts/standups/worker/azure-devops/azure-devops-enrichment.service.ts apps/api/src/contexts/standups/worker/azure-devops/azure-devops-enrichment.service.spec.ts
git commit -m "feat(enrichment): replace getMe() with per-user azureDevopsUuid from settings"
```

---

## Chunk 4: Verification

### Task 8: Run full CI pipeline

- [ ] **Step 1: Run lint**

```bash
bun run lint
```

Expected: PASS.

- [ ] **Step 2: Run typecheck**

```bash
bun run typecheck
```

Expected: PASS. Verify no type errors from the new `azureDevopsUuid` fields across all files.

- [ ] **Step 3: Run tests**

```bash
bun run test
```

Expected: all tests PASS.

- [ ] **Step 4: Run build**

```bash
bun run build
```

Expected: PASS.

- [ ] **Step 5: Commit any remaining fixes**

If any step above required fixes, commit them:

```bash
git add -A
git commit -m "fix: address CI issues from per-user identity resolution"
```
