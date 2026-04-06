# Migrar pi-agent-core para Mastra Agents

**Data:** 2026-04-05
**Status:** Aprovado
**Escopo:** Substituir `@mariozechner/pi-agent-core` e `@mariozechner/pi-ai` por `@mastra/core`, `@mastra/memory` e `@mastra/libsql`. Eliminar tambem o path de fallback do AI SDK (`StandupGeneratorService`), consolidando toda a geracao de standup no Mastra.

## Motivacao

O pi-agent-core funciona mas tem limitacoes: sem memoria persistente, sem suporte nativo a MCP, sem structured output, e a comunidade/ecossistema e pequeno. O Mastra oferece agents com memoria, tools, MCP, structured output, model router com fallback, e um ecossistema ativo — funcionalidades que o projeto pode aproveitar agora e no futuro.

## Decisoes de design

| Aspecto | Decisao | Justificativa |
|---|---|---|
| Escopo | Consolidar tudo no Mastra (eliminar pi-agent-core + AI SDK fallback) | Um unico motor simplifica manutencao |
| Memory | `@mastra/memory` com threads por standup | Substitui `AgentSessionManager` (Map com TTL), persiste historico real |
| Storage | Mesmo banco (`DATABASE_URL`), `@mastra/libsql` | Simplicidade operacional, sem segundo banco |
| Selecao de modelo | `LlmProviderRegistry` seleciona, Mastra executa | Registry ja maduro com backoff/fallback inteligente |
| MCP | Manter coleta deterministica, sem MCP no agent | Mais previsivel, menos tokens, ja funciona |
| Output | Structured output Zod (substitui tool `submit_standup`) | Mastra suporta nativamente, elimina extracao de JSON parcial |
| Streaming | `agent.stream()` + `textStream`, fallback para `agent.generate()` | Streaming nativo sem regex de JSON parcial |
| Google provider | Env var `GOOGLE_GENERATIVE_AI_API_KEY` + `providerOptions.google.structuredOutputs` | Requisito do model router do Mastra |

## Pacotes

**Adicionar:**

```
@mastra/core        — Agent, createTool, Mastra instance
@mastra/memory      — Memory (threads, message history)
@mastra/libsql      — LibSQLStore (storage backend)
```

**Remover:**

```
@mariozechner/pi-agent-core
@mariozechner/pi-ai
```

## Integracao com NestJS

O Mastra funciona como biblioteca pura. A integracao e via NestJS provider factory:

```ts
// mastra.provider.ts — provider useFactory
// Recebe EnvService via inject
// Cria LibSQLStore com DATABASE_URL
// Cria Memory com lastMessages: 20
// Cria instancia Mastra com agent registrado
// Exporta como singleton
```

Ciclo de vida: instancia criada uma vez no bootstrap do modulo, injetada onde necessario.

## Definicao do Agent

O agent tem instructions e model dinamicos (override por chamada):

```ts
// standup-agent.def.ts
const standupAgent = new Agent({
  id: 'standup-agent',
  name: 'Standup Agent',
  instructions: '', // override dinamico
  model: '',        // override dinamico via LlmProviderRegistry
  memory: new Memory({
    options: {
      lastMessages: 20,
      observationalMemory: false, // conversas curtas, nao precisa por agora
    },
  }),
})
```

Na chamada:

```ts
const modelString = llmProviderRegistry.selectModel() // ex: "google/gemini-2.5-pro"

const response = await agent.generate(userMessage, {
  instructions: systemPrompt,      // do StandupPromptService
  model: modelString,              // do LlmProviderRegistry
  output: standupOutputSchema,     // Zod schema
  providerOptions: {
    google: { structuredOutputs: true },
  },
  memory: {
    resource: `user-${userId}`,
    thread: `standup-${standupId}`,
  },
})
```

## Structured output

Substitui a tool `submit_standup`. Schema Zod:

```ts
// standup-output.schema.ts
import { z } from 'zod'

export const standupOutputSchema = z.object({
  content: z.string().describe('Standup formatado em portugues, max 2000 chars'),
  summary: z.string().describe('Resumo de 1 linha do standup'),
})
```

O agent retorna `response.object` com `{ content, summary }` validado.

## Memory e threads

### Modelo de threads

```
resource: "user-{userId}"        — agrupa threads do usuario
thread:   "standup-{standupId}"  — uma thread por standup
thread:   "digest-{digestId}"    — uma thread por digest
```

### Cenarios

| Operacao | Thread | Comportamento |
|---|---|---|
| `generate` | Nova thread `standup-{newId}` | Agent sem historico, conversa limpa |
| `adjust` | Reutiliza `standup-{standupId}` | Memory recupera mensagens anteriores automaticamente |
| `regenerate` | Mesma `standup-{standupId}` | Agent ve contexto anterior e gera de novo |
| `weeklyInsights` | `digest-{digestId}` | Isolada, sem historico |

### O que isso elimina

- `AgentSessionManager` (Map com TTL 30min + cleanup timer) — desnecessario
- `buildSeedMessages` (historico artificial fabricado) — desnecessario, historico real persistido

## Streaming e SSE

### Generate (com streaming)

```ts
const stream = await agent.stream(userMessage, {
  instructions: systemPrompt,
  model: modelString,
  output: standupOutputSchema,
  memory: { resource: `user-${userId}`, thread: `standup-${standupId}` },
})

for await (const chunk of stream.textStream) {
  onContentDelta(chunk) // alimenta SSE via WorkerEventPublisherService
}

const result = await stream.object // { content, summary }
```

### Fallback se provider nao suportar streaming de structured output

