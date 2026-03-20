# TAS-18: Botao "Enviar para Discord" via Automacao Headless Browser

## Contexto

O fluxo atual de publicacao do standup aprovado no Discord e manual: o usuario copia o texto e cola no canal. Esta feature adiciona um botao na interface web que dispara uma automacao server-side para enviar o texto diretamente ao Discord via headless browser.

O projeto [automate](https://github.com/nitoba/automate) ja roda no macOS host como servidor HTTP (Bun.serve) e expoe `POST /send` com autenticacao HMAC-SHA256. A aplicacao standup roda em container Docker (Colima), comunicando-se via `host.docker.internal`.

## Decisoes de Design

| Decisao | Escolha | Motivo |
|---------|---------|--------|
| Localizacao do botao | Apenas na pagina de detalhe | Spec da issue; dashboard Copy e suficiente para listagem |
| Reenvio | Permitido com confirmacao via dialog | Usuario pode precisar reenviar se mensagem foi deletada |
| Transicao de estado | Nao transiciona para `published` | Envio via automacao != publicacao oficial via bot |
| Timeout | 60s (configuravel) | Headless browser pode ser lento |
| Rastreamento de envio | Campo `sentToDiscordAt` na tabela `standups` | Persistente entre sessoes, permite mostrar confirmacao de reenvio |
| Abordagem | Service dedicado no modulo Standups | Segue padrao existente, sem over-engineering |

## 1. Database

### Nova coluna

Adicionar `sent_to_discord_at INTEGER` (nullable) na tabela `standups` via Drizzle migration.

**Schema Drizzle**:
```ts
sentToDiscordAt: integer('sent_to_discord_at'),
```

**Impacto nos tipos**: `StandupRecord` ganha `sentToDiscordAt: number | null`.

### Novo metodo no StandupRepository

```ts
async updateSentToDiscordAt(id: string): Result<StandupRecord, NotFoundError | DbError>
```

Seta `sentToDiscordAt` com o timestamp atual (Date.now()).

## 2. Environment

Novas env vars no `env.schema.ts` da API:

```ts
DISCORD_AUTOMATION_URL: z.string().url().optional(),          // ex: http://host.docker.internal:4000
DISCORD_AUTOMATION_CHANNEL_URL: z.string().url().optional(),   // ex: https://discord.com/channels/xxx/yyy
DISCORD_AUTOMATION_WEBHOOK_SECRET: z.string().optional(),      // HMAC secret compartilhado
DISCORD_SEND_TIMEOUT_MS: z.coerce.number().default(60000),     // timeout 60s
```

Todas opcionais — a feature so funciona se as 3 primeiras estiverem configuradas. O service valida isso antes de tentar enviar.

Expor via `EnvService` num getter `automation` (ou no grupo `discord` existente).

## 3. Backend

### HMAC Helper

Funcao pura extraida para testabilidade:

```ts
// sign-webhook-payload.ts
function signWebhookPayload(secret: string, body: string): { header: string; timestamp: string }
```

- Gera timestamp com `Date.now().toString()`
- Payload assinado: `${timestamp}.${body}`
- HMAC-SHA256 com o secret, output hex
- Header format: `${timestamp},${hmacHex}`

### SendToDiscordService

Injetado no modulo Standups. Dependencias: `StandupRepository`, `EnvService`, `LoggerFactory`.

**Fluxo**:
1. Busca standup por `id` (scoped por userId via `findByIdForUser`)
2. Valida estado: so permite `approved` ou `published` — senao retorna `InvalidStateTransitionError`
3. Verifica se env vars de automacao estao configuradas — senao retorna `ExternalServiceError` com mensagem clara
4. Monta payload `{ channelUrl: DISCORD_AUTOMATION_CHANNEL_URL, message: standup.content }`
5. Assina com `signWebhookPayload(secret, JSON.stringify(payload))`
6. Faz `fetch` para `${DISCORD_AUTOMATION_URL}/send` com:
   - Headers: `Content-Type: application/json`, `x-webhook-signature: header`
   - Timeout: `DISCORD_SEND_TIMEOUT_MS` (60s default) via `AbortSignal.timeout()`
7. Valida resposta: `200 { ok: true }` = sucesso, qualquer outro = erro
8. Em sucesso: chama `repository.updateSentToDiscordAt(id)`
9. Retorna `Result<StandupRecord, NotFoundError | InvalidStateTransitionError | ExternalServiceError>`

### SendToDiscordController

```
POST /standups/:id/send-to-discord
```

- Autenticacao: session (mesmo padrao dos outros endpoints)
- Param: `id` (string, path param)
- Resposta sucesso: `200 { data: StandupRecord }`
- Erros:
  - `404` — standup nao encontrado
  - `409` — estado invalido (nao e approved/published)
  - `503` — automate offline, timeout, ou env vars nao configuradas

Registrado no `StandupsModule`.

## 4. Frontend

### API Client (Orval)

Apos adicionar o endpoint no backend (OpenAPI spec), rodar `orval` para gerar:

```ts
sendToDiscord(http: HttpClient, id: string, signal?: AbortSignal): Promise<SendToDiscordResponse>
```

### StandupService

Nova mutation:

```ts
sendToDiscordMutation = injectMutation(() => ({
  mutationFn: async ({ id }: { id: string }) => sendToDiscord(this.http, id),
  onSuccess: () => {
    this.queryClient.invalidateQueries({ queryKey: getGetStandupByIdQueryKey(this.selectedStandupId()!) });
    toast.success('Standup enviado para o Discord');
  },
  onError: (error) => {
    toast.error('Falha ao enviar para o Discord');
  },
}));
```

Metodo publico:

```ts
sendToDiscord(id: string): void {
  this.sendToDiscordMutation.mutate({ id });
}
```

### Standup Detail Page

**Novo botao** ao lado dos botoes existentes:

- Visivel quando `status === 'approved' || status === 'published'`
- Computed signal `wasSentToDiscord = computed(() => !!standup.sentToDiscordAt)`
- Icone: `send` (Lucide)
- `zLoading` vinculado ao `sendToDiscordMutation.isPending()`

**Comportamento ao clicar**:
- Se `wasSentToDiscord()` e `true`: abre `ZardDialogComponent` com mensagem "Ja enviado em DD/MM as HH:MM. Enviar novamente?" com botoes Cancelar/Enviar
- Se `wasSentToDiscord()` e `false`: chama `sendToDiscord(id)` diretamente

**Label dinamico**:
- Primeiro envio: "Enviar para Discord"
- Reenvio: "Reenviar para Discord"

## 5. Testes

### Backend

**`sign-webhook-payload.test.ts`**:
- Gera assinatura HMAC-SHA256 correta
- Header tem formato `timestamp,hex`
- Timestamp e numerico

**`send-to-discord.service.spec.ts`**:
- Standup nao encontrado → `NotFoundError`
- Estado invalido (draft, pending_review, rejected) → `InvalidStateTransitionError`
- Env vars nao configuradas → `ExternalServiceError`
- Automate offline/timeout → `ExternalServiceError`
- Automate retorna erro (401, 500) → `ExternalServiceError`
- Sucesso → atualiza `sentToDiscordAt`, retorna record atualizado
- Reenvio → funciona normalmente, atualiza timestamp

**`send-to-discord.controller.spec.ts`**:
- `200` em sucesso com `{ data: StandupRecord }`
- `404` quando standup nao existe
- `409` quando estado invalido
- `503` quando automate falha

### Frontend

- Botao visivel apenas em `approved`/`published`
- Botao hidden em `draft`, `pending_review`, `rejected`
- Dialog de confirmacao aparece quando `sentToDiscordAt` presente
- Loading state durante mutation

## Arquivos Impactados

### Novos
- `apps/api/src/contexts/standups/send-to-discord.controller.ts`
- `apps/api/src/contexts/standups/send-to-discord.service.ts`
- `apps/api/src/contexts/standups/send-to-discord.controller.spec.ts`
- `apps/api/src/contexts/standups/send-to-discord.service.spec.ts`
- `apps/api/src/shared/utils/sign-webhook-payload.ts`
- `apps/api/src/shared/utils/sign-webhook-payload.test.ts`
- Nova migration Drizzle (campo `sent_to_discord_at`)

### Modificados
- `apps/api/src/platform/env/env.schema.ts` — novas env vars
- `apps/api/src/platform/env/env.service.ts` — getter para automation vars
- `apps/api/src/platform/database/schema.ts` — novo campo
- `apps/api/src/platform/database/repositories/standup.repository.ts` — novo metodo
- `apps/api/src/shared/domain/types.ts` — campo `sentToDiscordAt` no type
- `apps/api/src/contexts/standups/standups.module.ts` — registrar controller + service
- `apps/web/src/app/features/standup-detail/standup-detail-page.ts` — novo botao
- `apps/web/src/app/features/dashboard/services/standup-service.ts` — nova mutation
- OpenAPI spec → Orval regen
