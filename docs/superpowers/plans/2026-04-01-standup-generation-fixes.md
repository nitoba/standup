# Standup Generation Fixes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix three standup generation defects: incorrect Done/In Progress status, duplicated board items across projects, and LLM hallucination of non-existent work items.

**Architecture:** Four independent changes: (1) expand `determineWorkItemStatus` to recognize more Azure DevOps done states, (2) deduplicate board items by ID in the collector, (3) compute a smart `sinceDate` in `ExecuteGenerateStrategy` based on last approved standup, (4) add anti-hallucination and status rules to all prompt templates.

**Tech Stack:** TypeScript, NestJS, Vitest, Drizzle ORM, AI SDK prompt templates (Markdown)

---

### Task 1: Expand `determineWorkItemStatus` to recognize more done states

**Files:**
- Modify: `apps/api/src/contexts/standups/worker/standup-generator/standup-prompt.service.ts:285-306`
- Modify: `apps/api/src/contexts/standups/worker/standup-generator/standup-prompt.service.spec.ts`

- [ ] **Step 1: Add test cases for new done states**

In `standup-prompt.service.spec.ts`, add a new `describe` block after the existing tests (after line 311):

```typescript
describe('determineWorkItemStatus (via buildUserMessage)', () => {
  function buildInputWithEnrichedItem(
    state: string,
    pullRequests: { id: number; title: string; status: 'active' | 'completed' | 'abandoned'; repoId: string; creatorId: string }[] = [],
  ) {
    const enrichedActivity: EnrichedGitActivity = {
      timestamp: '2026-03-16T17:00:00.000Z',
      userUuid: 'user-uuid',
      repos: [
        {
          repoName: 'my-repo',
          repoPath: '/path/to/repo',
          commits: [
            {
              hash: 'abc12345',
              subject: 'fix: something',
              body: '',
              sourceBranch: 'feat/1234-feature',
              filesChanged: 1,
              insertions: 1,
              deletions: 0,
              files: ['src/file.ts'],
            },
          ],
          cardNumbers: ['1234'],
          enrichedItems: [
            {
              cardNumber: '1234',
              workItem: {
                id: '1234',
                title: 'Some task',
                state,
                assignedTo: 'dev@company.com',
              },
              pullRequests,
            },
          ],
        },
      ],
    }

    const input: GenerateStandupInput = {
      date: '2026-03-16',
      meetingType: '',
      gitActivity: { timestamp: '2026-03-16T17:00:00.000Z', repos: [] },
    }

    return { input, enrichedActivity }
  }

  it.each([
    ['Done', 'Done ✅'],
    ['Closed', 'Done ✅'],
    ['Resolved', 'Done ✅'],
    ['Test QA', 'Done ✅'],
  ])('maps Azure DevOps state "%s" to "%s"', (state, expectedLabel) => {
    const service = createService()
    const { input, enrichedActivity } = buildInputWithEnrichedItem(state)
    const message = service.buildUserMessage(input, enrichedActivity)
    expect(message).toContain(`Status calculado: ${expectedLabel}`)
  })

  it.each([
    ['New'],
    ['Committed'],
    ['Active'],
    ['In Progress'],
  ])('maps Azure DevOps state "%s" to "In Progress 🚧"', (state) => {
    const service = createService()
    const { input, enrichedActivity } = buildInputWithEnrichedItem(state)
    const message = service.buildUserMessage(input, enrichedActivity)
    expect(message).toContain('Status calculado: In Progress 🚧')
  })

  it('maps "In Progress" with all completed/active PRs to Done', () => {
    const service = createService()
    const { input, enrichedActivity } = buildInputWithEnrichedItem('In Progress', [
      { id: 1, title: 'PR 1', status: 'completed', repoId: 'r1', creatorId: 'u1' },
    ])
    const message = service.buildUserMessage(input, enrichedActivity)
    expect(message).toContain('Status calculado: Done ✅')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/api && bun run test -- --run standup-prompt.service.spec.ts`
Expected: Tests for `"Closed"`, `"Resolved"`, and `"Test QA"` FAIL because they return `In Progress 🚧` instead of `Done ✅`.

- [ ] **Step 3: Update `determineWorkItemStatus` implementation**

In `standup-prompt.service.ts`, replace the `determineWorkItemStatus` method (lines 285-306):

