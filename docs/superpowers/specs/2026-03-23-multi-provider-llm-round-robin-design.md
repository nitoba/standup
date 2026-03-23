# TAS-30: Multi-Provider LLM com Round-Robin e Backoff Automatico

## Contexto

O standup-generator usa um unico provider (Google Gemini `gemini-3.1-flash-lite-preview`) hardcoded. Se o modelo atinge rate limit ou fica indisponivel, a geracao falha. Este design implementa suporte a multiplos provedores LLM com round-robin por tiers e backoff automatico.

**Nota:** O codebase atual e um monolito NestJS em `apps/api/`, nao o monorepo multi-app descrito no CLAUDE.md. Este spec reflete a estrutura real.

## Decisoes de Design

| Decisao | Escolha | Alternativas descartadas |
|---------|---------|--------------------------|
| Estrategia de prioridade | Round-robin com tiers | Prioridade fixa, round-robin puro |
| Configuracao de modelos | Env var JSON (`LLM_PROVIDERS_CONFIG`) | Hardcoded, tabela no banco |
| Env vars de API keys | Uma por provider | Keys dentro do JSON |
| Logging/observabilidade | Apenas logs estruturados (Winston) | Logs + metricas in-memory |
| SDK providers | Providers oficiais do AI SDK | OpenAI-compatible com baseURL |
| Backward-compat | Sem fallback — corte limpo | Manter `AI_PROVIDER_API_KEY` |

## Env Vars

### API Keys (uma por provider)

```
GOOGLE_API_KEY=...
GROQ_API_KEY=...
OPENROUTER_API_KEY=...
```

`AI_PROVIDER_API_KEY` sera removida e substituida por `GOOGLE_API_KEY`.

**Migracao:** Ao fazer deploy, substituir `AI_PROVIDER_API_KEY` por `GOOGLE_API_KEY` e adicionar as novas keys. O processo falha no startup se as keys necessarias nao estiverem presentes.

### Config JSON (obrigatoria)

```
LLM_PROVIDERS_CONFIG='[
  { "tier": 1, "provider": "google", "model": "gemini-3.1-flash-lite-preview" },
  { "tier": 1, "provider": "groq", "model": "qwen/qwen3-32b" },
  { "tier": 1, "provider": "groq", "model": "llama-3.3-70b-versatile" },
  { "tier": 2, "provider": "openrouter", "model": "nvidia/nemotron-3-super-120b-a12b:free" },
  { "tier": 2, "provider": "openrouter", "model": "qwen/qwen3-next-80b-a3b-instruct:free" },
  { "tier": 2, "provider": "openrouter", "model": "minimax/minimax-m2.5:free" }
]'
```

### Schema Zod

```typescript
const llmModelEntrySchema = z.object({
  tier: z.number().int().positive(),
  provider: z.enum(['google', 'groq', 'openrouter']),
  model: z.string(),
})

const llmProvidersConfigSchema = z.array(llmModelEntrySchema).min(1)
```

Validacao no startup. Processo falha com erro claro se invalido.

## Arquitetura

### LlmProviderRegistry

NestJS `@Injectable()` service que gerencia providers e selecao de modelo. Localizado em `apps/api/src/contexts/standups/worker/standup-generator/llm-provider-registry.ts`.

**Responsabilidades:**
- Parsear `LLM_PROVIDERS_CONFIG` e agrupar modelos por tier
- Instanciar providers do AI SDK (`createGoogleGenerativeAI`, `createGroq`, `createOpenRouter`) com as respectivas API keys
- Manter estado in-memory: ponteiro round-robin por tier + mapa de backoff por modelo
- Expor `getNextModel()` que retorna um `LanguageModel` do AI SDK + metadata (`modelKey`, `provider`, `tier`)

**NestJS DI:** Recebe `WorkerRuntimeConfigService` via construtor para acessar API keys e `LLM_PROVIDERS_CONFIG`. Registrado no `StandupGeneratorModule` como provider.

**Interface publica:**

```typescript
interface ModelSelection {
  model: LanguageModel
  modelKey: string  // ex: "google:gemini-3.1-flash-lite-preview"
  provider: string
  tier: number
}

interface LlmProviderRegistry {
  getNextModel(): ModelSelection
  reportFailure(modelKey: string, error: unknown): void
  reportSuccess(modelKey: string): void
}
```

### Algoritmo de Selecao (`getNextModel`)

