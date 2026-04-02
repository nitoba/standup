# TAS-109: PI Agent Phase 4 — Complete Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the legacy `StandupGeneratorService`, the `USE_PI_AGENT` feature flag, and `ExecuteRegenerateStrategy` — making PI Agent the single path for all standup generation.

**Architecture:** Collapse branching in strategies to always use `StandupAgentService`. Add `generateWeeklyInsights()` to `StandupAgentService` (text-only, no tool). Remove `StandupGeneratorService`, `ExecuteRegenerateStrategy`, `reuseExistingSource`, and `USE_PI_AGENT` env var. Update frontend to stop sending `reuseExistingSource`.

**Tech Stack:** NestJS DI, Vitest, PI Agent Core

**Spec:** `docs/superpowers/specs/2026-04-02-tas-109-pi-agent-phase4-design.md`

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Modify | `apps/api/src/contexts/standups/worker/standup-agent/standup-agent.service.ts` | Add `generateWeeklyInsights()` |
| Modify | `apps/api/src/contexts/standups/worker/standup-agent/standup-agent.service.spec.ts` | Tests for weekly insights |
| Modify | `apps/api/src/contexts/standups/worker/standup/strategies/execute-generate-strategy.ts` | Remove branching, always use agent |
| Modify | `apps/api/src/contexts/standups/worker/standup/strategies/execute-generate-strategy.spec.ts` | Simplify tests |
| Modify | `apps/api/src/contexts/standups/worker/standup/strategies/execute-adjust-strategy.ts` | Remove branching, always use agent |
| Modify | `apps/api/src/contexts/standups/worker/standup/strategies/execute-adjust-strategy.spec.ts` | Simplify tests |
| Modify | `apps/api/src/contexts/standups/worker/standup/resolve-run-mode.ts` | Remove `reuseExistingSource` check |
| Modify | `apps/api/src/contexts/standups/worker/standup/types.ts` | Remove `reuseExistingSource` from `StandupJobOptions` |
| Modify | `apps/api/src/contexts/standups/worker/standup/standup-pipeline.service.ts` | Remove `ExecuteRegenerateStrategy`, remove `'regenerate'` case |
| Modify | `apps/api/src/contexts/standups/worker/worker.module.ts` | Remove `ExecuteRegenerateStrategy` provider |
| Modify | `apps/api/src/contexts/standups/worker/standup-generator/standup-generator.module.ts` | Remove `StandupGeneratorService` from providers/exports |
| Modify | `apps/api/src/contexts/standups/worker/digests/run-weekly-digest-job.service.ts` | Use `StandupAgentService` |
| Modify | `apps/api/src/platform/events/standup-events.ts` | Remove `'regenerate'` from `StandupRunMode` |
| Modify | `apps/api/src/contexts/standups/events/standup-sse.types.ts` | Remove `'regenerate'` from SSE mode |
| Modify | `apps/api/src/platform/env/env.schema.ts` | Remove `USE_PI_AGENT` |
| Modify | `apps/api/src/platform/env/env.service.ts` | Remove `usePiAgent` |
| Modify | `apps/api/src/contexts/standups/worker/worker-runtime-config.service.ts` | Remove `USE_PI_AGENT` |
| Modify | `apps/api/src/contexts/standups/trigger/trigger-standup.dto.ts` | Remove `reuseExistingSource` |
| Modify | `apps/api/src/contexts/standups/trigger/trigger-standup.service.ts` | Remove `reuseExistingSource` passthrough |
| Modify | `apps/api/src/interfaces/discord/services/discord-trigger.service.ts` | Remove `reuseExistingSource` |
| Delete | `apps/api/src/contexts/standups/worker/standup-generator/standup-generator.service.ts` | Legacy service |
| Delete | `apps/api/src/contexts/standups/worker/standup-generator/standup-generator.service.spec.ts` | Legacy tests |
| Delete | `apps/api/src/contexts/standups/worker/standup/strategies/execute-regenerate-strategy.ts` | Unused strategy |
| Modify | `apps/web/src/app/features/dashboard/services/standup-service.ts` | Remove `reuseExistingSource` from regenerate |
| Modify | `apps/web/src/app/shared/models/standup-models.ts` | Remove `'regenerate'` from `StandupGenerationMode` |
| Modify | `apps/web/src/app/api/model/triggerStandupDto.ts` | Remove `reuseExistingSource` |

---

### Task 1: Add `generateWeeklyInsights()` to `StandupAgentService`