```typescript
private static readonly DONE_STATES = new Set([
  'Done',
  'Closed',
  'Resolved',
  'Test QA',
])

private determineWorkItemStatus(
  item: EnrichedWorkItem,
): 'done' | 'in_progress' {
  const state = item.workItem?.state ?? ''

  if (StandupPromptService.DONE_STATES.has(state)) {
    return 'done'
  }

  if (state === 'In Progress' && item.pullRequests.length > 0) {
    const allDoneOrActive = item.pullRequests.every(
      (pullRequest) =>
        pullRequest.status === 'completed' || pullRequest.status === 'active',
    )

    if (allDoneOrActive) {
      return 'done'
    }
  }

  return 'in_progress'
}
```

Move the `DONE_STATES` declaration above the method as a `private static readonly` field on the class.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/api && bun run test -- --run standup-prompt.service.spec.ts`
Expected: ALL tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/contexts/standups/worker/standup-generator/standup-prompt.service.ts apps/api/src/contexts/standups/worker/standup-generator/standup-prompt.service.spec.ts
git commit -m "fix: expand determineWorkItemStatus to recognize Test QA, Closed, Resolved as done"
```

---

### Task 2: Deduplicate board work items across projects

**Files:**
- Modify: `apps/api/src/contexts/standups/worker/azure-devops/azure-devops-activity-collector.service.ts`
- Modify: `apps/api/src/contexts/standups/worker/azure-devops/azure-devops-activity-collector.service.spec.ts`

- [ ] **Step 1: Add test for deduplication**

In `azure-devops-activity-collector.service.spec.ts`, add the following test after the last existing `it(...)` block (after line 325):

```typescript
it('deduplicates work items with same id across projects using AreaPath as project', async () => {
  const queryWorkItems = vi.fn().mockResolvedValue(Result.ok([101]))
  const getWorkItemsBatch = vi.fn().mockResolvedValue(
    Result.ok([
      {
        id: 101,
        fields: {
          'System.Title': 'Shared task',
          'System.WorkItemType': 'Enhancement',
          'System.State': 'Done',
          'System.AssignedTo': 'John Doe',
          'System.AreaPath': 'AGROTRACE\\Devops',
        },
      } satisfies WorkItemResponse,
    ]),
  )
  const getWorkItemUpdates = vi.fn().mockResolvedValue(
    Result.ok([
      stateChangeUpdate(1, '2024-06-15T14:00:00Z', 'John Doe', 'New', 'Done'),
    ]),
  )

  const { service } = createService(
    { queryWorkItems, getWorkItemsBatch, getWorkItemUpdates },
    ['AGROTRACE', 'CHECKMILK', 'JASPER-RELATORIOS'],
  )

  const result = await service.collect('John Doe', '8 hours ago')

  expect(result).not.toBeNull()
  if (result === null) throw new Error('Expected non-null result')
  // Same work item 101 exists in 3 projects but should appear only once
  expect(result.workItems).toHaveLength(1)
  const item = result.workItems[0] ?? (() => { throw new Error('Expected item') })()
  expect(item.id).toBe(101)
  expect(item.project).toBe('AGROTRACE')
})

it('falls back to first project when AreaPath is not available', async () => {
  const queryWorkItems = vi.fn().mockResolvedValue(Result.ok([202]))
  const getWorkItemsBatch = vi.fn().mockResolvedValue(
    Result.ok([
      workItemResponse(202, 'Task without AreaPath', 'Task', 'Active', 'John Doe'),
    ]),
  )
  const getWorkItemUpdates = vi.fn().mockResolvedValue(
    Result.ok([
      stateChangeUpdate(1, '2024-06-15T14:00:00Z', 'John Doe', 'New', 'Active'),
    ]),
  )

  const { service } = createService(
    { queryWorkItems, getWorkItemsBatch, getWorkItemUpdates },
    ['ProjectA', 'ProjectB'],
  )

  const result = await service.collect('John Doe', '8 hours ago')

  expect(result).not.toBeNull()
  if (result === null) throw new Error('Expected non-null result')
  expect(result.workItems).toHaveLength(1)
  const item = result.workItems[0] ?? (() => { throw new Error('Expected item') })()
  expect(item.id).toBe(202)
  expect(item.project).toBe('ProjectA')
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/api && bun run test -- --run azure-devops-activity-collector.service.spec.ts`
Expected: The deduplication test FAILS because 3 duplicate items are returned instead of 1.

- [ ] **Step 3: Add `System.AreaPath` to WORK_ITEM_FIELDS and extract project from it**

In `azure-devops-activity-collector.service.ts`, update `WORK_ITEM_FIELDS` (line 14):

```typescript
const WORK_ITEM_FIELDS = [
  'System.Id',
  'System.Title',
  'System.WorkItemType',
  'System.State',
  'System.AssignedTo',
  'System.AreaPath',
]
```