1. Comeca pelo tier mais baixo (tier 1)
2. Dentro do tier, avanca o ponteiro round-robin
3. Se o modelo atual esta em backoff (cooldown nao expirou), pula para o proximo
4. Se todos os modelos do tier estao em backoff, desce para o tier seguinte
5. Se todos os tiers estao esgotados, lanca `AllProvidersUnavailableError`

### Backoff Exponencial com Reset por Tempo

Cada modelo mantem estado: `{ failCount, backoffUntil, lastFailureAt }`

- Na falha por rate limit: `backoffUntil = now + 30s * 2^(failCount - 1)`
- Cap maximo de backoff: 5 minutos (evita lockout prolongado)
- Apos 5 minutos sem falha, `failCount` reseta para 0
- `reportSuccess(modelKey)` — reseta `failCount` para 0, limpa `backoffUntil` e atualiza `lastSuccessAt`

**Deteccao de rate limit no AI SDK:**
- `reportFailure(modelKey, error)` verifica se o erro e rate limit checando:
  - `error instanceof APICallError && error.statusCode === 429` (AI SDK `APICallError` de `ai`)
  - Fallback: checar `error.cause?.status === 429` ou `error.message` contendo "rate limit"
- Apenas rate limit aplica backoff. Outros erros (500, timeout) nao penalizam o modelo
- **Importante:** `callWithFallback` usa try/catch direto ao redor da chamada do AI SDK (nao depende do Result pattern) para capturar o `APICallError` raw antes de ser wrappado em `ExternalServiceError`. O fluxo: try → chamada LLM → catch → classifica erro (429 vs outro) → reporta ao registry → se nao 429, retenta

**Concorrencia:** O registry e single-threaded (Bun event loop), entao nao precisa de mutex. O estado in-memory e seguro para acesso concorrente dentro do mesmo processo.

## Integracao com standup-generator.service.ts

### Mudancas

- Remove import de `@ai-sdk/google` e `createGoogleGenerativeAI`
- Recebe `LlmProviderRegistry` via injecao NestJS (construtor)
- Adiciona `callWithFallback` (metodo privado no service) para chamadas LLM com fallback multi-provider
- Mantem `withRetry` existente (renomear para `withSimpleRetry`) — usado por `enrichWithFallback` (Azure DevOps) que nao precisa de multi-provider
- Remove guards de `apiKey` em `generateAdjustedStandup` e `generateWeeklyInsights` — validacao de keys agora e responsabilidade do registry (via Zod no startup)

### Metodos afetados

Tres metodos usam LLM com provider hardcoded e todos precisam ser adaptados:

1. **`generateStandup()`** — geracao principal via `runObjectGeneration`
2. **`generateAdjustedStandup()`** — reescrita/ajuste via `runObjectGeneration`
3. **`generateWeeklyInsights()`** — insights semanais via `generateText` direto

### Refactoring de `runObjectGeneration`

Assinatura atual:
```typescript
private runObjectGeneration(
  provider: ReturnType<typeof createGoogleGenerativeAI>,
  system: string, prompt: string, errorContext: string
): Promise<Result<StandupOutput, ExternalServiceError>>
```

Nova assinatura:
```typescript
private runObjectGeneration(
  model: LanguageModel,
  system: string, prompt: string, errorContext: string
): Promise<Result<StandupOutput, ExternalServiceError>>
```

Internamente, troca `provider('gemini-3.1-flash-lite-preview')` por usar o `model` recebido diretamente.

### `callWithFallback` — metodo privado no service

```typescript
private async callWithFallback<T>(
  fn: (model: LanguageModel) => Promise<T>,
  errorContext: string,
): Promise<Result<T, ExternalServiceError | AllProvidersUnavailableError>>
```

Nota: `fn` lanca excecoes (nao retorna Result) — `callWithFallback` usa try/catch para capturar o `APICallError` raw e classificar o erro antes de wrappa-lo.

**Fluxo:**

```
para cada modelo (via registry.getNextModel()):
  retry(2x com backoff curto: 1s, 2s) → fn(model)
    → sucesso: registry.reportSuccess(key), retorna resultado
    → rate limit (429): registry.reportFailure(key), sai do retry, proximo modelo
    → outro erro transitorio (500, timeout):
        → retry normal (ate 2 tentativas)
        → se esgotou retries: proximo modelo

se todos os modelos falharam → AllProvidersUnavailableError
```

- Cada modelo tem 2 chances de se recuperar de erros transitorios
- Rate limit sai imediatamente para o proximo (nao retenta 429)
- Numero maximo de iteracoes = total de modelos configurados
- Logging em cada tentativa: `{ model, provider, tier, attempt, fallbackFrom? }`