**Files:**
- Modify: `apps/api/src/contexts/standups/worker/standup-agent/standup-agent.service.ts`
- Modify: `apps/api/src/contexts/standups/worker/standup-agent/standup-agent.service.spec.ts`

- [ ] **Step 1: Read the current file**

Read `apps/api/src/contexts/standups/worker/standup-agent/standup-agent.service.ts` and `apps/api/src/contexts/standups/worker/standup-generator/standup-prompt.service.ts` to understand `buildWeeklyInsightsSystemPrompt()` and `buildWeeklyInsightsUserMessage()` signatures.

- [ ] **Step 2: Write the failing tests**

Add to `standup-agent.service.spec.ts`, new describe block:

```typescript
  describe('generateWeeklyInsights()', () => {
    it('returns insights text on success', async () => {
      // Mock Agent to populate messages with an assistant text response
      mockPrompt.mockImplementation(async () => {
        mockState.messages = [
          { role: 'user', content: 'Generate insights' },
          {
            role: 'assistant',
            content: [{ type: 'text', text: 'Weekly insights content here' }],
          },
        ]
      })

      const standups = [
        { id: '1', content: 'standup 1', summary: 's1' },
      ] as never[]

      const result = await service.generateWeeklyInsights(standups)

      expect(result.isOk()).toBe(true)
      if (result.isOk()) {
        expect(result.value).toBe('Weekly insights content here')
      }
    })

    it('returns error for empty standups array', async () => {
      const result = await service.generateWeeklyInsights([])

      expect(result.isErr()).toBe(true)
    })

    it('falls back to next model on failure', async () => {
      let callCount = 0
      mockPrompt.mockImplementation(async () => {
        callCount++
        if (callCount <= 1) throw new Error('LLM failed')
        mockState.messages = [
          {
            role: 'assistant',
            content: [{ type: 'text', text: 'Fallback insights' }],
          },
        ]
      })

      const standups = [{ id: '1', content: 'c', summary: 's' }] as never[]
      const result = await service.generateWeeklyInsights(standups)

      expect(result.isOk()).toBe(true)
      expect(registry.getNextModel).toHaveBeenCalledTimes(2)
    })
  })
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
cd apps/api && bunx vitest run src/contexts/standups/worker/standup-agent/standup-agent.service.spec.ts
```

Expected: FAIL — `generateWeeklyInsights` not defined.

- [ ] **Step 4: Write the implementation**

Add to `StandupAgentService`:

```typescript
  async generateWeeklyInsights(
    standups: StandupRecord[],
  ): Promise<
    Result<string, ExternalServiceError | AllProvidersUnavailableError>
  > {
    if (standups.length === 0) {
      return Result.err(
        new ExternalServiceError({
          service: 'pi-agent',
          message: 'No standups provided for weekly insights generation',
        }),
      )
    }

    const systemPrompt = this.standupPrompt.buildWeeklyInsightsSystemPrompt()
    const userMessage = this.standupPrompt.buildWeeklyInsightsUserMessage(standups)

    const totalModels = this.llmRegistry.totalModels
    let lastError: unknown

    for (let i = 0; i < totalModels; i++) {
      let selection: ReturnType<LlmProviderRegistry['getNextModel']>
      try {
        selection = this.llmRegistry.getNextModel()
      } catch (error) {
        if (error instanceof AllProvidersUnavailableError) {
          return Result.err(error)
        }
        throw error
      }

      const { modelKey, provider, tier } = selection

      try {
        this.logger.info('Generating weekly insights via PI Agent', {
          model: modelKey,
          provider,
          tier,
          standupCount: standups.length,
        })

        const piModel = toPiAiModel({ provider, modelKey })
        const agent = new Agent({
          initialState: {
            systemPrompt,
            model: piModel,
            tools: [],
            messages: [],
          },
          getApiKey: (p) => this.resolveApiKey(p),
        })

        let timeoutHandle: ReturnType<typeof setTimeout> | undefined
        await Promise.race([
          agent.prompt(userMessage),
          new Promise<never>((_, reject) => {
            timeoutHandle = setTimeout(
              () => reject(new Error('Weekly insights timed out')),
              AGENT_TIMEOUT_MS,
            )
          }),
        ]).finally(() => clearTimeout(timeoutHandle))

        // Extract text from last assistant message
        const messages = agent.state.messages
        for (let j = messages.length - 1; j >= 0; j--) {
          const msg = messages[j]
          if (msg.role === 'assistant' && Array.isArray(msg.content)) {
            const textBlock = msg.content.find(
              (b: { type: string }) => b.type === 'text',
            )
            if (textBlock && 'text' in textBlock) {
              this.llmRegistry.reportSuccess(modelKey)
              return Result.ok(textBlock.text as string)
            }
          }
        }

        lastError = new Error('Agent returned no text content')
        continue
      } catch (error) {
        lastError = error
        this.logger.warn('Weekly insights generation failed', {
          model: modelKey,
          provider,
          tier,
          error: error instanceof Error ? error.message : String(error),
        })

        if (this.isRateLimitError(error)) {
          this.llmRegistry.reportFailure(modelKey, error)
        }
      }
    }

    return Result.err(
      new AllProvidersUnavailableError({
        message: `Weekly insights: all ${totalModels} models failed. Last error: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
        modelsAttempted: totalModels,
      }),
    )
  }