```ts
async generateStandup(params) {
  try {
    const stream = await agent.stream(userMessage, streamOptions)
    let hasChunks = false
    for await (const chunk of stream.textStream) {
      hasChunks = true
      onContentDelta(chunk)
    }
    if (hasChunks) return await stream.object
  } catch { /* fallback */ }

  const response = await agent.generate(userMessage, generateOptions)
  return response.object
}
```

### Adjust e weeklyInsights

Sem streaming — usam `agent.generate()` diretamente.

## Env vars

Mapeamento de env vars atual → Mastra:

| Provider | Env var atual | Env var Mastra | Acao |
|---|---|---|---|
| Google | `GOOGLE_API_KEY` | `GOOGLE_GENERATIVE_AI_API_KEY` | Renomear no schema e .env |
| Groq | `GROQ_API_KEY` | `GROQ_API_KEY` | Sem mudanca |
| OpenRouter | `OPENROUTER_API_KEY` | `OPENROUTER_API_KEY` | Sem mudanca |

Formato do model string no Mastra:

| Provider | Formato | Exemplo |
|---|---|---|
| Google | `google/{model}` | `google/gemini-2.5-pro` |
| Groq | `groq/{model}` | `groq/llama-3.3-70b-versatile` |
| OpenRouter | `openrouter/{provider}/{model}` | `openrouter/google/gemini-2.5-pro` |

**Nota:** OpenRouter e um gateway no Mastra, nao um provider. O model string tem 3 segmentos (`openrouter/provider/model`). O `LlmProviderRegistry.selectModel()` precisara gerar o formato correto para cada tipo.

## Mapa de arquivos

### Eliminados (10)

| Arquivo | Motivo |
|---|---|
| `standup-agent/agent-session-manager.ts` | Substituido pelo Memory |
| `standup-agent/agent-session-manager.spec.ts` | Teste |
| `standup-agent/build-seed-messages.ts` | Desnecessario com Memory |
| `standup-agent/build-seed-messages.spec.ts` | Teste |
| `standup-agent/pi-ai-model-adapter.ts` | Model router do Mastra resolve |
| `standup-agent/pi-ai-model-adapter.spec.ts` | Teste |
| `standup-agent/submit-standup.tool.ts` | Substituido por structured output |
| `standup-agent/submit-standup.tool.spec.ts` | Teste |
| `standup-generator/standup-generator.service.ts` | Consolidado no Mastra |
| `standup-generator/standup-generator.service.spec.ts` | Teste |

### Novos (3)

| Arquivo | Responsabilidade |
|---|---|
| `standup-agent/mastra/mastra.provider.ts` | NestJS provider factory: `Mastra` instance com `LibSQLStore`, `Memory`, agent |
| `standup-agent/mastra/standup-agent.def.ts` | Definicao do Agent Mastra |
| `standup-agent/mastra/standup-output.schema.ts` | Schema Zod structured output |

### Modificados (~10)

| Arquivo | Mudanca |
|---|---|
| `standup-agent/standup-agent.service.ts` | Reescrita: pi-agent-core → Mastra agent com Memory + structured output |
| `standup-agent/standup-agent.service.spec.ts` | Reescrita dos testes |
| `standup-agent/standup-agent.module.ts` | Importar Mastra provider, remover pi-agent-core |
| `standup/strategies/execute-generate-strategy.ts` | Remover `agent` de `GeneratedContent` |
| `standup/strategies/execute-generate-strategy.spec.ts` | Adaptar testes |
| `standup/strategies/execute-adjust-strategy.ts` | Remover logica de session lookup |
| `standup/strategies/execute-adjust-strategy.spec.ts` | Adaptar testes |
| `standup/standup-pipeline.service.ts` | Remover criacao de session pos-save |
| `standup/types.ts` | Remover types do pi-agent-core |
| `platform/env/env.schema.ts` | Adicionar `GOOGLE_GENERATIVE_AI_API_KEY` |
| `apps/api/package.json` | Adicionar @mastra/*, remover @mariozechner/* |

### Intocados

- `StandupPromptService` — continua gerando prompts
- `LlmProviderRegistry` — continua selecionando modelo com fallback/backoff
- `WorkerEventPublisherService` — continua publicando eventos
- Pipeline de coleta (git-collector, azure-devops)
- Discord handlers
- Frontend (consome SSE da mesma forma)

## Contrato do StandupAgentService (interface publica)

A interface publica do service nao muda — os consumers continuam chamando os mesmos metodos:

```ts
generate(params): Promise<{ content: string; summary: string }>
  // + emite deltas via onContentDelta callback

adjust(params): Promise<{ content: string; summary: string }>

generateWeeklyInsights(params): Promise<string>
```

A mudanca e interna ao service.

## Riscos e mitigacoes

| Risco | Mitigacao |
|---|---|
| Mastra Memory cria tabelas no banco sem controle do Drizzle | Tabelas autocontidas, nao conflitam com schema existente. Documentar quais tabelas o Mastra cria |
| Streaming de structured output pode nao funcionar em todos os providers | Fallback para `.generate()` sincrono implementado |
| Env var `GOOGLE_GENERATIVE_AI_API_KEY` difere do `GOOGLE_API_KEY` atual | Atualizar env schema e .env, alias se necessario |
| `LlmProviderRegistry` retorna formato interno que pode nao mapear 1:1 para model router strings do Mastra | Adaptar `selectModel()` para retornar formato `"provider/model-name"` |
| Testes que mockam pi-agent-core precisam ser reescritos | Reescrita completa dos specs do standup-agent |
