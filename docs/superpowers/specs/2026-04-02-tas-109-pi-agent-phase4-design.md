# TAS-109: PI Agent Integration — Fase 4 (Migracao Completa)

## Contexto

As Fases 1-3 adicionaram geracao via PI Agent, sessoes multi-turn, e streaming — tudo controlado pela flag `USE_PI_AGENT`. O path legacy (`StandupGeneratorService`) continua existindo em paralelo. A Fase 4 remove o path legacy, a feature flag, e consolida tudo no PI Agent como caminho unico.

**Issue:** [TAS-109](https://linear.app/nito/issue/TAS-109)
**Pre-requisitos:** Fases 1, 2 e 3 completas

## Decisoes de Design

| Decisao | Escolha | Justificativa |
|---------|---------|---------------|
| `USE_PI_AGENT` flag | Removida completamente | PI Agent testado e funcional, git revert como fallback |
| `ExecuteRegenerateStrategy` | Removida | Regenerate = gerar do zero, mesmo pipeline do generate |
| `reuseExistingSource` | Removido de `StandupJobOptions` | Dead code sem consumidor |
| `StandupGeneratorService` | Removido inteiramente | Substituido pelo `StandupAgentService` |
| Weekly insights | Migrado para `StandupAgentService` via `agent.prompt()` direto | Sem tool, retorna texto |
| `determineMeetingType` | Chamado direto de `StandupPromptService` | Remove wrapper no generator |
| `StandupGeneratorModule` | Mantido | Continua exportando `StandupPromptService` e `LlmProviderRegistry` |
| `StandupRunMode` | Remove `'regenerate'` | Dois modes: `'generate'` e `'adjust'` |

## O que e Removido

### Arquivos deletados

| Arquivo | Motivo |
|---------|--------|
| `standup-generator.service.ts` | Substituido por `StandupAgentService` |
| `standup-generator.service.spec.ts` | Testes do servico removido |
| `execute-regenerate-strategy.ts` | Regenerate usa `ExecuteGenerateStrategy` |
| Spec do regenerate strategy (se existir) | Testes da strategy removida |

### Codigo removido de arquivos existentes

| Arquivo | O que remover |
|---------|---------------|
| `env.schema.ts` | `USE_PI_AGENT: booleanFromEnv.default(false)` |
| `env.service.ts` | `usePiAgent: this.get('USE_PI_AGENT')` do getter `worker` |
| `worker-runtime-config.service.ts` | `USE_PI_AGENT: boolean` da interface e do getter |
| `standup-generator.module.ts` | Remove `StandupGeneratorService` dos providers e exports |
| `worker.module.ts` | Remove `ExecuteRegenerateStrategy` dos providers |
| `standup-pipeline.service.ts` | Remove injecao de `ExecuteRegenerateStrategy`, remove case `'regenerate'` do switch |
| `standup-events.ts` | Remove `'regenerate'` de `StandupRunMode` |
| `types.ts` (worker/standup) | Remove `reuseExistingSource` de `StandupJobOptions` |
| `resolve-run-mode.ts` | Remove check `reuseExistingSource` |

## Componentes Alterados

### 1. `StandupAgentService` — novo metodo `generateWeeklyInsights`

**Localizacao:** `apps/api/src/contexts/standups/worker/standup-agent/standup-agent.service.ts`

**Novo metodo:**

```typescript
async generateWeeklyInsights(
  standups: StandupRecord[],
): Promise<Result<string, ExternalServiceError | AllProvidersUnavailableError>>
```

**Comportamento:**
- Valida `standups.length > 0` (retorna `ExternalServiceError` se vazio)
- System prompt: `standupPrompt.buildWeeklyInsightsSystemPrompt()`
- User message: `standupPrompt.buildWeeklyInsightsUserMessage(standups)`
- Retry loop com `LlmProviderRegistry` (mesmo padrao do `generate()`)
- Cria Agent com model, system prompt, sem tools (texto direto)
- Executa `agent.prompt(userMessage)`
- Extrai texto da ultima `AssistantMessage` em `agent.state.messages`
- Retorna `Result.ok(text)` ou erro

### 2. `ExecuteGenerateStrategy` — simplificado

**Localizacao:** `apps/api/src/contexts/standups/worker/standup/strategies/execute-generate-strategy.ts`

**Mudancas:**
- Remove injecao de `StandupGeneratorService` e `WorkerRuntimeConfigService`
- Remove branching `usePiAgent` — sempre chama `standupAgent.generate()`
- `determineMeetingType` chamado via nova injecao de `StandupPromptService`
- Sessao sempre destruida quando `replaceStandupId` presente (sem check `usePiAgent`)
- Remove import de `StandupGeneratorService`

### 3. `ExecuteAdjustStrategy` — simplificado

**Localizacao:** `apps/api/src/contexts/standups/worker/standup/strategies/execute-adjust-strategy.ts`

**Mudancas:**
- Remove injecao de `StandupGeneratorService` e `WorkerRuntimeConfigService`
- Remove branching — sempre chama `standupAgent.adjust()`
- Remove import de `StandupGeneratorService`

### 4. `resolveRunMode` — simplificado

**Localizacao:** `apps/api/src/contexts/standups/worker/standup/resolve-run-mode.ts`

```typescript
export function resolveRunMode(options: StandupJobOptions): StandupRunMode {
  if (options.rewriteInstruction?.trim()) return 'adjust'
  return 'generate'
}
```

### 5. `StandupPipelineService` — remove regenerate case

**Localizacao:** `apps/api/src/contexts/standups/worker/standup/standup-pipeline.service.ts`

**Mudancas:**
- Remove injecao de `ExecuteRegenerateStrategy`
- Remove `case 'regenerate'` do `runStrategy` switch (fica so `'adjust'` e `default: 'generate'`)

### 6. `RunWeeklyDigestJobService` — migra para `StandupAgentService`

**Localizacao:** `apps/api/src/contexts/standups/worker/digests/run-weekly-digest-job.service.ts`

**Mudancas:**
- Substitui injecao de `StandupGeneratorService` por `StandupAgentService`
- Chama `standupAgent.generateWeeklyInsights(standups)`

### 7. `StandupRunMode` — remove `'regenerate'`

**Localizacao:** `apps/api/src/platform/events/standup-events.ts`

```typescript
export type StandupRunMode = 'generate' | 'adjust'
```

**Impacto downstream:**
- SSE types (`standup-sse.types.ts`) — remover `'regenerate'` do `mode` union
- Frontend Angular — verificar se `mode === 'regenerate'` e usado em algum componente. Se sim, tratar como `'generate'` ou remover a referencia.

### 8. `StandupGeneratorModule` — remove `StandupGeneratorService`

**Localizacao:** `apps/api/src/contexts/standups/worker/standup-generator/standup-generator.module.ts`

```typescript
@Module({
  imports: [AzureDevopsModule, WorkerRuntimeConfigModule],
  providers: [StandupPromptService, LlmProviderRegistry],
  exports: [StandupPromptService, LlmProviderRegistry],
})
export class StandupGeneratorModule {}
```

Nota: o modulo pode ser renomeado para `LlmInfraModule` ou similar no futuro, mas manter o nome atual para minimizar churn.

## Data Flows (pos-migracao)

### Generate (normal e regenerate)

```
Trigger → resolveRunMode → 'generate'
  → ExecuteGenerateStrategy
      → sessionManager.destroy(replaceStandupId) se presente
      → collect git + board
      → standupPrompt.determineMeetingType(today)
      → standupAgent.generate({ onContentDelta, onStageChange, ... })
      → persist → sessionManager.create(standupId, agent)
      → notify
```

### Adjust

```
Trigger → resolveRunMode → 'adjust'
  → ExecuteAdjustStrategy
      → fetch base standup
      → standupAgent.adjust({ standupId, instruction, previousContent })
      → persist (replace)
      → notify
```

### Weekly Insights

```
RunWeeklyDigestJobService.run()
  → fetch approved standups da semana
  → standupAgent.generateWeeklyInsights(standups)
  → save digest
```

## Error Handling

### Sem fallback para legacy
Se o PI Agent falha, retorna `AllProvidersUnavailableError`. Sem fallback silencioso. O operador pode fazer git revert se necessario.

### Weekly insights sem tool
O `generateWeeklyInsights` usa `agent.prompt()` direto sem tool. Se o agent nao retornar texto util, o digest fica vazio. Aceitavel — o weekly insights e informativo, nao critico.

## O que NAO Muda

- `AgentSessionManager` — sem alteracao
- `DiscordStreamingListener` — sem alteracao
- `StandupPromptService` — sem alteracao
- `LlmProviderRegistry` — sem alteracao
- Discord buttons/modals — sem alteracao
- `StandupAgentService.generate()` e `adjust()` — sem alteracao
- `buildSeedMessages` — sem alteracao

## Testes

### Testes removidos
- `standup-generator.service.spec.ts` — removido junto com o servico

### Testes atualizados
- `execute-generate-strategy.spec.ts` — remover testes do path legacy, simplificar mocks
- `execute-adjust-strategy.spec.ts` — remover testes do path legacy, simplificar mocks
- `standup-pipeline.service.spec.ts` (se existir) — remover mock de `ExecuteRegenerateStrategy`
- `resolve-run-mode.spec.ts` (se existir) — remover test de `reuseExistingSource`
- `run-weekly-digest-job.service.spec.ts` — trocar mock de `StandupGeneratorService` por `StandupAgentService`

### Testes novos
- `standup-agent.service.spec.ts` — novo teste para `generateWeeklyInsights()`: sucesso, array vazio, fallback de modelo

## Verificacao de impacto no frontend

Antes de implementar, verificar no frontend Angular:
- `grep -r "regenerate" apps/web/src/ --include="*.ts"` — se `mode === 'regenerate'` e usado em algum componente, precisa atualizar
- A SSE type `standup_progress` com `mode: 'regenerate'` precisa ser tratada ou removida