```

Add import for `StandupRecord`:

```typescript
import type { GeneratedStandup, GenerateStandupInput, StandupRecord } from '../../../../shared/domain'
```

- [ ] **Step 5: Run tests**

```bash
cd apps/api && bunx vitest run src/contexts/standups/worker/standup-agent/standup-agent.service.spec.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -u
git commit -m "feat: add generateWeeklyInsights to StandupAgentService using PI Agent"
```

---

### Task 2: Simplify `ExecuteGenerateStrategy` — remove branching

**Files:**
- Modify: `apps/api/src/contexts/standups/worker/standup/strategies/execute-generate-strategy.ts`
- Modify: `apps/api/src/contexts/standups/worker/standup/strategies/execute-generate-strategy.spec.ts`

- [ ] **Step 1: Read current files**

Read both the strategy and its spec to understand the current branching.

- [ ] **Step 2: Modify the strategy**

In `execute-generate-strategy.ts`:

1. **Remove imports** of `StandupGeneratorService` and `WorkerRuntimeConfigService`
2. **Add import** of `StandupPromptService`:
   ```typescript
   import { StandupPromptService } from '../../standup-generator/standup-prompt.service'
   ```
3. **Replace constructor params:** Remove `standupGenerator` and `runtimeConfig`. Add `standupPrompt: StandupPromptService` for `determineMeetingType`.
4. **Simplify the generation block:** Remove the `usePiAgent` ternary. Always call `this.standupAgent.generate()`. Always destroy session when `replaceStandupId` present.
5. **Replace `this.standupGenerator.determineMeetingType(today)`** with `this.standupPrompt.determineMeetingType(today)`

The generation block becomes:

```typescript
    // --- Generate standup ---
    const meetingType = this.standupPrompt.determineMeetingType(today)

    // Destroy old agent session on regenerate
    if (options.replaceStandupId) {
      this.sessionManager.destroy(options.replaceStandupId)
    }

    const generated = await this.tracing.withSpan(
      'standup.agent.generate',
      { 'standup.meeting_type': meetingType, 'standup.mode': 'agent' },
      () =>
        this.standupAgent.generate({
          date: today,
          meetingType,
          gitActivity: gitActivity ?? undefined,
          boardActivity: boardActivity ?? undefined,
          extraContext: options.extraContext?.trim() || undefined,
          azureDevopsUuid: options.azureDevopsUuid,
          onStageChange: async (stage) => {
            await this.reportStage(
              reportProgress,
              stage === 'enriching_data' ? 'enriching_data' : 'generating_standup',
              stage === 'enriching_data'
                ? 'Enriquecendo contexto para o standup'
                : 'Gerando texto do standup',
            )
          },
          onContentDelta: (partialContent) => {
            this.reportStage(reportProgress, 'streaming_content', 'Gerando conteudo...', partialContent)
          },
        }),
    )