Update `buildWorkItemActivity` (line 212) to extract project from AreaPath:

```typescript
private buildWorkItemActivity(
  item: WorkItemResponse,
  project: string,
  actions: BoardAction[],
): BoardWorkItemActivity {
  const areaPath = item.fields['System.AreaPath']
  const projectFromArea =
    typeof areaPath === 'string' ? areaPath.split('\\')[0] : undefined

  return {
    id: item.id,
    title: String(item.fields['System.Title'] ?? ''),
    type: String(item.fields['System.WorkItemType'] ?? ''),
    state: String(item.fields['System.State'] ?? ''),
    assignedTo: String(item.fields['System.AssignedTo'] ?? ''),
    project: projectFromArea ?? project,
    actions,
  }
}
```

- [ ] **Step 4: Add deduplication logic in `collect()`**

In `azure-devops-activity-collector.service.ts`, update the `collect()` method to deduplicate after aggregation. Replace lines 60-68:

```typescript
if (allWorkItems.length === 0) {
  return null
}

const deduplicated = this.deduplicateWorkItems(allWorkItems)

return {
  timestamp: new Date().toISOString(),
  workItems: deduplicated,
}
```

Add the deduplication method after `collect()`:

```typescript
private deduplicateWorkItems(
  items: BoardWorkItemActivity[],
): BoardWorkItemActivity[] {
  const seen = new Map<number, BoardWorkItemActivity>()

  for (const item of items) {
    const existing = seen.get(item.id)
    if (!existing) {
      seen.set(item.id, item)
      continue
    }

    // Merge actions that don't already exist
    const existingKeys = new Set(
      existing.actions.map((a) => `${a.timestamp}|${a.details}`),
    )
    for (const action of item.actions) {
      const key = `${action.timestamp}|${action.details}`
      if (!existingKeys.has(key)) {
        existing.actions.push(action)
        existingKeys.add(key)
      }
    }
  }

  return [...seen.values()]
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd apps/api && bun run test -- --run azure-devops-activity-collector.service.spec.ts`
Expected: ALL tests PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/contexts/standups/worker/azure-devops/azure-devops-activity-collector.service.ts apps/api/src/contexts/standups/worker/azure-devops/azure-devops-activity-collector.service.spec.ts
git commit -m "fix: deduplicate board work items across projects using AreaPath"
```

---

### Task 3: Smart `sinceDate` based on last approved standup

**Files:**
- Modify: `apps/api/src/contexts/standups/worker/standup/strategies/execute-generate-strategy.ts`
- Modify: `apps/api/src/contexts/standups/worker/azure-devops/azure-devops-activity-collector.service.ts`
- Modify: `apps/api/src/platform/database/repositories/standup-read.repository.ts`

- [ ] **Step 1: Add `findLastApprovedByUser` to StandupReadRepository**

In `apps/api/src/platform/database/repositories/standup-read.repository.ts`, add the following method before the closing `}` of the class (before line 242):

```typescript
async findLastApprovedByUser(
  userId: string,
): Promise<Result<StandupRecord | null, DbError>> {
  try {
    const row = await this.database.db
      .select()
      .from(standups)
      .where(
        and(
          eq(standups.userId, userId),
          or(
            eq(standups.status, 'approved'),
            eq(standups.status, 'published'),
          ),
        ),
      )
      .orderBy(desc(standups.createdAt))
      .limit(1)
      .get()
    return Result.ok(row ? toRecord(row) : null)
  } catch (error) {
    return dbErr(this.logger, 'findLastApprovedByUser', error)
  }
}
```

- [ ] **Step 2: Update `resolveSinceDate` to accept ISO dates**

In `azure-devops-activity-collector.service.ts`, update the `resolveSinceDate` method (lines 228-235):

```typescript
private resolveSinceDate(sincePeriod: string): string {
  // If it's already an ISO date, return as-is
  if (/^\d{4}-\d{2}-\d{2}/.test(sincePeriod)) {
    return sincePeriod
  }

  const match = sincePeriod.match(/^(\d+)\s*hours?\s*ago$/i)
  const hours = match ? Number(match[1]) : 8

  const date = new Date()
  date.setHours(date.getHours() - hours)
  return date.toISOString()
}
```

- [ ] **Step 3: Update `ExecuteGenerateStrategy` to compute smart sinceDate**

In `execute-generate-strategy.ts`, inject `StandupReadRepository` and `LocalDateService`, then compute the sinceDate.

Update imports (at top of file):

```typescript
import { Injectable } from '@nestjs/common'
import { Span } from 'nestjs-otel'
import { StandupReadRepository } from '../../../../../platform/database/repositories/standup-read.repository'
import { AppLoggerFactory } from '../../../../../platform/logger'
import { AppTracingService } from '../../../../../platform/observability/app-tracing.service'
import { LocalDateService } from '../../../../../platform/time/local-date.service'
import type {
  GatheredBoardActivity,
  GatheredGitActivity,
} from '../../../../../shared/domain'
import { Result } from '../../../../../shared/domain'
import { AzureDevopsActivityCollectorService } from '../../azure-devops/azure-devops-activity-collector.service'
import { GitCollectorService } from '../../git-collector/git-collector.service'
import { StandupGeneratorService } from '../../standup-generator/standup-generator.service'
import type {
  GeneratedContent,
  StrategyExecutionInput,
  StrategyResult,
} from '../types'
import { StandupStrategyBase } from './standup-strategy.base'
```

Update constructor:

```typescript
constructor(
  private readonly loggerFactory: AppLoggerFactory,
  private readonly gitCollector: GitCollectorService,
  private readonly boardCollector: AzureDevopsActivityCollectorService,
  private readonly standupGenerator: StandupGeneratorService,
  private readonly tracing: AppTracingService,
  private readonly standupReadRepo: StandupReadRepository,
  private readonly localDateService: LocalDateService,
) {
  super()
  this.logger = this.loggerFactory.create('generate-strategy')
}
```

Add a private method to compute sinceDate:

```typescript
private async computeSinceDate(
  userId: string,
  timezone: string,
): Promise<string> {
  // Calculate midnight in user's timezone
  const todayIso = this.localDateService.today(timezone).iso
  const midnightUtc = new Date(`${todayIso}T00:00:00`).toISOString()

  // Find last approved/published standup
  const lastApprovedResult =
    await this.standupReadRepo.findLastApprovedByUser(userId)

  if (lastApprovedResult.isErr() || !lastApprovedResult.value) {
    this.logger.debug('No previous approved standup found, using midnight', {
      userId,
      midnight: midnightUtc,
    })
    return midnightUtc
  }

  const lastCreatedAt = new Date(
    lastApprovedResult.value.createdAt,
  ).toISOString()

  // Use the more recent of midnight and last approved standup
  const sinceDate =
    lastCreatedAt > midnightUtc ? lastCreatedAt : midnightUtc

  this.logger.debug('Computed smart sinceDate', {
    userId,
    midnight: midnightUtc,
    lastApproved: lastCreatedAt,
    sinceDate,
  })

  return sinceDate
}
```

Update the `execute` method to use the computed sinceDate. Replace line 63 (`options.gitSincePeriod ?? '8 hours ago'`) and line 100 (same pattern):

At the start of the `execute` method, after `const { options, today, reportProgress } = input`, add:

```typescript
const sinceDate = await this.computeSinceDate(
  options.userId,
  options.timezone,
)
```

Then replace `options.gitSincePeriod ?? '8 hours ago'` in both the git collector call (line 63) and the board collector call (line 100) with `sinceDate`.

- [ ] **Step 4: Run full test suite to verify nothing breaks**

Run: `cd apps/api && bun run test`
Expected: ALL tests PASS. The strategy tests may need updating if they mock the constructor — check and fix if necessary.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/platform/database/repositories/standup-read.repository.ts apps/api/src/contexts/standups/worker/azure-devops/azure-devops-activity-collector.service.ts apps/api/src/contexts/standups/worker/standup/strategies/execute-generate-strategy.ts
git commit -m "feat: compute smart sinceDate from last approved standup and midnight"
```

