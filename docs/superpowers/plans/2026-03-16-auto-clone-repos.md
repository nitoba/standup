# Auto-Clone Repos Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automatically clone git repos when users select them in settings, with a background clone on save and a synchronous fallback before standup generation.

**Architecture:** A `RepoCloneService` in the git-collector context handles cloning via HTTPS+PAT. On settings save, a `SETTINGS_REPOS_CHANGED_EVENT` triggers background cloning of new repos. Before git collection, `ensureAllCloned` acts as a synchronous fallback. The `selectedRepos` format migrates from `"repo-name"` to `"project/repo-name"`.

**Tech Stack:** NestJS 11, Bun, Vitest, TypeScript strict, better-result (TaggedError/Result), EventEmitter2, Drizzle ORM (SQLite/libSQL)

**Spec:** `docs/superpowers/specs/2026-03-16-auto-clone-repos-design.md`

---

## Chunk 1: Pure Functions and Domain Types

### Task 1: `parseRepoIdentifier` and `ParsedRepo` type

**Files:**
- Modify: `apps/api/src/shared/repos/parse-selected-repos.ts`
- Create: `apps/api/src/shared/repos/parse-selected-repos.spec.ts`

- [ ] **Step 1: Create test file with failing tests for `parseRepoIdentifier`**

```ts
// apps/api/src/shared/repos/parse-selected-repos.spec.ts
import { describe, expect, it } from 'vitest'
import {
  parseRepoIdentifier,
  parseSelectedRepos,
} from './parse-selected-repos'

describe('parseSelectedRepos', () => {
  it('parses valid JSON array of strings', () => {
    expect(parseSelectedRepos('["a","b"]')).toEqual(['a', 'b'])
  })

  it('returns empty array for invalid JSON', () => {
    expect(parseSelectedRepos('invalid')).toEqual([])
  })

  it('filters non-string values', () => {
    expect(parseSelectedRepos('[1,"a",null]')).toEqual(['a'])
  })

  it('returns empty array for empty string', () => {
    expect(parseSelectedRepos('')).toEqual([])
  })
})

describe('parseRepoIdentifier', () => {
  it('parses project/name format', () => {
    expect(parseRepoIdentifier('AGROTRACE/my-repo', 'DEFAULT')).toEqual({
      project: 'AGROTRACE',
      name: 'my-repo',
    })
  })

  it('uses defaultProject when no slash present', () => {
    expect(parseRepoIdentifier('my-repo', 'AGROTRACE')).toEqual({
      project: 'AGROTRACE',
      name: 'my-repo',
    })
  })

  it('treats multiple slashes as error — returns defaultProject with full identifier as name', () => {
    expect(parseRepoIdentifier('ORG/PROJ/EXTRA/repo', 'DEFAULT')).toEqual({
      project: 'DEFAULT',
      name: 'ORG/PROJ/EXTRA/repo',
    })
  })

  it('handles empty string — returns defaultProject with empty name', () => {
    expect(parseRepoIdentifier('', 'DEFAULT')).toEqual({
      project: 'DEFAULT',
      name: '',
    })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun run test -- --run apps/api/src/shared/repos/parse-selected-repos.spec.ts`
Expected: FAIL — `parseRepoIdentifier` is not exported

- [ ] **Step 3: Implement `ParsedRepo` type and `parseRepoIdentifier` function**

Add to end of `apps/api/src/shared/repos/parse-selected-repos.ts`:

```ts
export interface ParsedRepo {
  project: string
  name: string
}

export function parseRepoIdentifier(
  identifier: string,
  defaultProject: string,
): ParsedRepo {
  const slashCount = (identifier.match(/\//g) ?? []).length

  if (slashCount === 0) {
    return { project: defaultProject, name: identifier }
  }

  if (slashCount > 1) {
    return { project: defaultProject, name: identifier }
  }

  const slashIndex = identifier.indexOf('/')
  return {
    project: identifier.slice(0, slashIndex),
    name: identifier.slice(slashIndex + 1),
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun run test -- --run apps/api/src/shared/repos/parse-selected-repos.spec.ts`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/shared/repos/parse-selected-repos.ts apps/api/src/shared/repos/parse-selected-repos.spec.ts
git commit -m "feat: add parseRepoIdentifier and ParsedRepo type with tests"
```

---

### Task 2: `RepoCloneError` in domain errors

**Files:**
- Modify: `apps/api/src/shared/domain/errors.ts`

- [ ] **Step 1: Add `RepoCloneError` to errors.ts**

Add at end of `apps/api/src/shared/domain/errors.ts` (after line 82):

```ts
export class RepoCloneError extends TaggedError('RepoCloneError')<{
  repo: string
  message: string
}>() {}
```

- [ ] **Step 2: Verify the domain barrel export includes the new error**

Check `apps/api/src/shared/domain/index.ts` — if it re-exports from `errors.ts`, no change needed. If not, add the export.

- [ ] **Step 3: Run typecheck**

Run: `bun run typecheck --filter=api`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/shared/domain/errors.ts
git commit -m "feat: add RepoCloneError tagged error"
```

---

### Task 3: Extract `azure-devops-git-auth.ts` pure functions

**Files:**
- Create: `apps/api/src/contexts/standups/worker/git-collector/azure-devops-git-auth.ts`
- Create: `apps/api/src/contexts/standups/worker/git-collector/azure-devops-git-auth.spec.ts`
- Modify: `apps/api/src/contexts/standups/worker/git-collector/git-collector.service.ts`

- [ ] **Step 1: Write failing tests for the pure functions**

```ts
// apps/api/src/contexts/standups/worker/git-collector/azure-devops-git-auth.spec.ts
import { describe, expect, it } from 'vitest'
import { buildAuthHeader, buildCloneUrl } from './azure-devops-git-auth'

describe('buildAuthHeader', () => {
  it('builds Basic auth header from PAT', () => {
    const header = buildAuthHeader('my-pat-token')
    const expectedBase64 = Buffer.from(':my-pat-token').toString('base64')
    expect(header).toBe(`AUTHORIZATION: Basic ${expectedBase64}`)
  })

  it('handles empty PAT', () => {
    const header = buildAuthHeader('')
    const expectedBase64 = Buffer.from(':').toString('base64')
    expect(header).toBe(`AUTHORIZATION: Basic ${expectedBase64}`)
  })
})

describe('buildCloneUrl', () => {
  it('builds Azure DevOps HTTPS clone URL', () => {
    expect(buildCloneUrl('myorg', 'AGROTRACE', 'my-repo')).toBe(
      'https://dev.azure.com/myorg/AGROTRACE/_git/my-repo',
    )
  })

  it('handles repo names with hyphens and dots', () => {
    expect(buildCloneUrl('org', 'PROJ', 'my-repo.api')).toBe(
      'https://dev.azure.com/org/PROJ/_git/my-repo.api',
    )
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun run test -- --run apps/api/src/contexts/standups/worker/git-collector/azure-devops-git-auth.spec.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement the pure functions**

```ts
// apps/api/src/contexts/standups/worker/git-collector/azure-devops-git-auth.ts
export function buildAuthHeader(pat: string): string {
  const basicAuth = Buffer.from(`:${pat}`).toString('base64')
  return `AUTHORIZATION: Basic ${basicAuth}`
}