```

- [ ] **Step 3: Update the spec**

Remove tests for legacy path (`USE_PI_AGENT=false`). Remove `makeStandupGenerator` factory if no longer needed. Remove `WorkerRuntimeConfigService` mock. Simplify `buildStrategy()` — no longer needs `usePiAgent` param.

- [ ] **Step 4: Run tests**

```bash
cd apps/api && bunx vitest run src/contexts/standups/worker/standup/strategies/execute-generate-strategy.spec.ts
```

- [ ] **Step 5: Commit**

```bash
git add -u
git commit -m "refactor: remove legacy branching from ExecuteGenerateStrategy, always use PI Agent"
```

---

### Task 3: Simplify `ExecuteAdjustStrategy` — remove branching

**Files:**
- Modify: `apps/api/src/contexts/standups/worker/standup/strategies/execute-adjust-strategy.ts`
- Modify: `apps/api/src/contexts/standups/worker/standup/strategies/execute-adjust-strategy.spec.ts`

- [ ] **Step 1: Modify the strategy**

1. **Remove imports** of `StandupGeneratorService` and `WorkerRuntimeConfigService`
2. **Remove constructor params** for both
3. **Remove branching** — always call `this.standupAgent.adjust()`:

```typescript
    const adjusted = await this.standupAgent.adjust({
      standupId: baseStandupId,
      instruction,
      previousContent: baseResult.value.content,
      extraContext: options.extraContext?.trim() || undefined,
      onStageChange: async () => {
        await this.reportStage(
          reportProgress,
          'generating_standup',
          'Ajustando standup',
        )
      },
      onContentDelta: (partialContent) => {
        this.reportStage(reportProgress, 'streaming_content', 'Ajustando conteudo...', partialContent)
      },
    })
```

- [ ] **Step 2: Update the spec**

Remove tests for legacy path. Remove `StandupGeneratorService` and `WorkerRuntimeConfigService` mocks. Simplify `buildStrategy()`.

- [ ] **Step 3: Run tests**

```bash
cd apps/api && bunx vitest run src/contexts/standups/worker/standup/strategies/execute-adjust-strategy.spec.ts
```

- [ ] **Step 4: Commit**

```bash
git add -u
git commit -m "refactor: remove legacy branching from ExecuteAdjustStrategy, always use PI Agent"
```

---

### Task 4: Remove `ExecuteRegenerateStrategy` and simplify pipeline

**Files:**
- Delete: `apps/api/src/contexts/standups/worker/standup/strategies/execute-regenerate-strategy.ts`
- Modify: `apps/api/src/contexts/standups/worker/standup/standup-pipeline.service.ts`
- Modify: `apps/api/src/contexts/standups/worker/worker.module.ts`
- Modify: `apps/api/src/contexts/standups/worker/standup/resolve-run-mode.ts`
- Modify: `apps/api/src/contexts/standups/worker/standup/types.ts`

- [ ] **Step 1: Delete the strategy file**

```bash
rm apps/api/src/contexts/standups/worker/standup/strategies/execute-regenerate-strategy.ts
```

- [ ] **Step 2: Remove from pipeline**

In `standup-pipeline.service.ts`:
- Remove import of `ExecuteRegenerateStrategy`
- Remove constructor param `regenerateStrategy`
- In `runStrategy()`, remove `case 'regenerate'` — only `'adjust'` and `default` remain

- [ ] **Step 3: Remove from worker module**

In `worker.module.ts`:
- Remove import of `ExecuteRegenerateStrategy`
- Remove from `providers` array

- [ ] **Step 4: Simplify `resolveRunMode`**

```typescript
import type { StandupRunMode } from '../../../../platform/events/standup-events'
import type { StandupJobOptions } from './types'

export function resolveRunMode(options: StandupJobOptions): StandupRunMode {
  if (options.rewriteInstruction?.trim()) {
    return 'adjust'
  }

  return 'generate'
}
```

- [ ] **Step 5: Remove `reuseExistingSource` from `StandupJobOptions`**

In `types.ts`, remove the `reuseExistingSource?: boolean` line.

- [ ] **Step 6: Run typecheck**

```bash
cd apps/api && bun run typecheck
```

This will show any remaining references to removed types. Fix them.

- [ ] **Step 7: Commit**

```bash
git add -u
git commit -m "refactor: remove ExecuteRegenerateStrategy, reuseExistingSource, and simplify resolveRunMode"
```

---

### Task 5: Remove `StandupGeneratorService` and clean up module

**Files:**
- Delete: `apps/api/src/contexts/standups/worker/standup-generator/standup-generator.service.ts`
- Delete: `apps/api/src/contexts/standups/worker/standup-generator/standup-generator.service.spec.ts`
- Modify: `apps/api/src/contexts/standups/worker/standup-generator/standup-generator.module.ts`

- [ ] **Step 1: Delete the service and spec**

```bash
rm apps/api/src/contexts/standups/worker/standup-generator/standup-generator.service.ts
rm apps/api/src/contexts/standups/worker/standup-generator/standup-generator.service.spec.ts
```

- [ ] **Step 2: Update the module**

In `standup-generator.module.ts`, remove `StandupGeneratorService` from providers and exports:

```typescript
import { Module } from '@nestjs/common'
import { AzureDevopsModule } from '../azure-devops/azure-devops.module'
import { WorkerRuntimeConfigModule } from '../worker-runtime-config.module'
import { LlmProviderRegistry } from './llm-provider-registry'
import { StandupPromptService } from './standup-prompt.service'

