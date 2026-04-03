# TAS-109: PI Agent Integration — Fase 1 (PoC)

## Contexto

A geracaoo de standups atualmente usa Vercel AI SDK (`generateText` + `Output.object()`) em chamadas one-shot. O objetivo e integrar `@mariozechner/pi-agent-core` para habilitar geracao stateful com multi-turn — mas na Fase 1, o escopo e substituir apenas a geracao (`generate`) por um agent single-turn, lado a lado com o legacy.

**Issue:** [TAS-109](https://linear.app/nito/issue/TAS-109)

## Decisoes de Design

| Decisao | Escolha | Justificativa |
|---------|---------|---------------|
| Provider | Wrapper — `LlmProviderRegistry` mantido | Preserva resiliencia existente (round-robin + backoff) |
| Model selection | Model-per-prompt com retry externo | Transparente nos logs, similar ao `callWithFallback` atual |
| Structured output | TypeBox nativo via tool `submit_standup` | PI Agent usa TypeBox nativamente, evita camada de conversao |
| Sessoes | Inline descartavel | YAGNI — session manager so na Fase 2 |
| Feature flag | Env var `USE_PI_AGENT=true/false` | Toggle global simples, suficiente para PoC |
| Scope | So `generate` pelo agent | Adjust e regenerate ficam no legacy — ganho real so com multi-turn (Fase 2) |

## Componentes Novos

### 1. `StandupAgentService`

**Localicao:** `apps/api/src/contexts/standups/worker/standup-agent/standup-agent.service.ts`

**Responsabilidade:** Criar Agent do `pi-agent-core`, configurar system prompt + tool `submit_standup`, executar `prompt()`, extrair resultado estruturado.

**Interface:**

```typescript
class StandupAgentService {
  constructor(
    private readonly promptService: StandupPromptService,
    private readonly providerRegistry: LlmProviderRegistry,
  ) {}

  async generate(input: {
    date: string
    meetingType: string
    gitActivity?: GatheredGitActivity
    boardActivity?: GatheredBoardActivity
    enrichedActivity?: EnrichedGitActivity
    extraContext?: string
    onStageChange?: (stage: string) => void
  }): Promise<Result<{ content: string; summary: string }, StandupGenerationError>>
}
```

**Retry loop:**

```
retry loop (max = total de modelos no registry):
  model = registry.getNextModel()
  piModel = toPiAiModel(model)
  agent = new Agent({ systemPrompt, tools: [submitStandupTool], model: piModel })
  result = await agent.prompt(userMessage)  // com timeout 60s
  toolResult = extractSubmitStandupResult(agent.state.messages)
  if (toolResult) return Ok(toolResult)
  registry.reportFailure(model)
  continue
return Err(AllProvidersUnavailableError)
```

### 2. `submit-standup.tool.ts`

**Localizacao:** `apps/api/src/contexts/standups/worker/standup-agent/tools/submit-standup.tool.ts`

**Schema TypeBox:**

```typescript
import { Type } from "@sinclair/typebox"

const SubmitStandupParams = Type.Object({
  content: Type.String({ description: "Standup content in markdown, max 2000 chars" }),
  summary: Type.String({ description: "One-line summary of the standup" }),
})
```

**Comportamento:**
- O agent e instruido no system prompt a obrigatoriamente chamar `submit_standup` para entregar o resultado
- `execute()` retorna os params recebidos (tool-as-output pattern)
- Validacao TypeBox via AJV e automatica no PI Agent
- Extracao do resultado: apos `agent.prompt()`, iterar `agent.state.messages` procurando mensagem com `toolCalls` onde `name === "submit_standup"` e ler os `args` parseados

### 3. `pi-ai-model-adapter.ts`

**Localizacao:** `apps/api/src/contexts/standups/worker/standup-agent/pi-ai-model-adapter.ts`

**Funcao:** Mapeia modelo do `LlmProviderRegistry` para `getModel()` do `pi-ai`.

```typescript
import { getModel } from "@mariozechner/pi-ai"

function toPiAiModel(registryModel: { provider: string; model: string }) {
  return getModel(registryModel.provider, registryModel.model)
}
```

Mapeamento direto: `google` -> `"google"`, `groq` -> `"groq"`, `openrouter` -> `"openrouter"`.

### 4. Alteracao em `ExecuteGenerateStrategy`

**Localizacao:** `apps/api/src/contexts/standups/worker/standup/strategies/execute-generate-strategy.ts`

**Mudanca:** Ler env var `USE_PI_AGENT`. Se `true`, delegar para `StandupAgentService.generate()`. Se `false`, manter comportamento atual com `StandupGeneratorService.generateStandup()`.

A strategy ja recebe os dados coletados e enriquecidos — so muda o destino da chamada de geracao.

### 5. Env var nova

**Em `WorkerEnv` (packages/config):**

```typescript
USE_PI_AGENT: z.coerce.boolean().default(false)
```

Adicionada ao `loadWorkerEnv()` e `workerEnvSchema`.

## Data Flow

```
ExecuteGenerateStrategy
  |-- collect git + board (sem mudanca)
  |-- enrich (sem mudanca)
  |-- USE_PI_AGENT?
  |   |-- true:
  |   |   StandupAgentService.generate(gitActivity, boardActivity, enriched, meetingType)
  |   |     |-- promptService.buildSystemPrompt(sourceType)
  |   |     |-- promptService.buildUserMessage(date, meetingType, enriched, board)
  |   |     |-- retry loop:
  |   |     |     model = registry.getNextModel()
  |   |     |     agent = new Agent({ systemPrompt, tools: [submitStandup], model: toPiAiModel(model) })
  |   |     |     await agent.prompt(userMessage)
  |   |     |     extract { content, summary } from submit_standup tool call
  |   |     |     if error -> registry.reportFailure(model), next
  |   |     |-- return { content, summary }
  |   |
  |   |-- false:
  |       StandupGeneratorService.generateStandup() (legacy, sem mudanca)
  |
  |-- persist + notify (sem mudanca)
```

## Error Handling

### Tool nao chamado
O agent pode responder com texto sem chamar `submit_standup`. O `StandupAgentService` verifica no `agent.state.messages` se houve tool call com name `submit_standup`. Se nao: trata como erro, `reportFailure()`, proximo modelo.

### Content excede 2000 chars
Apos extrair resultado do tool, validar `content.length > 2000`. Se exceder: fazer segundo `agent.prompt("O conteudo excedeu 2000 caracteres. Reescreva de forma mais concisa mantendo todos os itens.")` no mesmo agent (aproveitando contexto single-turn). Se ainda exceder: truncar.

### Timeout por tentativa
PI Agent nao tem timeout nativo. Cada `agent.prompt()` deve ser envolvido com `AbortSignal.timeout(60_000)` ou `Promise.race` com timer de 60s. Timeout -> `reportFailure()` -> proximo modelo.

### onStageChange
O `StandupAgentService.generate()` aceita `onStageChange` callback e o chama nos mesmos pontos que o legacy para manter progress tracking no Discord.

### Sem fallback automatico para legacy
Se todos os modelos falharem via agent, retorna `AllProvidersUnavailableError`. Nao ha fallback silencioso para o legacy — isso mascararia bugs. O operador pode desligar via `USE_PI_AGENT=false`.

## O que NAO Muda

- `ExecuteAdjustStrategy` — continua com `StandupGeneratorService.generateAdjustedStandup()`
- `ExecuteRegenerateStrategy` — continua com `StandupGeneratorService.generateStandup()`
- `StandupPipelineService` — sem alteracao
- Pipeline de coleta (git, board, enrich) — sem alteracao
- Discord buttons/modals — sem alteracao
- `StandupPromptService` — reutilizado pelo `StandupAgentService`
- `LlmProviderRegistry` — sem alteracao na API
- `StandupGeneratorService` — mantido intacto, usado por adjust/regenerate e como fallback manual

## Testes

- **`standup-agent.service.test.ts`** — mock do Agent e registry; validar retry loop (sucesso no 1o modelo, sucesso no 2o apos falha, todos falham); validar extracao do tool result; validar tratamento quando tool nao e chamado; validar rewrite quando content > 2000 chars
- **`submit-standup.tool.test.ts`** — validar schema TypeBox; validar que execute retorna params
- **`pi-ai-model-adapter.test.ts`** — validar mapeamento para cada provider (google, groq, openrouter)

## Dependencias Novas (packages)

```
@mariozechner/pi-agent-core
@mariozechner/pi-ai
@sinclair/typebox   # provavelmente ja e dep transitiva do pi-agent-core
```

## Preparacao para Fase 2

A interface do `StandupAgentService` foi desenhada para facilitar a evolucao:
- Na Fase 2, o `generate()` retorna tambem um `sessionId` opcionalmente
- Um novo metodo `adjust(sessionId, instruction)` reutiliza o agent da sessao
- O `AgentSessionManager` wrapa a criacao/lookup/cleanup de agents
- Nenhuma mudanca na `ExecuteGenerateStrategy` — so o service interno evolui
