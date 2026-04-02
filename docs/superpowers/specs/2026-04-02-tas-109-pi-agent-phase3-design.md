# TAS-109: PI Agent Integration — Fase 3 (Streaming)

## Contexto

A Fase 2 adicionou sessoes multi-turn para ajustes. A geracao e ajuste funcionam, mas o usuario so ve o resultado final — durante 10-15s de geracao, a UI mostra apenas steps genericos ("Gerando standup..."). A Fase 3 adiciona streaming para feedback em tempo real: no Discord o embed e editado progressivamente com o conteudo sendo construido; na web os steps de progress ficam mais descritivos.

**Issue:** [TAS-109](https://linear.app/nito/issue/TAS-109)
**Pre-requisitos:** Fase 1 e Fase 2 completas

## Decisoes de Design

| Decisao | Escolha | Justificativa |
|---------|---------|---------------|
| Discord | Streaming real — embed editado a cada 2s | Feedback visual enquanto gera |
| Web | Progress enriquecido via SSE existente | Zero mudanca de UI, steps mais descritivos |
| Callback | `onContentDelta` no input (mesmo padrao do `onStageChange`) | Encapsula interacao com PI Agent no service |
| Propagacao | Mesmo pipeline de progress com `partialContent` | Reutiliza toda infra existente (EventBus → SSE) |
| Batch Discord | Intervalo fixo 2s | Simples, previsivel, ~7 edits por geracao |
| Embed | Placeholder → edits parciais → embed final com botoes | Duas mensagens: preview temporario + final com botoes |
| Referencia de mensagem | `Map<runId, Message>` no listener Discord | Contexto Discord fica no bot, nao no API |

## Componentes

### 1. Alteracao no `StandupAgentService`

**Localizacao:** `apps/api/src/contexts/standups/worker/standup-agent/standup-agent.service.ts`

**Mudancas:**
- `AgentGenerateInput` e `AgentAdjustInput` ganham `onContentDelta?: (partialContent: string) => void`
- Dentro de `generate()` e `adjust()`, antes de `agent.prompt()`:
  - Registra `agent.subscribe(callback)` que escuta eventos
  - Filtra por tool call deltas do `submit_standup`
  - Acumula conteudo parcial dos arguments e chama `onContentDelta(accumulated)`
- O subscribe e removido (via unsubscribe) apos o prompt terminar

**Filtragem de deltas do PI Agent:**

O PI Agent emite eventos via `agent.subscribe()`. Os eventos relevantes sao:
- `tool_execution_start` — inicio do tool call (nome, id)
- `tool_execution_update` — delta dos arguments sendo construidos
- `message_update` — delta do texto do assistant (pode incluir tool call arguments)

O service deve filtrar apenas deltas que pertencem ao tool `submit_standup` e ao campo `content` dos arguments. Texto livre do assistant (thinking) e ignorado.

> **Nota para implementacao:** A estrutura exata dos eventos depende do PI Agent Core. Verificar os tipos de `AgentEvent` em `@mariozechner/pi-agent-core` antes de implementar. O campo relevante sera algo como `event.assistantMessageEvent.delta` para text ou `event.toolCallEvent.argumentsDelta` para tool args.

### 2. Alteracao em `StrategyProgressUpdate` e eventos

**Localizacao:** `apps/api/src/contexts/standups/worker/standup/types.ts`

**Mudancas:**
- Novo step `streaming_content` adicionado a `StrategyProgressStep`
- Novo campo `partialContent?: string` em `StrategyProgressUpdate`

```typescript
export type StrategyProgressStep =
  | 'collecting_git'
  | 'collecting_board'
  | 'enriching_data'
  | 'generating_standup'
  | 'streaming_content'       // NEW

export interface StrategyProgressUpdate {
  step: StrategyProgressStep
  message: string
  partialContent?: string     // NEW — conteudo parcial durante streaming
}
```

**Localizacao:** `apps/api/src/platform/events/standup-events.ts`

**Mudancas:**
- `StandupProgressEvent` ganha `partialContent?: string`
- `StandupProgressStep` ganha `'streaming_content'`

### 3. Alteracao nas strategies

**`ExecuteGenerateStrategy`** e **`ExecuteAdjustStrategy`:**
- Passam `onContentDelta` ao `StandupAgentService` que propaga via `reportProgress`:

```typescript
onContentDelta: (partialContent) => {
  this.reportStage(reportProgress, 'streaming_content', 'Gerando conteudo...', partialContent)
}
```

O `reportStage` da `StandupStrategyBase` precisa aceitar o campo `partialContent` opcional.

### 4. Propagacao via EventBus → SSE (zero nova infra)

O `StandupProgressEvent` ja flui pelo caminho:
```
reportProgress → pipeline progressReporter → EventBus.emit('standup.progress') → StandupSseListener → SSE
```

Adicionar `partialContent` ao payload e suficiente. O `StandupSseListener` ja propaga todos os campos do evento. O frontend Angular recebe o evento com `partialContent` mas nao precisa de mudanca de UI — o campo `message` dos steps fica mais descritivo.

### 5. Novo: `DiscordStreamingListener`

**Localizacao:** `apps/api/src/interfaces/discord/listeners/discord-streaming.listener.ts`

**Responsabilidade:** Escuta eventos de progress e gerencia o streaming de embeds no Discord.

**Interface:**

```typescript
@Injectable()
class DiscordStreamingListener implements OnModuleDestroy {
  // Map<runId, { message: Message, lastEditAt: number, pendingContent: string }>
  private readonly activeStreams = new Map<string, ActiveStream>()

  @OnEvent(STANDUP_PROGRESS_EVENT)
  async handleProgress(event: StandupProgressEvent): void

  onModuleDestroy(): void  // cleanup timers
}
```

**Comportamento por step:**

| Step | Acao |
|------|------|
| `queued` (mode generate/adjust) | Envia embed placeholder na DM: "⏳ Gerando standup..." + cria entrada no Map |
| `streaming_content` | Acumula `partialContent`. Se passaram >= 2s desde ultimo edit: edita mensagem com conteudo parcial |
| `completed` | Edita mensagem para "✅ Standup gerado! Confira a mensagem abaixo." + remove do Map |
| `no_activity` | Edita mensagem para "🔍 Nenhuma atividade encontrada." + remove do Map |
| failed (via `STANDUP_FAILED_EVENT`) | Edita mensagem para "❌ Falha: {motivo}" + remove do Map |

**Embed placeholder:**

```typescript
new EmbedBuilder()
  .setTitle('⏳ Gerando standup...')
  .setDescription('Aguarde enquanto o standup é gerado.')
  .setColor(0x3498DB)  // azul
  .setFooter({ text: 'PI Agent' })
  .setTimestamp()
```

**Embed parcial (durante streaming):**

```typescript
new EmbedBuilder()
  .setTitle('⏳ Gerando standup...')
  .setDescription(partialContent.slice(0, 4096))  // Discord limit
  .setColor(0x3498DB)
  .setFooter({ text: `PI Agent • ${partialContent.length} chars` })
  .setTimestamp()
```

**Embed completo (apos completed):**

```typescript
new EmbedBuilder()
  .setTitle('✅ Standup gerado!')
  .setDescription('Confira a mensagem abaixo para revisar e aprovar.')
  .setColor(0x2ECC71)  // verde
  .setTimestamp()
```

A mensagem final com botoes (Aprovar/Rejeitar/etc) e enviada pelo flow normal de `notifyStandupReady` — e uma mensagem separada.

**Dependencias:**
- `DiscordMessagesService` (para acessar o client Discord e enviar DMs)
- `UserRepository` (para resolver discordUserId → canal DM)
- Registrado no `DiscordModule`

### 6. Alteracao no `StandupStrategyBase`

**Localizacao:** `apps/api/src/contexts/standups/worker/standup/strategies/standup-strategy.base.ts`

**Mudanca:** O metodo `reportStage` ganha parametro opcional `partialContent`:

```typescript
protected async reportStage(
  reporter: StrategyProgressReporter | undefined,
  step: StrategyProgressStep,
  message: string,
  partialContent?: string,
): Promise<void> {
  await reporter?.({ step, message, partialContent })
}
```

### 7. Alteracao no `StandupPipelineService`

**Localizacao:** `apps/api/src/contexts/standups/worker/standup/standup-pipeline.service.ts`

**Mudanca:** O `createStrategyProgressReporter` ja propaga `StrategyProgressUpdate` para o `EventBus`. O campo `partialContent` e adicionado ao evento emitido:

Na funcao `emitProgress`, adicionar `partialContent` ao payload:

```typescript
private async emitProgress(event: {
  // ... campos existentes ...
  partialContent?: string  // NEW
}) {
  this.notifications.emitStandupProgress({
    // ... campos existentes ...
    ...(event.partialContent ? { partialContent: event.partialContent } : {}),
  })
}
```

E no `createStrategyProgressReporter`:

```typescript
return async ({ step, message, partialContent }: StrategyProgressUpdate) =>
  this.emitProgress({
    userId, runId, date, mode, step, message,
    ...(partialContent ? { partialContent } : {}),
  })
```

## Data Flows

### Streaming no Discord

```
ExecuteGenerateStrategy
  |-- standupAgent.generate({ onContentDelta, onStageChange })
  |     |-- agent.subscribe() → filtra tool call deltas de submit_standup
  |     |-- onContentDelta('## Standup\n- ite...')
  |          |-- reportProgress({ step: 'streaming_content', partialContent: '...' })
  |               |-- EventBus.emit('standup.progress', { ..., partialContent })
  |                    |-- DiscordStreamingListener:
  |                    |     |-- acumula content
  |                    |     |-- a cada 2s: message.edit({ embeds: [partialEmbed] })
  |                    |-- SSE listener:
  |                          |-- emite standup_progress (web recebe step mais descritivo)
  |
  |-- pipeline salva standup → notifyStandupReady
  |     |-- DiscordStreamingListener recebe 'completed':
  |     |     |-- edita mensagem para "✅ Gerado!"
  |     |-- Bot envia DM final com embed azul + botoes (flow existente)
```

### Progress enriquecido na Web

```
ExecuteGenerateStrategy
  |-- standupAgent.generate({ onStageChange })
  |     |-- onStageChange('generating_standup')
  |          |-- reportProgress({ step: 'generating_standup', message: 'Gerando texto do standup (PI Agent)' })
  |               |-- EventBus → SSE → Angular
  |                    |-- Frontend mostra step no progress component (sem mudanca de UI)
```

## Error Handling

### Agent nao emite tool call deltas
Alguns modelos geram o tool call de uma vez. `onContentDelta` nunca e chamado — o flow degrada para o comportamento atual. O embed placeholder fica com "⏳ Gerando..." ate o `completed`, quando e atualizado para "✅ Gerado!".

### Geracao falha apos placeholder enviado
O listener Discord escuta `STANDUP_FAILED_EVENT` e edita a mensagem para "❌ Falha na geracao: {motivo}". A mensagem final com botoes nunca e enviada.

### Rate limit do Discord em edits
Intervalo de 2s garante ~7 edits por geracao de 15s. Bem abaixo do limite (~5/s). Se edit falha, proximo tick tenta com conteudo mais atualizado.

### DM nao disponivel
Mesmo comportamento de hoje — log warning. Standup salvo no DB, visivel na web.

### Cleanup do Map de mensagens
Referencia removida em `completed` ou `failed`. Safety net: entradas com mais de 5min sao removidas por cleanup periodico.

## O que NAO Muda

- `AgentSessionManager` — sem alteracao
- Frontend Angular — sem alteracao de componentes (steps mais descritivos chegam via SSE existente)
- `StandupSseBusService` / `StandupSseListener` — sem alteracao (ja propagam tudo)
- Botoes Discord (Aprovar/Rejeitar/etc) — sem alteracao
- `notifyStandupReady` flow — sem alteracao (mensagem final com botoes e separada)
- `buildSeedMessages` — sem alteracao

## Testes

- **`standup-agent.service.spec.ts`** (update) — testar que `onContentDelta` e chamado durante generate/adjust, testar que subscribe e removido apos prompt
- **`discord-streaming.listener.spec.ts`** (novo) — testar: placeholder enviado no `queued`, edit no `streaming_content`, batch de 2s respeitado, cleanup no `completed`/`failed`
- **`execute-generate-strategy.spec.ts`** (update) — testar que `onContentDelta` e passado ao agent service
- **`execute-adjust-strategy.spec.ts`** (update) — idem

## Preparacao para Fase 4

A infra de streaming habilita:
- Streaming para web com novo componente (se decidirmos no futuro)
- Indicadores de progresso mais ricos (ex: token count em tempo real)
- Abort/cancel de geracao em andamento (via `agent.abort()`)