@Module({
  imports: [AzureDevopsModule, WorkerRuntimeConfigModule],
  providers: [StandupPromptService, LlmProviderRegistry],
  exports: [StandupPromptService, LlmProviderRegistry],
})
export class StandupGeneratorModule {}
```

- [ ] **Step 3: Run typecheck**

```bash
cd apps/api && bun run typecheck
```

Fix any remaining imports of `StandupGeneratorService`.

- [ ] **Step 4: Commit**

```bash
git add -u
git commit -m "refactor: remove StandupGeneratorService and clean up module"
```

---

### Task 6: Migrate `RunWeeklyDigestJobService` to `StandupAgentService`

**Files:**
- Modify: `apps/api/src/contexts/standups/worker/digests/run-weekly-digest-job.service.ts`

- [ ] **Step 1: Read current file and modify**

Replace import and constructor injection:

```typescript
// REMOVE:
import { StandupGeneratorService } from '../standup-generator/standup-generator.service'
// ADD:
import { StandupAgentService } from '../standup-agent/standup-agent.service'
```

In constructor, replace:
```typescript
// REMOVE:
    private readonly standupGenerator: StandupGeneratorService,
// ADD:
    private readonly standupAgent: StandupAgentService,
```

At line 163, replace:
```typescript
// REMOVE:
      () => this.standupGenerator.generateWeeklyInsights(standupsResult.value),
// ADD:
      () => this.standupAgent.generateWeeklyInsights(standupsResult.value),
```

- [ ] **Step 2: Ensure the digest module has access to `StandupAgentService`**

Check which module registers `RunWeeklyDigestJobService`. If it's in `WorkerModule`, the `StandupAgentModule` is already imported (from Phase 2). If not, add the import.

- [ ] **Step 3: Run typecheck**

```bash
cd apps/api && bun run typecheck
```

- [ ] **Step 4: Commit**

```bash
git add -u
git commit -m "refactor: migrate RunWeeklyDigestJobService to use StandupAgentService"
```

---

### Task 7: Remove `USE_PI_AGENT` flag and `'regenerate'` from event types

**Files:**
- Modify: `apps/api/src/platform/env/env.schema.ts`
- Modify: `apps/api/src/platform/env/env.service.ts`
- Modify: `apps/api/src/contexts/standups/worker/worker-runtime-config.service.ts`
- Modify: `apps/api/src/platform/events/standup-events.ts`
- Modify: `apps/api/src/contexts/standups/events/standup-sse.types.ts`

- [ ] **Step 1: Remove `USE_PI_AGENT` from env schema**

In `env.schema.ts`, delete the line:
```typescript
  USE_PI_AGENT: booleanFromEnv.default(false),
```

- [ ] **Step 2: Remove from env service**

In `env.service.ts`, remove from `worker` getter:
```typescript
      usePiAgent: this.get('USE_PI_AGENT'),
```

- [ ] **Step 3: Remove from worker runtime config**

In `worker-runtime-config.service.ts`:
- Remove `USE_PI_AGENT: boolean` from `WorkerRuntimeConfig` interface
- Remove `USE_PI_AGENT: this.env.worker.usePiAgent` from config getter

- [ ] **Step 4: Remove `'regenerate'` from `StandupRunMode`**

In `standup-events.ts`:
```typescript
export type StandupRunMode = 'generate' | 'adjust'
```

- [ ] **Step 5: Remove `'regenerate'` from SSE types**

In `standup-sse.types.ts`, update the `mode` field in all event variants to remove `'regenerate'`:
```typescript
mode: 'generate' | 'adjust'
```

- [ ] **Step 6: Run typecheck and fix any remaining references**

```bash
cd apps/api && bun run typecheck 2>&1 | head -30
```

Fix any errors (likely in trigger service/DTO, Discord trigger service).

- [ ] **Step 7: Commit**

```bash
git add -u
git commit -m "refactor: remove USE_PI_AGENT flag and 'regenerate' from StandupRunMode"
```

---

### Task 8: Remove `reuseExistingSource` from trigger/DTO chain

**Files:**
- Modify: `apps/api/src/contexts/standups/trigger/trigger-standup.dto.ts`
- Modify: `apps/api/src/contexts/standups/trigger/trigger-standup.service.ts`
- Modify: `apps/api/src/interfaces/discord/services/discord-trigger.service.ts`

- [ ] **Step 1: Remove from DTO**

In `trigger-standup.dto.ts`, remove the `reuseExistingSource` field:
```typescript
  // DELETE these lines:
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  reuseExistingSource?: boolean
```

- [ ] **Step 2: Remove from trigger service**

In `trigger-standup.service.ts`, find where `reuseExistingSource` is passed to `dispatchStandupJob` and remove it.

- [ ] **Step 3: Remove from Discord trigger service**

In `discord-trigger.service.ts`, remove `reuseExistingSource` from the `DiscordTriggerOptions` interface and from the trigger call.

- [ ] **Step 4: Run typecheck**

```bash
cd apps/api && bun run typecheck
```

- [ ] **Step 5: Commit**

```bash
git add -u
git commit -m "refactor: remove reuseExistingSource from trigger DTO and services"
```

---

### Task 9: Update frontend Angular

**Files:**
- Modify: `apps/web/src/app/features/dashboard/services/standup-service.ts`
- Modify: `apps/web/src/app/shared/models/standup-models.ts`
- Modify: `apps/web/src/app/api/model/triggerStandupDto.ts`

- [ ] **Step 1: Update regenerate in standup service**

In `standup-service.ts`, update the `regenerate()` method — remove `reuseExistingSource`:

```typescript
  async regenerate(id: string) {
    return this.triggerMutation.mutateAsync({
      data: {
        forceRegenerate: true,
        replaceStandupId: id,
      },
    })
  }