export function buildCloneUrl(
  org: string,
  project: string,
  name: string,
): string {
  return `https://dev.azure.com/${org}/${project}/_git/${name}`
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun run test -- --run apps/api/src/contexts/standups/worker/git-collector/azure-devops-git-auth.spec.ts`
Expected: ALL PASS

- [ ] **Step 5: Refactor `GitCollectorService` to import from `azure-devops-git-auth.ts`**

In `apps/api/src/contexts/standups/worker/git-collector/git-collector.service.ts`:

1. Add import at top (after existing imports, around line 12):
   ```ts
   import { buildAuthHeader } from './azure-devops-git-auth'
   ```

2. Replace the private method `buildAzureDevopsAuthHeader` (lines 288-291) body to delegate:
   ```ts
   private buildAzureDevopsAuthHeader(pat: string): string {
     return buildAuthHeader(pat)
   }
   ```

   Note: Keep the private method as a thin wrapper to avoid changing all internal call sites. The pure function is what gets reused by `RepoCloneService`.

- [ ] **Step 6: Run existing git-collector tests to verify no regression**

Run: `bun run test -- --run apps/api/src/contexts/standups/worker/git-collector/git-collector.service.spec.ts`
Expected: ALL PASS

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/contexts/standups/worker/git-collector/azure-devops-git-auth.ts \
       apps/api/src/contexts/standups/worker/git-collector/azure-devops-git-auth.spec.ts \
       apps/api/src/contexts/standups/worker/git-collector/git-collector.service.ts
git commit -m "refactor: extract git auth helpers to azure-devops-git-auth.ts"
```

---

## Chunk 2: RepoCloneService

### Task 4: Implement `RepoCloneService`

**Files:**
- Create: `apps/api/src/contexts/standups/worker/git-collector/repo-clone.service.ts`
- Create: `apps/api/src/contexts/standups/worker/git-collector/repo-clone.service.spec.ts`

- [ ] **Step 1: Write failing tests**

```ts
// apps/api/src/contexts/standups/worker/git-collector/repo-clone.service.spec.ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  rm: vi.fn(),
  mkdir: vi.fn(),
  runGitCommand: vi.fn(),
}))

vi.mock('node:fs/promises', () => ({
  access: mocks.access,
  rm: mocks.rm,
  mkdir: mocks.mkdir,
}))

vi.mock('./run-git-command', () => ({
  runGitCommand: mocks.runGitCommand,
}))

import type { ParsedRepo } from '../../../../shared/repos/parse-selected-repos'
import { RepoCloneService } from './repo-clone.service'

function createService(overrides?: Partial<{ org: string; pat: string; reposRoot: string }>) {
  const logger = {
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  }
  const loggerFactory = { create: vi.fn().mockReturnValue(logger) }
  const runtimeConfig = {
    config: {
      REPOS_ROOT_PATH: overrides?.reposRoot ?? '/repos',
      AZURE_DEVOPS_PAT: overrides?.pat ?? 'test-pat',
      AZURE_DEVOPS_ORG: overrides?.org ?? 'test-org',
    },
  }

  return {
    logger,
    service: new RepoCloneService(loggerFactory as never, runtimeConfig as never),
  }
}

function gitOk(): { exitCode: number; stderr: Buffer; stdout: Buffer } {
  return { exitCode: 0, stderr: Buffer.from(''), stdout: Buffer.from('') }
}

function gitFail(stderr = 'fatal: repository not found'): { exitCode: number; stderr: Buffer; stdout: Buffer } {
  return { exitCode: 128, stderr: Buffer.from(stderr), stdout: Buffer.from('') }
}

describe('RepoCloneService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.access.mockRejectedValue(new Error('ENOENT'))
    mocks.rm.mockResolvedValue(undefined)
    mocks.mkdir.mockResolvedValue(undefined)
    mocks.runGitCommand.mockResolvedValue(gitOk())
  })

  const repo: ParsedRepo = { project: 'AGROTRACE', name: 'my-repo' }

  describe('ensureCloned', () => {
    it('skips clone when directory exists and is valid git repo', async () => {
      mocks.access.mockResolvedValue(undefined)
      // git rev-parse succeeds = valid git repo
      mocks.runGitCommand.mockResolvedValue(gitOk())

      const result = await createService().service.ensureCloned(repo)

      expect(result.isOk()).toBe(true)
      // runGitCommand called once for rev-parse, never for clone
      expect(mocks.runGitCommand).toHaveBeenCalledTimes(1)
      expect(mocks.runGitCommand.mock.calls[0][0]).toContain('rev-parse')
    })

    it('removes and re-clones when directory exists but is not a valid git repo', async () => {
      mocks.access.mockResolvedValue(undefined)
      // First call: rev-parse fails (not a git repo)
      // Second call: clone succeeds
      mocks.runGitCommand
        .mockResolvedValueOnce(gitFail('not a git repository'))
        .mockResolvedValueOnce(gitOk())

      const result = await createService().service.ensureCloned(repo)

      expect(result.isOk()).toBe(true)
      expect(mocks.rm).toHaveBeenCalledWith('/repos/my-repo', { recursive: true, force: true })
      expect(mocks.runGitCommand).toHaveBeenCalledTimes(2)
    })

    it('clones repo when directory does not exist', async () => {
      const result = await createService().service.ensureCloned(repo)

      expect(result.isOk()).toBe(true)
      expect(mocks.mkdir).toHaveBeenCalledWith('/repos', { recursive: true })
      const cloneArgs = mocks.runGitCommand.mock.calls[0][0] as string[]
      expect(cloneArgs).toContain('clone')
      expect(cloneArgs).toContain('https://dev.azure.com/test-org/AGROTRACE/_git/my-repo')
      expect(cloneArgs).toContain('/repos/my-repo')
    })

    it('passes correct auth header in clone command', async () => {
      await createService({ pat: 'my-pat' }).service.ensureCloned(repo)

      const cloneArgs = mocks.runGitCommand.mock.calls[0][0] as string[]
      const headerArg = cloneArgs.find((a: string) => a.startsWith('AUTHORIZATION:'))
      const expectedBase64 = Buffer.from(':my-pat').toString('base64')
      expect(headerArg).toBe(`AUTHORIZATION: Basic ${expectedBase64}`)
    })

    it('returns RepoCloneError when clone fails', async () => {
      mocks.runGitCommand.mockResolvedValue(gitFail('repository not found'))

      const result = await createService().service.ensureCloned(repo)

      expect(result.isErr()).toBe(true)
      if (result.isErr()) {
        expect(result.error._tag).toBe('RepoCloneError')
        expect(result.error.repo).toBe('my-repo')
      }
    })

    it('returns RepoCloneError when AZURE_DEVOPS_ORG is empty', async () => {
      const result = await createService({ org: '' }).service.ensureCloned(repo)

      expect(result.isErr()).toBe(true)
      if (result.isErr()) {
        expect(result.error.message).toContain('AZURE_DEVOPS_ORG')
      }
    })

    it('deduplicates concurrent clones of the same repo', async () => {
      let resolveClone: () => void
      mocks.runGitCommand.mockReturnValue(
        new Promise((resolve) => {
          resolveClone = () => resolve(gitOk())
        }),
      )

      const { service } = createService()
      const promise1 = service.ensureCloned(repo)
      const promise2 = service.ensureCloned(repo)

      resolveClone!()
      const [result1, result2] = await Promise.all([promise1, promise2])

      expect(result1.isOk()).toBe(true)
      expect(result2.isOk()).toBe(true)
      expect(mocks.runGitCommand).toHaveBeenCalledTimes(1)
    })
  })

  describe('ensureAllCloned', () => {
    const repos: ParsedRepo[] = [
      { project: 'AGROTRACE', name: 'repo-a' },
      { project: 'AGROTRACE', name: 'repo-b' },
      { project: 'OTHER', name: 'repo-c' },
    ]

    it('returns summary with cloned and alreadyExisted', async () => {
      // ensureAllCloned calls directoryExists + isValidGitRepo BEFORE ensureCloned
      // then doClone calls them AGAIN internally. Mock sequence must account for both.
      //
      // repo-a: exists + valid (ensureAllCloned check) -> exists + valid (doClone check) -> skip
      // repo-b: not exists (ensureAllCloned check) -> not exists (doClone check) -> clone
      // repo-c: not exists (ensureAllCloned check) -> not exists (doClone check) -> clone
      mocks.access
        .mockResolvedValueOnce(undefined)   // ensureAllCloned: repo-a exists
        .mockResolvedValueOnce(undefined)   // doClone: repo-a exists
        .mockRejectedValueOnce(new Error('ENOENT'))  // ensureAllCloned: repo-b not exists
        .mockRejectedValueOnce(new Error('ENOENT'))  // doClone: repo-b not exists
        .mockRejectedValueOnce(new Error('ENOENT'))  // ensureAllCloned: repo-c not exists
        .mockRejectedValueOnce(new Error('ENOENT'))  // doClone: repo-c not exists

      mocks.runGitCommand
        .mockResolvedValueOnce(gitOk())  // ensureAllCloned: rev-parse repo-a (valid)
        .mockResolvedValueOnce(gitOk())  // doClone: rev-parse repo-a (valid) -> skip clone
        .mockResolvedValueOnce(gitOk())  // doClone: clone repo-b
        .mockResolvedValueOnce(gitOk())  // doClone: clone repo-c

      const { service } = createService()
      const result = await service.ensureAllCloned(repos)

      expect(result.alreadyExisted).toHaveLength(1)
      expect(result.alreadyExisted[0].name).toBe('repo-a')
      expect(result.cloned).toHaveLength(2)
      expect(result.failed).toHaveLength(0)
    })

    it('continues processing after a clone failure', async () => {
      // All repos don't exist — access always rejects
      // repo-a: clone ok, repo-b: clone fails, repo-c: clone ok
      mocks.runGitCommand
        .mockResolvedValueOnce(gitOk())   // clone repo-a
        .mockResolvedValueOnce(gitFail()) // clone repo-b
        .mockResolvedValueOnce(gitOk())   // clone repo-c

      const { service } = createService()
      const result = await service.ensureAllCloned(repos)

      expect(result.cloned).toHaveLength(2)
      expect(result.failed).toHaveLength(1)
      expect(result.failed[0].repo.name).toBe('repo-b')
    })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun run test -- --run apps/api/src/contexts/standups/worker/git-collector/repo-clone.service.spec.ts`
Expected: FAIL — `RepoCloneService` not found

- [ ] **Step 3: Implement `RepoCloneService`**

```ts
// apps/api/src/contexts/standups/worker/git-collector/repo-clone.service.ts
import { access, mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { Injectable } from '@nestjs/common'
import { AppLoggerFactory } from '../../../../platform/logger'
import { RepoCloneError, Result } from '../../../../shared/domain'
import type { ParsedRepo } from '../../../../shared/repos/parse-selected-repos'
import { WorkerRuntimeConfigService } from '../worker-runtime-config.service'
import { buildAuthHeader, buildCloneUrl } from './azure-devops-git-auth'
import { runGitCommand } from './run-git-command'

export interface CloneResult {
  cloned: ParsedRepo[]
  alreadyExisted: ParsedRepo[]
  failed: Array<{ repo: ParsedRepo; error: RepoCloneError }>
}

@Injectable()
export class RepoCloneService {
  private readonly logger: ReturnType<AppLoggerFactory['create']>
  private readonly inFlightClones = new Map<
    string,
    Promise<Result<void, RepoCloneError>>
  >()

  constructor(
    private readonly loggerFactory: AppLoggerFactory,
    private readonly runtimeConfig: WorkerRuntimeConfigService,
  ) {
    this.logger = this.loggerFactory.create('repo-clone')
  }

  async ensureCloned(
    repo: ParsedRepo,
  ): Promise<Result<void, RepoCloneError>> {
    const key = `${repo.project}/${repo.name}`
    const existing = this.inFlightClones.get(key)
    if (existing) return existing

    const promise = this.doClone(repo).finally(() =>
      this.inFlightClones.delete(key),
    )
    this.inFlightClones.set(key, promise)
    return promise
  }

  async ensureAllCloned(repos: ParsedRepo[]): Promise<CloneResult> {
    const result: CloneResult = {
      cloned: [],
      alreadyExisted: [],
      failed: [],
    }

    for (const repo of repos) {
      const repoPath = join(
        this.runtimeConfig.config.REPOS_ROOT_PATH,
        repo.name,
      )
      const existedBefore =
        (await this.directoryExists(repoPath)) &&
        (await this.isValidGitRepo(repoPath))

      const cloneResult = await this.ensureCloned(repo)

      if (cloneResult.isErr()) {
        result.failed.push({ repo, error: cloneResult.error })
      } else if (existedBefore) {
        result.alreadyExisted.push(repo)
      } else {
        result.cloned.push(repo)
      }
    }

    return result
  }

  private async doClone(
    repo: ParsedRepo,
  ): Promise<Result<void, RepoCloneError>> {
    const { REPOS_ROOT_PATH, AZURE_DEVOPS_PAT, AZURE_DEVOPS_ORG } =
      this.runtimeConfig.config
    const targetPath = join(REPOS_ROOT_PATH, repo.name)

    if (!AZURE_DEVOPS_ORG) {
      return Result.err(
        new RepoCloneError({
          repo: repo.name,
          message:
            'AZURE_DEVOPS_ORG not configured — cannot build clone URL',
        }),
      )
    }

    // Check if directory exists
    const dirExists = await this.directoryExists(targetPath)

    if (dirExists) {
      // Validate it's a proper git repo
      const valid = await this.isValidGitRepo(targetPath)
      if (valid) {
        this.logger.debug(`Repo already exists: ${repo.name}`)
        return Result.ok(undefined)
      }

      // Corrupted — remove and re-clone
      this.logger.warn(
        `Directory exists but is not a valid git repo: ${targetPath} — removing`,
      )
      await rm(targetPath, { recursive: true, force: true })
    }

    // Ensure parent dir exists
    await mkdir(REPOS_ROOT_PATH, { recursive: true })

    // Clone
    const url = buildCloneUrl(AZURE_DEVOPS_ORG, repo.project, repo.name)
    const authHeader = buildAuthHeader(AZURE_DEVOPS_PAT)

    const cloneResult = await runGitCommand(
      [
        '-c',
        'credential.helper=',
        '-c',
        'core.askPass=echo',
        '-c',
        `http.extraheader=${authHeader}`,
        'clone',
        '--quiet',
        url,
        targetPath,
      ],
      { env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } },
    )

    if (cloneResult.exitCode !== 0) {
      const stderr = cloneResult.stderr.toString('utf-8').trim()
      this.logger.warn(`Failed to clone ${repo.name}: ${stderr}`)
      return Result.err(
        new RepoCloneError({
          repo: repo.name,
          message: `git clone failed (exit ${cloneResult.exitCode}): ${stderr}`,
        }),
      )
    }

    this.logger.info(`Cloned repo: ${repo.name} -> ${targetPath}`)
    return Result.ok(undefined)
  }

  private async directoryExists(path: string): Promise<boolean> {
    try {
      await access(path)
      return true
    } catch {
      return false
    }
  }

  private async isValidGitRepo(path: string): Promise<boolean> {
    const result = await runGitCommand([
      '-C',
      path,
      'rev-parse',
      '--is-inside-work-tree',
    ])
    return result.exitCode === 0
  }
}
```

Note: `ensureAllCloned` checks existence *before* calling `ensureCloned` to track whether a repo was already present or newly cloned. This means `directoryExists` + `isValidGitRepo` are called twice for existing repos (once in `ensureAllCloned`, once in `doClone`). This is acceptable — the double check is cheap (fs.access + git rev-parse) and avoids adding tracking state to `doClone`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun run test -- --run apps/api/src/contexts/standups/worker/git-collector/repo-clone.service.spec.ts`
Expected: ALL PASS

Adjust tests if needed — the mock setup for `ensureAllCloned` tests may need refinement for the `access` + `runGitCommand(rev-parse)` calls that happen both in `ensureAllCloned` (existedBefore check) and in `doClone`. If tests fail due to mock call ordering, adjust the mock sequences accordingly.

- [ ] **Step 5: Run typecheck**

Run: `bun run typecheck --filter=api`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/contexts/standups/worker/git-collector/repo-clone.service.ts \
       apps/api/src/contexts/standups/worker/git-collector/repo-clone.service.spec.ts
git commit -m "feat: add RepoCloneService with ensureCloned and ensureAllCloned"
```

---

## Chunk 3: Event, Listener, and Module Registration

### Task 5: Add `SETTINGS_REPOS_CHANGED_EVENT`

**Files:**
- Modify: `apps/api/src/platform/events/standup-events.ts`
- Modify: `apps/api/src/platform/events/event-bus.service.ts`

- [ ] **Step 1: Add event constant and type to `standup-events.ts`**

Add at end of `apps/api/src/platform/events/standup-events.ts` (after line 82):

```ts
export const SETTINGS_REPOS_CHANGED_EVENT = 'settings.repos-changed'

export type SettingsReposChangedEvent = {
  userId: string
  selectedRepos: string[]
}
```

- [ ] **Step 2: Add emit method to `event-bus.service.ts`**

In `apps/api/src/platform/events/event-bus.service.ts`:

1. Add to the import type block (around line 3):
   ```ts
   import type {
     // ... existing imports ...
     SettingsReposChangedEvent,
   } from './standup-events'
   ```

2. Add to the import constants block (around line 14):
   ```ts
   import {
     // ... existing imports ...
     SETTINGS_REPOS_CHANGED_EVENT,
   } from './standup-events'
   ```

3. Add the emit method inside the class (at end of class, following the pattern of existing methods):
   ```ts
   emitSettingsReposChanged(payload: SettingsReposChangedEvent): void {
     this.eventEmitter.emit(SETTINGS_REPOS_CHANGED_EVENT, payload)
   }
   ```

- [ ] **Step 3: Run typecheck**

Run: `bun run typecheck --filter=api`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/platform/events/standup-events.ts \
       apps/api/src/platform/events/event-bus.service.ts
git commit -m "feat: add SETTINGS_REPOS_CHANGED_EVENT to event bus"
```

---

### Task 6: Implement `RepoCloneListener`

**Files:**
- Create: `apps/api/src/contexts/standups/worker/git-collector/repo-clone.listener.ts`
- Create: `apps/api/src/contexts/standups/worker/git-collector/repo-clone.listener.spec.ts`

- [ ] **Step 1: Write failing tests**

```ts
// apps/api/src/contexts/standups/worker/git-collector/repo-clone.listener.spec.ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SettingsReposChangedEvent } from '../../../../platform/events/standup-events'
import { RepoCloneListener } from './repo-clone.listener'

function createListener() {
  const ensureAllCloned = vi.fn().mockResolvedValue({
    cloned: [],
    alreadyExisted: [],
    failed: [],
  })
  const repoCloneService = { ensureAllCloned }
  const logger = {
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  }
  const loggerFactory = { create: vi.fn().mockReturnValue(logger) }
  const runtimeConfig = {
    config: { AZURE_DEVOPS_DEFAULT_PROJECT: 'AGROTRACE' },
  }

  return {
    listener: new RepoCloneListener(
      loggerFactory as never,
      repoCloneService as never,
      runtimeConfig as never,
    ),
    ensureAllCloned,
    logger,
  }
}

describe('RepoCloneListener', () => {
  it('calls ensureAllCloned with parsed repos from event', async () => {
    const { listener, ensureAllCloned } = createListener()
    const event: SettingsReposChangedEvent = {
      userId: 'user-1',
      selectedRepos: ['AGROTRACE/repo-a', 'OTHER/repo-b'],
    }

    await listener.handleReposChanged(event)

    expect(ensureAllCloned).toHaveBeenCalledWith([
      { project: 'AGROTRACE', name: 'repo-a' },
      { project: 'OTHER', name: 'repo-b' },
    ])
  })

  it('logs warning when clone fails but does not throw', async () => {
    const { listener, ensureAllCloned, logger } = createListener()
    ensureAllCloned.mockResolvedValue({
      cloned: [],
      alreadyExisted: [],
      failed: [
        {
          repo: { project: 'AGROTRACE', name: 'repo-a' },
          error: { repo: 'repo-a', message: 'clone failed' },
        },
      ],
    })
    const event: SettingsReposChangedEvent = {
      userId: 'user-1',
      selectedRepos: ['AGROTRACE/repo-a'],
    }

    await expect(listener.handleReposChanged(event)).resolves.not.toThrow()
    expect(logger.warn).toHaveBeenCalled()
  })

  it('does nothing for empty selectedRepos', async () => {
    const { listener, ensureAllCloned } = createListener()
    const event: SettingsReposChangedEvent = {
      userId: 'user-1',
      selectedRepos: [],
    }

    await listener.handleReposChanged(event)

    expect(ensureAllCloned).toHaveBeenCalledWith([])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun run test -- --run apps/api/src/contexts/standups/worker/git-collector/repo-clone.listener.spec.ts`
Expected: FAIL — `RepoCloneListener` not found

- [ ] **Step 3: Implement `RepoCloneListener`**

```ts
// apps/api/src/contexts/standups/worker/git-collector/repo-clone.listener.ts
import { Injectable } from '@nestjs/common'
import { OnEvent } from '@nestjs/event-emitter'
import {
  SETTINGS_REPOS_CHANGED_EVENT,
  type SettingsReposChangedEvent,
} from '../../../../platform/events/standup-events'
import { AppLoggerFactory } from '../../../../platform/logger'
import { parseRepoIdentifier } from '../../../../shared/repos/parse-selected-repos'
import { WorkerRuntimeConfigService } from '../worker-runtime-config.service'
import { RepoCloneService } from './repo-clone.service'

@Injectable()
export class RepoCloneListener {
  private readonly logger: ReturnType<AppLoggerFactory['create']>

  constructor(
    private readonly loggerFactory: AppLoggerFactory,
    private readonly repoCloneService: RepoCloneService,
    private readonly runtimeConfig: WorkerRuntimeConfigService,
  ) {
    this.logger = this.loggerFactory.create('repo-clone-listener')
  }

  @OnEvent(SETTINGS_REPOS_CHANGED_EVENT)
  async handleReposChanged(event: SettingsReposChangedEvent): Promise<void> {
    const defaultProject =
      this.runtimeConfig.config.AZURE_DEVOPS_DEFAULT_PROJECT
    const repos = event.selectedRepos.map((id) =>
      parseRepoIdentifier(id, defaultProject),
    )

    const result = await this.repoCloneService.ensureAllCloned(repos)

    for (const { repo, error } of result.failed) {
      this.logger.warn('Background clone failed', {
        userId: event.userId,
        repo: repo.name,
        error: error.message,
      })
    }

    if (result.cloned.length > 0) {
      this.logger.info('Background clone completed', {
        userId: event.userId,
        cloned: result.cloned.map((r) => r.name),
      })
    }
  }
}
```

Note: The listener uses `AZURE_DEVOPS_DEFAULT_PROJECT` from `WorkerRuntimeConfigService` as fallback for `parseRepoIdentifier`. Repos in the event should already be in `project/name` format, but the fallback handles edge cases (e.g., legacy data not yet migrated).

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun run test -- --run apps/api/src/contexts/standups/worker/git-collector/repo-clone.listener.spec.ts`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/contexts/standups/worker/git-collector/repo-clone.listener.ts \
       apps/api/src/contexts/standups/worker/git-collector/repo-clone.listener.spec.ts
git commit -m "feat: add RepoCloneListener for background clone on settings change"
```

---

### Task 7: Register providers in `GitCollectorModule`

**Files:**
- Modify: `apps/api/src/contexts/standups/worker/git-collector/git-collector.module.ts`

- [ ] **Step 1: Update module to register new providers**

Replace content of `apps/api/src/contexts/standups/worker/git-collector/git-collector.module.ts`:

```ts
import { Module } from '@nestjs/common'
import { WorkerRuntimeConfigModule } from '../worker-runtime-config.module'
import { GitCollectorService } from './git-collector.service'
import { RepoCloneListener } from './repo-clone.listener'
import { RepoCloneService } from './repo-clone.service'

@Module({
  imports: [WorkerRuntimeConfigModule],
  providers: [GitCollectorService, RepoCloneService, RepoCloneListener],
  exports: [GitCollectorService, RepoCloneService],
})
export class GitCollectorModule {}
```

`RepoCloneService` is exported because `MeSettingsService` and `SettingsInteractionService` contexts do not need it — they emit events. Only `GitCollectorService` (within the same module) uses it directly.

- [ ] **Step 2: Run typecheck**

Run: `bun run typecheck --filter=api`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/contexts/standups/worker/git-collector/git-collector.module.ts
git commit -m "feat: register RepoCloneService and RepoCloneListener in GitCollectorModule"
```

---

## Chunk 4: GitCollectorService Fallback Integration

### Task 8: Add fallback `ensureAllCloned` to `GitCollectorService.collect()`

**Files:**
- Modify: `apps/api/src/contexts/standups/worker/git-collector/git-collector.service.ts`
- Modify: `apps/api/src/contexts/standups/worker/git-collector/git-collector.service.spec.ts`

- [ ] **Step 1: Update existing spec file — modify `createService` and add new tests**

The existing test file (`git-collector.service.spec.ts`) has a `createService` factory at lines 29-53 and a `vi.hoisted` block at lines 3-5. Modify both, then add new test cases.

**1a. Add `ensureAllCloned` to the hoisted mocks block (line 3-5):**

Replace:
```ts
const mocks = vi.hoisted(() => ({
  runGitCommand: vi.fn(),
}))
```
With:
```ts
const mocks = vi.hoisted(() => ({
  runGitCommand: vi.fn(),
  ensureAllCloned: vi.fn(),
}))
```

**1b. Update `createService` factory (lines 29-53) to add 3rd constructor arg and `AZURE_DEVOPS_DEFAULT_PROJECT`:**

Replace:
```ts
function createService(pat = 'pat-token') {
  const logger = {
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  }
  const loggerFactory = {
    create: vi.fn().mockReturnValue(logger),
  }
  const runtimeConfig = {
    config: {
      REPOS_ROOT_PATH: '/repos',
      AZURE_DEVOPS_PAT: pat,
    },
  }

  return {
    logger,
    service: new GitCollectorService(
      loggerFactory as never,
      runtimeConfig as never,
    ),
  }
}
```
With:
```ts
function createService(pat = 'pat-token') {
  const logger = {
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  }
  const loggerFactory = {
    create: vi.fn().mockReturnValue(logger),
  }
  const runtimeConfig = {
    config: {
      REPOS_ROOT_PATH: '/repos',
      AZURE_DEVOPS_PAT: pat,
      AZURE_DEVOPS_DEFAULT_PROJECT: 'AGROTRACE',
    },
  }
  const repoCloneService = {
    ensureAllCloned: mocks.ensureAllCloned.mockResolvedValue({
      cloned: [],
      alreadyExisted: [],
      failed: [],
    }),
  }

  return {
    logger,
    service: new GitCollectorService(
      loggerFactory as never,
      runtimeConfig as never,
      repoCloneService as never,
    ),
  }
}
```

All existing tests will continue to work because `ensureAllCloned` defaults to returning empty results (no clones, no failures).

**1c. Add new test cases** at the end of the `describe('GitCollectorService')` block:

```ts
  describe('collect - repo clone fallback', () => {
    it('calls ensureAllCloned before collecting commits', async () => {
      mocks.ensureAllCloned.mockResolvedValue({
        cloned: [],
        alreadyExisted: [{ project: 'AGROTRACE', name: 'my-repo' }],
        failed: [],
      })
      // Mock git commands for processRepository
      mocks.runGitCommand.mockResolvedValue(
        createGitCommandResult({ stdout: 'main' }),
      )

      const { service } = createService()
      await service.collect(['AGROTRACE/my-repo'], 'author@test.com', '8 hours ago')

      expect(mocks.ensureAllCloned).toHaveBeenCalledWith([
        { project: 'AGROTRACE', name: 'my-repo' },
      ])
    })

    it('skips failed repos from collect', async () => {
      mocks.ensureAllCloned.mockResolvedValue({
        cloned: [],
        alreadyExisted: [],
        failed: [
          {
            repo: { project: 'AGROTRACE', name: 'bad-repo' },
            error: { repo: 'bad-repo', message: 'clone failed' },
          },
        ],
      })

      const { service, logger } = createService()
      const result = await service.collect(
        ['AGROTRACE/bad-repo'],
        'author@test.com',
        '8 hours ago',
      )

      expect(result.isOk()).toBe(true)
      if (result.isOk()) {
        expect(result.value.repos).toHaveLength(0)
      }
      expect(logger.warn).toHaveBeenCalled()
    })
  })
```

- [ ] **Step 2: Run tests to verify new tests fail**

Run: `bun run test -- --run apps/api/src/contexts/standups/worker/git-collector/git-collector.service.spec.ts`
Expected: New tests FAIL — `GitCollectorService` constructor doesn't accept 3rd param yet

- [ ] **Step 3: Modify `GitCollectorService` to inject `RepoCloneService` and add fallback**

In `apps/api/src/contexts/standups/worker/git-collector/git-collector.service.ts`:

1. Add import at top (around line 12):
   ```ts
   import { parseRepoIdentifier } from '../../../../shared/repos/parse-selected-repos'
   import { RepoCloneService } from './repo-clone.service'
   ```

2. Update constructor (lines 44-49) to inject `RepoCloneService`:
   ```ts
   constructor(
     private readonly loggerFactory: AppLoggerFactory,
     private readonly runtimeConfig: WorkerRuntimeConfigService,
     private readonly repoCloneService: RepoCloneService,
   ) {
     this.logger = this.loggerFactory.create('git-collector')
   }
   ```

3. Replace the `collect` method body (lines 51-90) with:
   ```ts
   async collect(
     selectedRepos: string[],
     author: string,
     sincePeriod: string,
   ): Promise<Result<GatheredGitActivity, ExternalServiceError>> {
     try {
       const reposRootPath = this.runtimeConfig.config.REPOS_ROOT_PATH
       if (!reposRootPath) {
         return Result.err(
           new ExternalServiceError({
             service: 'git',
             message: 'REPOS_ROOT_PATH not configured',
           }),
         )
       }

       const defaultProject =
         this.runtimeConfig.config.AZURE_DEVOPS_DEFAULT_PROJECT
       const parsed = selectedRepos.map((id) =>
         parseRepoIdentifier(id, defaultProject),
       )

       // Fallback: ensure all repos are cloned before collecting
       const cloneResult =
         await this.repoCloneService.ensureAllCloned(parsed)

       for (const { repo, error } of cloneResult.failed) {
         this.logger.warn('Repo clone failed, skipping', {
           repo: repo.name,
           error: error.message,
         })
       }

       const failedKeys = new Set(
         cloneResult.failed.map((f) => `${f.repo.project}/${f.repo.name}`),
       )
       const repositoryPaths = parsed
         .filter((r) => !failedKeys.has(`${r.project}/${r.name}`))
         .map((r) => join(reposRootPath, r.name))

       const repositories = await Promise.all(
         repositoryPaths.map((path) =>
           this.processRepository(path, author, sincePeriod),
         ),
       )

       return Result.ok({
         timestamp: new Date().toISOString(),
         repos: repositories.filter(
           (repository) => repository.commits.length > 0,
         ),
       })
     } catch (error) {
       return Result.err(
         new ExternalServiceError({
           service: 'git',
           message: `git collection failed: ${error instanceof Error ? error.message : String(error)}`,
         }),
       )
     }
   }
   ```

- [ ] **Step 4: Run all git-collector tests**

Run: `bun run test -- --run apps/api/src/contexts/standups/worker/git-collector/git-collector.service.spec.ts`
Expected: ALL PASS (existing tests need `createService` update for 3rd constructor arg)

If existing tests fail because they don't pass `repoCloneService`, the `createService` factory already handles it via the mock added in Step 1.

- [ ] **Step 5: Run typecheck**

Run: `bun run typecheck --filter=api`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/contexts/standups/worker/git-collector/git-collector.service.ts \
       apps/api/src/contexts/standups/worker/git-collector/git-collector.service.spec.ts
git commit -m "feat: add ensureAllCloned fallback to GitCollectorService.collect()"
```

---

## Chunk 5: Settings Event Emission

### Task 9: Add event emission to `MeSettingsService.put()`

**Files:**
- Modify: `apps/api/src/contexts/preferences/me/me-settings.service.ts`
- Modify or create: `apps/api/src/contexts/preferences/me/me-settings.service.spec.ts`

- [ ] **Step 1: Update existing test file with event emission tests**

The file `me-settings.service.spec.ts` already exists. You need to:
1. Update the existing `createService` factory to add `EventBusService` as the 4th constructor arg
2. Add new test cases for the event emission behavior

**Merge instructions:** Find the existing `createService()` or service construction pattern, add a mock `eventBus` with `emitSettingsReposChanged: vi.fn()`, and pass it as 4th arg. Then add the new tests below to the existing `describe` block.

**Merge instructions for existing test file:**

The existing `me-settings.service.spec.ts` has a `createService()` factory (around lines 7-31) that constructs the service with 3 args. You need to:

1. Add an `emitSettingsReposChanged` mock to the existing mock setup
2. Update the existing `createService()` to pass `eventBus` as the 4th constructor arg
3. Add the new test cases below to the existing describe block

**Updating the existing `createService()`:**

The existing factory looks like:
```ts
function createService() {
  // ... existing mocks for loggerFactory, userSettingsRepository, localDateService ...
  return new MeSettingsService(
    loggerFactory as never,
    userSettingsRepository as never,
    localDateService as never,
  )
}
```

Update to:
```ts
const emitSettingsReposChanged = vi.fn()
const eventBus = { emitSettingsReposChanged }

function createService() {
  // ... existing mocks unchanged ...
  return new MeSettingsService(
    loggerFactory as never,
    userSettingsRepository as never,
    localDateService as never,
    eventBus as never,
  )
}
```

This ensures all existing tests continue to work (they don't assert on `eventBus`, so the extra arg is harmless).

**New test helper** (add near existing helpers):

```ts
function makeSettingsRow(overrides: Record<string, unknown> = {}) {
  return {
    standupCron: '30 17 * * 1-5',
    reminderCron: '20 17 * * 1-5',
    recoveryCron: '0 18 * * 1-5',
    timezone: 'America/Sao_Paulo',
    gitAuthor: 'author@test.com',
    gitSincePeriod: '8 hours ago',
    selectedRepos: '[]',
    active: true,
    emailTheme: 'dark',
    snoozedUntil: null,
    cancelledDate: null,
    ...overrides,
  }
}
```

**New test cases** to add inside the existing `describe('MeSettingsService')`:

```ts
  describe('put — event emission', () => {
    const putBody = {
      standupCron: '30 17 * * 1-5',
      reminderCron: '20 17 * * 1-5',
      recoveryCron: '0 18 * * 1-5',
      timezone: 'America/Sao_Paulo',
      gitAuthor: 'author@test.com',
      selectedRepos: ['AGROTRACE/old-repo', 'AGROTRACE/new-repo'],
    } as never

    beforeEach(() => {
      emitSettingsReposChanged.mockClear()
    })

    it('emits SETTINGS_REPOS_CHANGED_EVENT when new repos are added', async () => {
      // Use existing mock variables from the test file's scope (findByUserId, upsert, etc.)
      findByUserId.mockResolvedValue(
        Result.ok(makeSettingsRow({ selectedRepos: '["AGROTRACE/old-repo"]' })),
      )
      upsert.mockResolvedValue(
        Result.ok(makeSettingsRow({ selectedRepos: '["AGROTRACE/old-repo","AGROTRACE/new-repo"]' })),
      )

      const service = createService()
      await service.put('user-1', putBody)

      expect(emitSettingsReposChanged).toHaveBeenCalledWith({
        userId: 'user-1',
        selectedRepos: ['AGROTRACE/new-repo'],
      })
    })

    it('does NOT emit event when repos have not changed', async () => {
      findByUserId.mockResolvedValue(
        Result.ok(makeSettingsRow({ selectedRepos: '["AGROTRACE/repo-a"]' })),
      )
      upsert.mockResolvedValue(
        Result.ok(makeSettingsRow({ selectedRepos: '["AGROTRACE/repo-a"]' })),
      )

      const service = createService()
      await service.put('user-1', {
        ...putBody,
        selectedRepos: ['AGROTRACE/repo-a'],
      } as never)

      expect(emitSettingsReposChanged).not.toHaveBeenCalled()
    })

    it('emits all repos as new when user has no previous settings', async () => {
      findByUserId.mockResolvedValue(Result.ok(null))
      upsert.mockResolvedValue(
        Result.ok(makeSettingsRow({ selectedRepos: '["AGROTRACE/repo-a"]' })),
      )

      const service = createService()
      await service.put('user-1', {
        ...putBody,
        selectedRepos: ['AGROTRACE/repo-a'],
      } as never)

      expect(emitSettingsReposChanged).toHaveBeenCalledWith({
        userId: 'user-1',
        selectedRepos: ['AGROTRACE/repo-a'],
      })
    })
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun run test -- --run apps/api/src/contexts/preferences/me/me-settings.service.spec.ts`
Expected: FAIL — constructor expects 3 args, tests pass 4

- [ ] **Step 3: Modify `MeSettingsService` to inject `EventBusService` and emit event**

In `apps/api/src/contexts/preferences/me/me-settings.service.ts`:

1. Add import (after line 3):
   ```ts
   import { EventBusService } from '../../../platform/events/event-bus.service'
   ```

2. Update constructor (lines 34-39) to add 4th parameter:
   ```ts
   constructor(
     private readonly loggerFactory: AppLoggerFactory,
     private readonly userSettingsRepository: UserSettingsRepository,
     private readonly localDateService: LocalDateService,
     private readonly eventBus: EventBusService,
   ) {
     this.logger = this.loggerFactory.create('me-settings-service')
   }
   ```

3. Replace the `put` method (lines 77-117) with:
   ```ts
   async put(userId: string, body: PutMeSettingsDto): Promise<MeSettingsRecord> {
     // Read current settings for repo diff
     const currentResult = await this.userSettingsRepository.findByUserId(userId)
     const previousRepos =
       currentResult.isOk() && currentResult.value
         ? parseSelectedRepos(currentResult.value.selectedRepos)
         : []

     const result = await this.userSettingsRepository.upsert({
       userId,
       standupCron: body.standupCron,
       reminderCron: body.reminderCron,
       recoveryCron: body.recoveryCron,
       timezone: body.timezone,
       gitAuthor: body.gitAuthor,
       gitSincePeriod: body.gitSincePeriod ?? DEFAULT_SETTINGS.gitSincePeriod,
       selectedRepos: JSON.stringify(body.selectedRepos),
       ...(body.active !== undefined && { active: body.active }),
       ...(body.emailTheme !== undefined && { emailTheme: body.emailTheme }),
     })

     if (result.isErr()) {
       this.logger.error('Failed to persist user settings', {
         userId,
         error: result.error.message,
       })
       throw new InternalServerErrorException('Internal server error')
     }

     // Emit event if there are new repos
     const previousSet = new Set(previousRepos)
     const newRepos = body.selectedRepos.filter((r) => !previousSet.has(r))
     if (newRepos.length > 0) {
       this.eventBus.emitSettingsReposChanged({
         userId,
         selectedRepos: newRepos,
       })
     }

     return {
       standupCron: result.value.standupCron,
       reminderCron: result.value.reminderCron,
       recoveryCron: result.value.recoveryCron,
       timezone: result.value.timezone,
       gitAuthor: result.value.gitAuthor,
       gitSincePeriod: result.value.gitSincePeriod,
       selectedRepos: parseSelectedRepos(result.value.selectedRepos),
       active: result.value.active,
       emailTheme: result.value.emailTheme,
       snoozedUntil: result.value.snoozedUntil,
       cancelledDate: result.value.cancelledDate
         ? this.localDateService.formatIsoForTimezone(
             result.value.cancelledDate,
             result.value.timezone,
           )
         : null,
     }
   }
   ```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun run test -- --run apps/api/src/contexts/preferences/me/me-settings.service.spec.ts`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/contexts/preferences/me/me-settings.service.ts \
       apps/api/src/contexts/preferences/me/me-settings.service.spec.ts
git commit -m "feat: emit SETTINGS_REPOS_CHANGED_EVENT on new repo selection"
```

---

### Task 10: Add event emission and `project/name` format to `SettingsInteractionService`

**Files:**
- Modify: `apps/api/src/interfaces/discord/handlers/settings-interaction.service.ts`

- [ ] **Step 1: Update `showSettingsModal` — change `.setValue()` and `.setDefault()`**

In `apps/api/src/interfaces/discord/handlers/settings-interaction.service.ts`, around lines 295-303, change the repo options builder:

Replace:
```ts
const repoOptions = availableRepos
  .slice(0, 25)
  .map((repo) =>
    new StringSelectMenuOptionBuilder()
      .setLabel(`${repo.project}/${repo.name}`.slice(0, 100))
      .setValue(repo.name.slice(0, 100))
      .setDescription(`Projeto: ${repo.project}`.slice(0, 100))
      .setDefault(currentSelected.includes(repo.name)),
  )
```

With:
```ts
const repoOptions = availableRepos
  .slice(0, 25)
  .map((repo) => {
    const repoIdentifier = `${repo.project}/${repo.name}`
    return new StringSelectMenuOptionBuilder()
      .setLabel(repoIdentifier.slice(0, 100))
      .setValue(repoIdentifier.slice(0, 100))
      .setDescription(`Projeto: ${repo.project}`.slice(0, 100))
      .setDefault(currentSelected.includes(repoIdentifier))
  })
```

- [ ] **Step 2: Update `handleModal` — add pre-read for diff and event emission**

In `apps/api/src/interfaces/discord/handlers/settings-interaction.service.ts`:

1. Add import for `EventBusService` (at top of file):
   ```ts
   import { EventBusService } from '../../../platform/events/event-bus.service'
   ```

2. Add `EventBusService` to constructor. Find the constructor and add:
   ```ts
   private readonly eventBus: EventBusService,
   ```

3. In `handleModal` method (around line 218-226), add pre-read and event emission:

   Before the `upsert` call, add:
   ```ts
   // Read current settings for repo diff
   const currentSettingsResult = await this.settingsRepository.findByUserId(session.userId)
   const previousRepos =
     currentSettingsResult.isOk() && currentSettingsResult.value
       ? parseSelectedRepos(currentSettingsResult.value.selectedRepos)
       : []
   ```

   Add import for `parseSelectedRepos` at top of file:
   ```ts
   import { parseSelectedRepos } from '../../../shared/repos/parse-selected-repos'
   ```

   After the upsert succeeds and before the `editReply` (after line 231), add:
   ```ts
   // Emit event if there are new repos
   const previousSet = new Set(previousRepos)
   const newRepos = [...selectedReposRaw].filter((r) => !previousSet.has(r))
   if (newRepos.length > 0) {
     this.eventBus.emitSettingsReposChanged({
       userId: session.userId,
       selectedRepos: newRepos,
     })
   }
   ```

- [ ] **Step 3: Run typecheck**

Run: `bun run typecheck --filter=api`
Expected: PASS

- [ ] **Step 4: Run existing Discord settings tests (if any)**

Run: `bun run test -- --run apps/api/src/interfaces/discord/handlers/settings-interaction.service.spec.ts`
If the file exists, update mocks for the new constructor parameter. If no test file exists, proceed.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/interfaces/discord/handlers/settings-interaction.service.ts
git commit -m "feat: discord settings use project/name format and emit repo change event"
```

---

## Chunk 6: Frontend and Data Migration

### Task 11: Update frontend settings page for `project/name` format

**Files:**
- Modify: `apps/web/src/app/features/settings/settings-page.ts`

- [ ] **Step 1: Update template binding**

In `apps/web/src/app/features/settings/settings-page.ts`, around line 402-403, change:

```html
[zChecked]="isRepoSelected(repo.name)"
(zCheckedChange)="onRepoCheckedChange(repo.name, $event)"
```

To:
```html
[zChecked]="isRepoSelected(repo.project + '/' + repo.name)"
(zCheckedChange)="onRepoCheckedChange(repo.project + '/' + repo.name, $event)"
```

- [ ] **Step 2: No changes needed to `isRepoSelected`, `toggleRepo`, or `onRepoCheckedChange`**

These methods accept a string parameter and compare/filter against the `selectedRepos` array. Since we now pass `project/name` from the template, the methods work unchanged — they compare `project/name` strings against `project/name` strings.

- [ ] **Step 3: Run frontend typecheck**

Run: `bun run typecheck --filter=web`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/features/settings/settings-page.ts
git commit -m "feat: frontend settings page uses project/name repo format"
```

---

### Task 12: Create data migration script

**Files:**
- Create: `scripts/migrate-selected-repos.ts`

- [ ] **Step 1: Create the migration script**

```ts
// scripts/migrate-selected-repos.ts
/**
 * One-time data migration: converts selectedRepos from ["repo-name"]
 * to ["project/repo-name"] format.
 *
 * Usage: bun run scripts/migrate-selected-repos.ts
 *
 * Requires: AZURE_DEVOPS_DEFAULT_PROJECT env var (defaults to 'AGROTRACE')
 * Requires: DATABASE_URL env var pointing to the database
 */
import { createClient } from '@libsql/client'

const DATABASE_URL = process.env.DATABASE_URL
if (!DATABASE_URL) {
  console.error('DATABASE_URL is required')
  process.exit(1)
}

const DEFAULT_PROJECT =
  process.env.AZURE_DEVOPS_DEFAULT_PROJECT ?? 'AGROTRACE'

const client = createClient({
  url: DATABASE_URL,
  authToken: process.env.DATABASE_AUTH_TOKEN,
})

async function main() {
  console.log(`Migrating selectedRepos with default project: ${DEFAULT_PROJECT}`)

  const rows = await client.execute(
    "SELECT id, selected_repos FROM user_settings WHERE selected_repos != '[]'",
  )

  let updated = 0
  let skipped = 0

  for (const row of rows.rows) {
    const id = row.id as string
    const raw = row.selected_repos as string

    try {
      const repos = JSON.parse(raw) as unknown[]
      if (!Array.isArray(repos)) {
        console.warn(`Skipping ${id}: not an array`)
        skipped++
        continue
      }

      const migrated = repos.map((name) => {
        if (typeof name !== 'string') return name
        if (name.includes('/')) return name // already migrated
        return `${DEFAULT_PROJECT}/${name}`
      })

      const newValue = JSON.stringify(migrated)
      if (newValue === raw) {
        skipped++
        continue
      }

      await client.execute({
        sql: 'UPDATE user_settings SET selected_repos = ? WHERE id = ?',
        args: [newValue, id],
      })
      updated++
      console.log(`Updated ${id}: ${raw} -> ${newValue}`)
    } catch (error) {
      console.error(`Failed to migrate ${id}: ${error}`)
      skipped++
    }
  }

  console.log(`Done. Updated: ${updated}, Skipped: ${skipped}`)
  process.exit(0)
}

main().catch((error) => {
  console.error('Migration failed:', error)
  process.exit(1)
})
```

- [ ] **Step 2: Verify the script compiles**

Run: `bun run --bun scripts/migrate-selected-repos.ts --dry-run 2>&1 || true`
Expected: Either runs (if DATABASE_URL set) or exits with "DATABASE_URL is required"

- [ ] **Step 3: Commit**

```bash
git add scripts/migrate-selected-repos.ts
git commit -m "feat: add one-time migration script for selectedRepos format"
```

---

### Task 13: Final verification

- [ ] **Step 1: Run full CI**

Run: `bun run ci`
Expected: lint + typecheck + test ALL PASS

- [ ] **Step 2: If any failures, fix and re-run**

Address any type errors, lint issues, or test failures. Common issues:
- Existing tests that construct `GitCollectorService` with 2 args need updating for the 3rd `repoCloneService` arg
- Existing tests for `MeSettingsService` with 3 constructor args need updating for the 4th `eventBus` arg
- Import paths may need `.js` extension depending on module resolution settings

- [ ] **Step 3: Final commit if fixes were needed**

```bash
git add -A
git commit -m "fix: address CI issues from auto-clone integration"
```
