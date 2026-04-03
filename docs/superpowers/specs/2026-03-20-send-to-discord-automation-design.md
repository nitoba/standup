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
| Truncacao de conteudo | Responsabilidade do servidor automate | O standup app envia o conteudo completo; o automate lida com limites do Discord (2000 chars) |

## 1. Database

### Nova coluna

Adicionar `sent_to_discord_at INTEGER` (nullable) na tabela `standups` via Drizzle migration.

**Schema Drizzle**:
```ts
sentToDiscordAt: integer('sent_to_discord_at'),
```

**Impacto nos tipos**: `StandupRecord` ganha `sentToDiscordAt: number | null`.

**Funcao `toRecord`** em `standup.repository.ts` (linha ~41-55) deve mapear o novo campo do row para o record. Sem isso, o campo seria silenciosamente descartado.

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

**Nota**: O servidor automate valida freshness do timestamp com janela de 5 minutos (replay protection). Clock skew entre container Docker e macOS host pode causar rejeicoes — considerar como cenario de debug se ocorrer.

### SendToDiscordService

Localizado em `apps/api/src/contexts/standups/send-to-discord/` (seguindo o padrao de subpastas como `approval/`, `publication/`, `query/`).

Injetado no modulo Standups. Dependencias: `StandupRepository`, `EnvService`, `LoggerFactory`.

**Padrao de error handling**: Segue o mesmo padrao de `ApproveStandupService` — o service chama `throwStandupHttpError()` para erros e retorna o record formatado via `formatStandupRecord()`. O controller nao precisa fazer mapeamento de erro.

**Fluxo**:
1. Busca standup por `id` (scoped por userId via `findByIdForUser`)
2. Valida estado: so permite `approved` ou `published` — senao throw via `throwStandupHttpError`
3. Verifica se env vars de automacao estao configuradas — senao throw `ExternalServiceError`
4. Monta payload `{ channelUrl: DISCORD_AUTOMATION_CHANNEL_URL, message: standup.content }`
5. Assina com `signWebhookPayload(secret, JSON.stringify(payload))`
6. Faz `fetch` para `${DISCORD_AUTOMATION_URL}/send` com:
   - Headers: `Content-Type: application/json`, `x-webhook-signature: header`
   - Timeout: `DISCORD_SEND_TIMEOUT_MS` (60s default) via `AbortSignal.timeout()`
   - **Error handling do fetch**: catch deve tratar `TypeError` (network failure/DNS) e `DOMException`/`AbortError` (timeout do AbortSignal) — ambos mapeados para `ExternalServiceError` com mensagens distintas
7. Valida resposta: `200 { ok: true }` = sucesso, qualquer outro = `ExternalServiceError`
8. Em sucesso: chama `repository.updateSentToDiscordAt(id)`
9. Retorna record formatado via `formatStandupRecord()`

### SendToDiscordController

Localizado em `apps/api/src/contexts/standups/send-to-discord/send-to-discord.controller.ts`.

```
POST /standups/:id/send-to-discord
```

- **Autenticacao**: session via `@Session()` decorator + `requireSessionUserId(session)`
- **Param**: `id` (string, path param) via `@ApiParam`
- **OpenAPI**: `@ApiOperation({ operationId: 'sendToDiscord' })` — Orval gera `sendToDiscord()` no client
- **Resposta sucesso**: `@ApiOkResponse` com tipo reutilizado de `shared/openapi/response-dtos` → `200 { data: FormattedStandupRecord }`
- **Erros**:
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

O `operationId: 'sendToDiscord'` no controller garante que o Orval gera esse nome exato.

### Modelo Standup

Atualizar `Standup` interface em `shared/models/standup-models.ts` com:
```ts
sentToDiscordAt?: string | null  // formatted timestamp ou null
```

Atualizar `mapStandup()` no `StandupService` para propagar o campo do DTO para o modelo.

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

- Visivel quando `status === 'approved'` (nota: no frontend `published` ja e mapeado para `approved` pelo `mapStatus()`, entao a condicao e simplificada)
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

**`standup.repository` (adicionar ao suite existente)**:
- `updateSentToDiscordAt` — atualiza timestamp e retorna record
- `updateSentToDiscordAt` com id inexistente → `NotFoundError`

**`send-to-discord.service.spec.ts`**:
- Standup nao encontrado → `NotFoundError` (via throwStandupHttpError)
- Estado invalido (draft, pending_review, rejected) → `409`
- Env vars nao configuradas → `ExternalServiceError`
- Automate offline (TypeError) → `ExternalServiceError` com mensagem de rede
- Automate timeout (AbortError/DOMException) → `ExternalServiceError` com mensagem de timeout
- Automate retorna erro (401, 500) → `ExternalServiceError`
- Sucesso → atualiza `sentToDiscordAt`, retorna record formatado
- Reenvio → funciona normalmente, atualiza timestamp

**`send-to-discord.controller.spec.ts`**:
- `200` em sucesso com `{ data: FormattedStandupRecord }`
- `404` quando standup nao existe
- `409` quando estado invalido
- `503` quando automate falha
- Requer session (401 sem auth)

### Frontend

- Botao visivel quando `status === 'approved'`
- Botao hidden em `draft`, `pending_review`, `rejected`
- Dialog de confirmacao aparece quando `sentToDiscordAt` presente
- Confirmar no dialog chama `sendToDiscord`
- Cancelar no dialog nao chama `sendToDiscord`
- Data formatada corretamente no texto do dialog
- Loading state durante mutation (botao desabilitado)

## Arquivos Impactados

### Novos
- `apps/api/src/contexts/standups/send-to-discord/send-to-discord.controller.ts`
- `apps/api/src/contexts/standups/send-to-discord/send-to-discord.service.ts`
- `apps/api/src/contexts/standups/send-to-discord/send-to-discord.controller.spec.ts`
- `apps/api/src/contexts/standups/send-to-discord/send-to-discord.service.spec.ts`
- `apps/api/src/shared/utils/sign-webhook-payload.ts`
- `apps/api/src/shared/utils/sign-webhook-payload.test.ts`
- Nova migration Drizzle (campo `sent_to_discord_at`)
- `apps/web/src/app/features/standup-detail/components/resend-confirm-dialog/` (dialog de confirmacao)

### Modificados
- `apps/api/src/platform/env/env.schema.ts` — novas env vars
- `apps/api/src/platform/env/env.service.ts` — getter para automation vars
- `apps/api/src/platform/database/schema.ts` — novo campo `sentToDiscordAt`
- `apps/api/src/platform/database/repositories/standup.repository.ts` — novo metodo + `toRecord` mapeando novo campo
- `apps/api/src/shared/domain/types.ts` — campo `sentToDiscordAt` no StandupRecord
- `apps/api/src/contexts/standups/shared/format-standup-record.ts` — incluir `sentToDiscordAt` na serializacao
- `apps/api/src/contexts/standups/standups.module.ts` — registrar controller + service
- `apps/web/src/app/shared/models/standup-models.ts` — campo `sentToDiscordAt` na interface Standup
- `apps/web/src/app/features/standup-detail/standup-detail-page.ts` — novo botao + logica de reenvio
- `apps/web/src/app/features/dashboard/services/standup-service.ts` — nova mutation + `mapStandup` propagando campo
- OpenAPI spec → Orval regen