```

- [ ] **Step 2: Update `StandupGenerationMode`**

In `standup-models.ts`, change:
```typescript
export type StandupGenerationMode = 'generate' | 'adjust'
```

Search for any usage of `mode === 'regenerate'` in the frontend and update (likely just display logic — treat as `'generate'`).

- [ ] **Step 3: Update trigger DTO model**

In `apps/web/src/app/api/model/triggerStandupDto.ts`, remove the `reuseExistingSource` field.

- [ ] **Step 4: Check for compile errors**

```bash
cd apps/web && bun run typecheck 2>&1 | head -30
```

Fix any remaining references.

- [ ] **Step 5: Commit**

```bash
git add -u
git commit -m "refactor: update frontend to remove reuseExistingSource and regenerate mode"
```

---

### Task 10: Run full test suite and fix issues

**Files:** None (verification only)

- [ ] **Step 1: Run API test suite**

```bash
cd apps/api && bun run test
```

Fix any failures from removed dependencies (likely tests that mock `StandupGeneratorService` or `ExecuteRegenerateStrategy`).

- [ ] **Step 2: Run lint**

```bash
cd apps/api && bun run lint
```

- [ ] **Step 3: Run typecheck (full monorepo)**

```bash
bun run typecheck
```

- [ ] **Step 4: Commit fixes**

```bash
git add -u
git commit -m "fix: resolve test/lint issues from Phase 4 legacy removal"
```

---

### Task 11: Integration smoke test

**Files:** None (manual verification)

- [ ] **Step 1: Verify generate works (no USE_PI_AGENT flag needed)**

```bash
cd apps/api && bun run dev
```

Trigger standup — should work without any env flag.

- [ ] **Step 2: Verify regenerate works**

Click "Regenerar" in Discord — should go through `ExecuteGenerateStrategy` with full pipeline.

- [ ] **Step 3: Verify adjust works**

Click "Ajustar texto" — should use PI Agent multi-turn.

- [ ] **Step 4: Verify weekly insights**

Trigger weekly digest job — should use `StandupAgentService.generateWeeklyInsights()`.

---

## Summary

| Task | Description | Files |
|------|-------------|-------|
| 1 | Add `generateWeeklyInsights()` to `StandupAgentService` | 2 files |
| 2 | Simplify `ExecuteGenerateStrategy` — remove branching | 2 files |
| 3 | Simplify `ExecuteAdjustStrategy` — remove branching | 2 files |
| 4 | Remove `ExecuteRegenerateStrategy` + simplify pipeline/types | 5 files + 1 delete |
| 5 | Remove `StandupGeneratorService` + clean module | 1 file + 2 deletes |
| 6 | Migrate `RunWeeklyDigestJobService` | 1 file |
| 7 | Remove `USE_PI_AGENT` flag + `'regenerate'` from types | 5 files |
| 8 | Remove `reuseExistingSource` from trigger chain | 3 files |
| 9 | Update frontend Angular | 3 files |
| 10 | Full test suite verification | N/A |
| 11 | Integration smoke test | N/A |