---

### Task 4: Add anti-hallucination and status rules to prompt templates

**Files:**
- Modify: `apps/api/src/contexts/standups/worker/standup-generator/prompts/git-only-system.md`
- Modify: `apps/api/src/contexts/standups/worker/standup-generator/prompts/hybrid-system.md`
- Modify: `apps/api/src/contexts/standups/worker/standup-generator/prompts/board-only-system.md`
- Modify: `apps/api/src/contexts/standups/worker/standup-generator/standup-prompt.service.spec.ts`

- [ ] **Step 1: Add anti-hallucination and status rules to `git-only-system.md`**

In `apps/api/src/contexts/standups/worker/standup-generator/prompts/git-only-system.md`, add the following two rules inside the `**Regras importantes:**` section, right after the existing line about test cards (line 58 `- Cards de teste...`):

```markdown
- REGRA CRITICA: NUNCA invente, fabrique ou inclua work items, cards ou numeros de card que nao estejam EXPLICITAMENTE presentes nos dados fornecidos abaixo. Se um item nao aparece nos commits git, ele NAO existe para este standup. Incluir items inexistentes e uma falha grave.
- Para classificar items como Done ou In Progress, use EXCLUSIVAMENTE o campo "Status calculado" quando disponivel. Sem status calculado, considere como Done os estados: "Done", "Closed", "Resolved", "Test QA". Todos os demais estados sao In Progress.
```

