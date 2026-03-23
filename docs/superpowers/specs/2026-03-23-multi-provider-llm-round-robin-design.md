# TAS-30: Multi-Provider LLM com Round-Robin e Backoff Automatico

## Contexto

O standup-generator usa um unico provider (Google Gemini `gemini-3.1-flash-lite-preview`) hardcoded. Se o modelo atinge rate limit ou fica indisponivel, a geracao falha. Este design implementa suporte a multiplos provedores LLM com round-robin por tiers e backoff automatico.

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

Service que gerencia providers e selecao de modelo. Localizado em `apps/api/src/contexts/standups/worker/standup-generator/llm-provider-registry.ts`.

**Responsabilidades:**
- Parsear `LLM_PROVIDERS_CONFIG` e agrupar modelos por tier
- Instanciar providers do AI SDK (`createGoogleGenerativeAI`, `createGroq`, `createOpenRouter`) com as respectivas API keys
- Manter estado in-memory: ponteiro round-robin por tier + mapa de backoff por modelo
- Expor `getNextModel()` que retorna o proximo modelo disponivel

**Interface publica:**

```typescript
interface LlmProviderRegistry {
  getNextModel(): LanguageModel
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
- Apos 5 minutos sem falha, `failCount` reseta para 0
- `reportFailure(modelKey, error)` — so aplica backoff para rate limit (HTTP 429). Outros erros nao penalizam o modelo no backoff
- `reportSuccess(modelKey)` — reseta o timer de staleness

## Integracao com standup-generator.service.ts

### Mudancas

- Remove import de `@ai-sdk/google` e `createGoogleGenerativeAI`
- Recebe `LlmProviderRegistry` como dependencia (injecao via construtor)
- Substitui `withRetry` por `callWithFallback`

### Fluxo de Chamada LLM

```
para cada modelo (via registry.getNextModel()):
  retry(2x com backoff) → chamada LLM
    → sucesso: registry.reportSuccess(key), retorna resultado
    → rate limit (429): registry.reportFailure(key), sai do retry, proximo modelo
    → outro erro transitorio (500, timeout):
        → retry normal (ate 2 tentativas com backoff curto: 1s, 2s)
        → se esgotou retries: proximo modelo

se todos os modelos falharam → AllProvidersUnavailableError
```

- Cada modelo tem 2 chances de se recuperar de erros transitorios
- Rate limit sai imediatamente para o proximo (nao retenta 429)
- Numero maximo de tentativas = total de modelos configurados
- Mesma logica para `generateStandup()` e `generateWeeklyInsights()`
- Logging em cada tentativa: `{ model, provider, tier, attempt, fallbackFrom? }`

## Novos Erros

**packages/domain:**
- `AllProvidersUnavailableError` — todos os modelos/tiers exaustos

## Dependencias

**Adiciona em apps/api:**
- `@ai-sdk/groq`
- `@ai-sdk/openrouter`

**Mantem:**
- `@ai-sdk/google`
- `ai`

**Remove do env schema:**
- `AI_PROVIDER_API_KEY`

## Arquivos

### Novos

- `apps/api/src/contexts/standups/worker/standup-generator/llm-provider-registry.ts`
- `apps/api/src/contexts/standups/worker/standup-generator/llm-provider-registry.test.ts`

### Modificados

- `apps/api/src/contexts/standups/worker/standup-generator/standup-generator.service.ts` — troca provider hardcoded por registry
- `apps/api/src/platform/env/env.schema.ts` — novas env vars, remove `AI_PROVIDER_API_KEY`
- `apps/api/src/platform/env/env.service.ts` — expor novas vars
- `apps/api/src/contexts/standups/worker/worker-runtime-config.service.ts` — passar config ao registry
- `apps/api/package.json` — novas dependencias
- `.env` / deploy configs — novas vars

## Testes

### LlmProviderRegistry

- Retorna modelo do tier 1 por padrao
- Round-robin avanca entre modelos do mesmo tier
- Modelo em backoff e pulado
- Quando tier 1 todo em backoff, desce pro tier 2
- Backoff exponencial: 30s → 60s → 120s
- Reset do failCount apos 5 min sem falha
- `reportSuccess` reseta o timer de staleness
- Rate limit (429) aplica backoff, outros erros nao
- `AllProvidersUnavailableError` quando todos indisponiveis
- Validacao Zod falha com config invalida (tier negativo, provider desconhecido, array vazio)

### Fluxo Integrado (standup-generator)

- Sucesso no primeiro modelo — sem fallback
- Primeiro modelo da 429 → fallback pro segundo modelo com sucesso
- Primeiro modelo da 500 → retry 2x → falha → fallback pro segundo
- Todos os modelos falham → `AllProvidersUnavailableError`
- Logging correto com `{ model, provider, tier, attempt, fallbackFrom? }`

### Abordagem

- Mocks dos providers do AI SDK (sem chamadas reais)
- Fake timers do Vitest para testar backoff e reset temporal
