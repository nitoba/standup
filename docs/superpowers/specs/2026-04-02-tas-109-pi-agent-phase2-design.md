# TAS-109: PI Agent Integration — Fase 2 (Multi-turn Sessions)

## Contexto

A Fase 1 adicionou geracao de standups via PI Agent com `USE_PI_AGENT=true`, mas cada chamada e descartavel (single-turn). O ajuste de texto (`ExecuteAdjustStrategy`) ainda usa o path legacy (`generateAdjustedStandup()` one-shot). A Fase 2 introduz sessoes stateful para que ajustes acumulem contexto — "mude o item 2" seguido de "agora resuma mais" funciona sem perder o contexto do primeiro ajuste.

**Issue:** [TAS-109](https://linear.app/nito/issue/TAS-109)
**Pre-requisito:** Fase 1 completa (spec em `2026-04-01-tas-109-pi-agent-phase1-design.md`)

## Decisoes de Design

| Decisao | Escolha | Justificativa |
|---------|---------|---------------|
| Gestao de sessao | `AgentSessionManager` injectable separado | Desacopla lifecycle do agent da logica de geracao |
| Chave de sessao | `standupId` | Um standup = uma sessao. Alinha com modelo de dados |
| Criacao da sessao | Na geracao inicial | Contexto acumulado desde a geracao e o ganho real do multi-turn |
| Adjust sem sessao | Cria agent fresh com seed do conteudo | Nunca volta pro legacy quando `USE_PI_AGENT=true` |
| Regenerar | Destroi sessao + gera nova do zero | Regenerar e semanticamente "comecar do zero" |
| TTL | 30min de inatividade, reset a cada `prompt()` | Equilibrio entre memoria e usabilidade |
| Cleanup | `setInterval` a cada 5min varrendo sessoes expiradas | Previsivel, Map pequeno (1 sessao por usuario ativo) |

## Componentes

### 1. `AgentSessionManager` (novo)

**Localizacao:** `apps/api/src/contexts/standups/worker/standup-agent/agent-session-manager.ts`

**Responsabilidade:** Unico dono do lifecycle das sessoes de agent. Gerencia criacao, lookup, destruicao e cleanup por TTL.

**Interface:**

```typescript
interface AgentSession {
  agent: Agent
  lastAccessedAt: number
}

@Injectable()
class AgentSessionManager implements OnModuleInit, OnModuleDestroy {
  private readonly sessions: Map<string, AgentSession>
  private cleanupInterval: ReturnType<typeof setInterval> | null

  create(standupId: string, agent: Agent): void
  get(standupId: string): Agent | null       // retorna agent ou null se expirado/inexistente
  destroy(standupId: string): void           // no-op se nao existe
  has(standupId: string): boolean
  onModuleInit(): void                       // inicia cleanup interval (5min)
  onModuleDestroy(): void                    // para cleanup interval
}
```

**Comportamento:**
- `get()` atualiza `lastAccessedAt` ao retornar o agent (reset do TTL)
- `get()` retorna `null` e remove a sessao se `now - lastAccessedAt > SESSION_TTL_MS`
- `destroy()` e idempotente — chamado em approve, reject, regenerate, e pelo cleanup
- Cleanup interval varre todas as sessions a cada 5min e remove expiradas
- `SESSION_TTL_MS = 30 * 60 * 1000` (30 minutos)
- `CLEANUP_INTERVAL_MS = 5 * 60 * 1000` (5 minutos)

### 2. Alteracao no `StandupAgentService`

**Localizacao:** `apps/api/src/contexts/standups/worker/standup-agent/standup-agent.service.ts`

**Mudancas:**
- Injeta `AgentSessionManager`
- `generate()` agora retorna `{ content, summary, agent }` — expoe o agent instance para que o pipeline salve a sessao apos persistir o standup
- Novo metodo `adjust()`:

```typescript
async adjust(input: AgentAdjustInput): Promise<
  Result<GeneratedStandup, ExternalServiceError | AllProvidersUnavailableError>
>
```

**`AgentAdjustInput` interface:**

```typescript
interface AgentAdjustInput {
  standupId: string
  instruction: string
  previousContent: string           // conteudo atual do standup (para seed se sessao nao existe)
  previousSummary?: string
  extraContext?: string
  onStageChange?: (stage: GeneratorStage) => Promise<void> | void
}
```

**Fluxo do `adjust()`:**

```
1. onStageChange('generating_standup')
2. existingAgent = sessionManager.get(standupId)
3. if (existingAgent):
     agent = existingAgent
     agent.prompt(instruction)                    ← multi-turn real
4. else:
     systemPrompt = promptService.buildSystemPrompt(...)
     retry loop (models):
       agent = new Agent({ systemPrompt, model, tools: [submitStandup], getApiKey })
       // Seed: injeta conteudo anterior como contexto
       agent.state.messages = buildSeedMessages(previousContent)
       agent.prompt(instruction)
       if success: sessionManager.create(standupId, agent)
5. extractSubmitStandupResult(agent.state.messages)
6. return { content, summary }
```

**`buildSeedMessages()`:** Constroi um historico artificial para dar contexto ao agent:
- UserMessage: "Gere o standup..." (prompt resumido)
- AssistantMessage: tool_call `submit_standup` com `{ content: previousContent, summary: previousSummary }`
- ToolResultMessage: "Standup submitted successfully."

Isso simula que o agent gerou o standup original, dando contexto para o ajuste.

**Retry loop no adjust:**
- Se `existingAgent` existe: usa o modelo ja configurado no agent, sem retry loop (o modelo ja foi selecionado na geracao). Se falhar, retorna erro.
- Se `existingAgent` nao existe: retry loop identico ao `generate()` (itera modelos do registry).

### 3. Alteracao no `ExecuteGenerateStrategy`

**Localizacao:** `apps/api/src/contexts/standups/worker/standup/strategies/execute-generate-strategy.ts`

**Mudancas:**
- Injeta `AgentSessionManager`
- Quando `USE_PI_AGENT=true`:
  - Destroi sessao antiga se `replaceStandupId` presente (cenario de regenerate)
  - Recebe `{ content, summary, agent }` do `StandupAgentService.generate()`
  - Apos retornar o resultado, salva o agent na sessao. O `standupId` e determinado pelo pipeline (`replaceStandupId` ou novo ID). Para resolver isso, o strategy retorna o agent no `GeneratedContent` (campo transitorio, nao persistido no DB).

**Mudanca no `GeneratedContent`:**

```typescript
interface GeneratedContent {
  content: string
  meetingType: string
  sourceData: string
  replaceStandupId?: string
  agent?: Agent                     // transitorio, usado apenas para criar sessao
}
```

**No `StandupPipelineService.saveGeneratedStandup()`:**
- Apos salvar com sucesso, se `generatedContent.agent` presente:
  - `sessionManager.create(standupId, generatedContent.agent)`
  - Remove `agent` do objeto (nao serializar)

### 4. Alteracao no `ExecuteAdjustStrategy`

**Localizacao:** `apps/api/src/contexts/standups/worker/standup/strategies/execute-adjust-strategy.ts`

**Mudancas:**
- Injeta `StandupAgentService` e `WorkerRuntimeConfigService`
- Branching em `USE_PI_AGENT`:

```
USE_PI_AGENT=true:
  busca conteudo do standup no DB
  StandupAgentService.adjust({
    standupId,
    instruction,
    previousContent,
    extraContext,
  })
  retorna GeneratedContent

USE_PI_AGENT=false:
  StandupGeneratorService.generateAdjustedStandup() [legacy, sem mudanca]
```

### 5. Destruicao de sessao em approve/reject

**Localizacao:** `apps/api/src/interfaces/discord/handlers/standup-interaction.service.ts`

**Mudanca:** Apos transicao de estado bem-sucedida em `handleApprove()` e `handleReject()`:
- Chama `sessionManager.destroy(standupId)`
- Non-fatal: se destroy falhar (sessao ja expirada), log e continua

**Regenerate** ja e tratado na `ExecuteGenerateStrategy` (destroi sessao antiga antes de criar nova).

## Data Flows

### Geracao com sessao

```
ExecuteGenerateStrategy (USE_PI_AGENT=true)
  |-- destroi sessao antiga se replaceStandupId presente
  |-- StandupAgentService.generate(input)
  |     |-- cria Agent, prompt, extrai resultado
  |     |-- retorna { content, summary, agent }
  |-- result passado para pipeline com agent transitorio
  |-- pipeline salva standup no DB → standupId conhecido
  |-- sessionManager.create(standupId, agent)
```

### Adjust multi-turn (sessao existe)

```
ExecuteAdjustStrategy (USE_PI_AGENT=true)
  |-- busca conteudo do standup no DB
  |-- StandupAgentService.adjust({ standupId, instruction, previousContent })
  |     |-- sessionManager.get(standupId) → Agent encontrado!
  |     |-- agent.prompt(instruction) ← multi-turn com contexto acumulado
  |     |-- extractSubmitStandupResult → { content, summary }
  |-- retorna GeneratedContent (sem agent — sessao ja existe)
```

### Adjust single-turn (sessao expirada)

```
ExecuteAdjustStrategy (USE_PI_AGENT=true)
  |-- busca conteudo do standup no DB
  |-- StandupAgentService.adjust({ standupId, instruction, previousContent })
  |     |-- sessionManager.get(standupId) → null (expirou)
  |     |-- cria Agent fresh com seed messages
  |     |-- agent.prompt(instruction)
  |     |-- sessionManager.create(standupId, agent) ← sessao nova
  |     |-- extractSubmitStandupResult → { content, summary }
  |-- retorna GeneratedContent
```

### Regenerar

```
Discord "Regenerar" → rejeita standup → trigger → job
  |-- ExecuteGenerateStrategy (USE_PI_AGENT=true)
  |     |-- sessionManager.destroy(replaceStandupId) ← destroi sessao antiga
  |     |-- StandupAgentService.generate(input) ← geracao nova
  |     |-- pipeline salva → sessionManager.create(newStandupId, agent)
```

### Aprovar/Rejeitar

```
StandupInteractionService.handle('approve'|'reject', standupId)
  |-- transicao de estado no DB
  |-- sessionManager.destroy(standupId) ← cleanup
```

## Error Handling

### Processo reinicia
Sessoes in-memory sao perdidas. O proximo ajuste cria agent fresh com seed — degrada para single-turn sem erro. Aceitavel para Fase 2.

### Timeout no adjust multi-turn
Mesmo 60s timeout por `agent.prompt()`. Se timeout: reporta erro, sessao permanece valida (o agent nao e destruido por timeout — o contexto anterior persiste para a proxima tentativa).

### Concorrencia
O job lock existente (`JobRunRepository.acquireLock`) impede execucao concorrente do mesmo standup. Nao ha risco de dois ajustes simultaneos na mesma sessao.

### Adjust com modelo diferente (sessao multi-turn)
Quando a sessao existe, o agent ja tem um modelo configurado (da geracao). O adjust usa esse modelo, sem consultar o registry. Se o modelo estiver em backoff, o adjust pode falhar — nesse caso retorna erro e o usuario pode tentar novamente (o cleanup de backoff do registry reseta apos 5min).

### Destruicao de sessao e idempotente
`sessionManager.destroy()` e no-op se a sessao nao existe (expirou ou ja foi destruida). Seguro chamar multiplas vezes.

## O que NAO Muda

- `ExecuteRegenerateStrategy` — continua chamando `generateStandup()` (que ja usa agent via Fase 1)
- `StandupGeneratorService` — mantido intacto, usado por `USE_PI_AGENT=false`
- Discord buttons/modals — sem alteracao na UI
- Pipeline de coleta (git, board, enrich) — sem alteracao
- `StandupJobOptions` — sem novos campos
- `resolveRunMode()` — sem alteracao

## Testes

- **`agent-session-manager.spec.ts`** — create/get/destroy, TTL expiracao, cleanup interval, get reseta TTL, destroy idempotente
- **`standup-agent.service.spec.ts`** (update) — novo metodo `adjust()`: multi-turn com sessao existente, seed quando sessao nao existe, retry loop no seed path, extracao de resultado
- **`execute-adjust-strategy.spec.ts`** (novo) — branching `USE_PI_AGENT`, chama agent adjust vs legacy
- **`execute-generate-strategy.spec.ts`** (update) — sessao criada apos geracao, sessao antiga destruida no regenerate
- **`standup-interaction.service.spec.ts`** (update) — destroy chamado apos approve/reject

## Preparacao para Fase 3

A sessao persistida no `AgentSessionManager` habilita:
- Streaming via `agent.subscribe()` para editar embeds do Discord progressivamente
- Historico de versoes do standup na sessao (undo last adjustment)
- Indicador de "digitando..." enquanto o agent processa