### Adaptacao por metodo

- **`generateStandup`/`generateAdjustedStandup`**: chamam `callWithFallback((model) => this.runObjectGeneration(model, system, prompt, ctx))`
- **`generateWeeklyInsights`**: chama `callWithFallback((model) => this.runTextGeneration(model, system, prompt, ctx))` — extrair a chamada `generateText` para um metodo `runTextGeneration` analogo ao `runObjectGeneration`. Este metodo precisa de refactoring mais amplo: atualmente usa `Result.tryPromise` diretamente, sera reestruturado para usar o pattern de `callWithFallback` com try/catch (mesma abordagem dos outros metodos)

**Validacao de config no startup:** O env schema usa `z.string()` para `LLM_PROVIDERS_CONFIG`. O `LlmProviderRegistry` valida o JSON no construtor com `llmProvidersConfigSchema`. Para garantir fail-fast no startup (e nao no primeiro uso), o registry implementa `OnModuleInit` e executa a validacao/instanciacao dos providers no `onModuleInit()`.

## Novos Erros

**`apps/api/src/shared/domain/errors.ts`:**
- `AllProvidersUnavailableError` — todos os modelos/tiers exaustos, nenhum disponivel

## Dependencias

**Adiciona em apps/api:**
- `@ai-sdk/groq`
- `@ai-sdk/openrouter`

**Mantem:**
- `@ai-sdk/google`
- `ai`

**Remove do env schema:**
- `AI_PROVIDER_API_KEY`

## WorkerRuntimeConfig — mudancas na interface

**Remove:**
- `AI_PROVIDER_API_KEY: string`

**Adiciona:**
- `GOOGLE_API_KEY: string`
- `GROQ_API_KEY: string`
- `OPENROUTER_API_KEY: string`
- `LLM_PROVIDERS_CONFIG: string` (JSON string, parseado pelo registry)

## Arquivos

### Novos

- `apps/api/src/contexts/standups/worker/standup-generator/llm-provider-registry.ts` — registry `@Injectable()`
- `apps/api/src/contexts/standups/worker/standup-generator/llm-provider-registry.test.ts` — testes

### Modificados

- `apps/api/src/contexts/standups/worker/standup-generator/standup-generator.service.ts` — troca provider hardcoded por registry, adapta 3 metodos LLM, refatora `runObjectGeneration`
- `apps/api/src/contexts/standups/worker/standup-generator/standup-generator.module.ts` — registra `LlmProviderRegistry` como provider
- `apps/api/src/shared/domain/errors.ts` — adiciona `AllProvidersUnavailableError`
- `apps/api/src/platform/env/env.schema.ts` — novas env vars, remove `AI_PROVIDER_API_KEY`
- `apps/api/src/platform/env/env.service.ts` — expor novas vars
- `apps/api/src/contexts/standups/worker/worker-runtime-config.service.ts` — atualiza interface e config getter
- `apps/api/package.json` — novas dependencias
- `.env` / deploy configs — novas vars

## Testes

### LlmProviderRegistry

- Retorna modelo do tier 1 por padrao
- Round-robin avanca entre modelos do mesmo tier
- Modelo em backoff e pulado
- Quando tier 1 todo em backoff, desce pro tier 2
- Backoff exponencial: 30s → 60s → 120s (cap em 5 min)
- Reset do failCount apos 5 min sem falha
- `reportSuccess` reseta o timer de staleness
- Rate limit (429 via `APICallError`) aplica backoff, outros erros nao
- `AllProvidersUnavailableError` quando todos indisponiveis
- Validacao Zod falha com config invalida (tier negativo, provider desconhecido, array vazio)

### Fluxo Integrado (standup-generator)

- Sucesso no primeiro modelo — sem fallback
- Primeiro modelo da 429 → fallback pro segundo modelo com sucesso
- Primeiro modelo da 500 → retry 2x → falha → fallback pro segundo
- Todos os modelos falham → `AllProvidersUnavailableError`
- `generateWeeklyInsights` usa o mesmo fallback (via `runTextGeneration`)
- `generateAdjustedStandup` usa o mesmo fallback
- Logging correto com `{ model, provider, tier, attempt, fallbackFrom? }`

### Abordagem

- Mocks dos providers do AI SDK (sem chamadas reais)
- Fake timers do Vitest para testar backoff e reset temporal