- [ ] **Step 2: Add the same rules to `hybrid-system.md`**

In `apps/api/src/contexts/standups/worker/standup-generator/prompts/hybrid-system.md`, add the same two rules inside the `**Regras importantes:**` section, right after the test cards rule (line 62 `- Cards de teste...`):

```markdown
- REGRA CRITICA: NUNCA invente, fabrique ou inclua work items, cards ou numeros de card que nao estejam EXPLICITAMENTE presentes nos dados fornecidos abaixo. Se um item nao aparece nos commits git ou na atividade do board, ele NAO existe para este standup. Incluir items inexistentes e uma falha grave.
- Para classificar items como Done ou In Progress, use EXCLUSIVAMENTE o campo "Status calculado" quando disponivel. Para items do board sem status calculado, considere como Done os estados: "Done", "Closed", "Resolved", "Test QA". Todos os demais estados sao In Progress.
```

- [ ] **Step 3: Add anti-hallucination rule and expand status in `board-only-system.md`**

In `apps/api/src/contexts/standups/worker/standup-generator/prompts/board-only-system.md`:

First, update the `**Classificacao de status:**` section (lines 28-30) to include `Test QA`:

```markdown
**Classificação de status:**
- **Done**: Work items com estado "Done" ou "Closed" ou "Resolved" ou "Test QA"
- **In Progress**: Todos os outros estados (New, Active, Committed, In Progress, etc.)
```

Then add the anti-hallucination rule inside `**Regras importantes:**` (after line 38 `- Cards de teste...`):

```markdown
- REGRA CRITICA: NUNCA invente, fabrique ou inclua work items ou ids que nao estejam EXPLICITAMENTE presentes nos dados fornecidos abaixo. Se um item nao aparece na atividade do board, ele NAO existe para este standup. Incluir items inexistentes e uma falha grave.
```

- [ ] **Step 4: Add test verifying anti-hallucination rule in all prompts**

In `standup-prompt.service.spec.ts`, add the following test inside the `buildSystemPrompt` describe block (after the existing `all system prompts contain status grouping rule` test):

```typescript
it('all system prompts contain anti-hallucination rule', () => {
  const service = createService()
  const gitOnly = service.buildSystemPrompt({ hasGit: true, hasBoard: false })
  const boardOnly = service.buildSystemPrompt({ hasGit: false, hasBoard: true })
  const hybrid = service.buildSystemPrompt({ hasGit: true, hasBoard: true })

  for (const prompt of [gitOnly, boardOnly, hybrid]) {
    expect(prompt).toContain('NUNCA invente')
    expect(prompt).toContain('falha grave')
  }
})

it('all system prompts list Test QA as a done state', () => {
  const service = createService()
  const gitOnly = service.buildSystemPrompt({ hasGit: true, hasBoard: false })
  const boardOnly = service.buildSystemPrompt({ hasGit: false, hasBoard: true })
  const hybrid = service.buildSystemPrompt({ hasGit: true, hasBoard: true })

  for (const prompt of [gitOnly, boardOnly, hybrid]) {
    expect(prompt).toContain('Test QA')
  }
})
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd apps/api && bun run test -- --run standup-prompt.service.spec.ts`
Expected: ALL tests PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/contexts/standups/worker/standup-generator/prompts/git-only-system.md apps/api/src/contexts/standups/worker/standup-generator/prompts/hybrid-system.md apps/api/src/contexts/standups/worker/standup-generator/prompts/board-only-system.md apps/api/src/contexts/standups/worker/standup-generator/standup-prompt.service.spec.ts
git commit -m "fix: add anti-hallucination rules and Test QA status to all prompt templates"
```

---

### Task 5: Copy updated prompts to dist and run full CI

**Files:**
- No new files — verification only

- [ ] **Step 1: Run full CI check**

Run: `cd /var/home/nitoba/Documents/repos/standup && bun run ci`
Expected: ALL tasks pass (lint + typecheck + test across all packages/apps).

- [ ] **Step 2: Fix any issues found**

If any lint/typecheck/test failures, fix them before proceeding.

- [ ] **Step 3: Final commit (if any fixes were needed)**

```bash
git add -A
git commit -m "fix: address CI issues from standup generation fixes"
```
