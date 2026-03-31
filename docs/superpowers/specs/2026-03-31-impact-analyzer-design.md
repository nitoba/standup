# Impact Analyzer — PR Impact Detection for Cross-Team Dependencies

## Context

Quando um dev faz modificacoes no repositorio do Agrotrace (ou qualquer outro repo monitorado) e abre um PR, alteracoes em endpoints, schemas de request/response e migrations de banco podem impactar o time mobile que consome a API. Hoje nao ha nenhum mecanismo automatico de deteccao.

Este projeto adiciona um app independente no monorepo (`apps/impact-analyzer`) que recebe triggers via webhook (Azure DevOps) ou comando manual, analisa o diff do PR com LLM, e envia um relatorio tecnico detalhado por email ao time afetado.

## Decisoes de Design

| Decisao | Escolha | Motivo |
|---------|---------|--------|
| Localizacao | `apps/impact-analyzer` no monorepo | Isola deploy e ciclo de vida do Standup API. Reusa padroes (env, errors, email) mas nao compartilha runtime. Se o Standup API cair, o analyzer continua funcionando |
| Runtime | Bun + Hono | Bun nativo, Hono ja conhecido, sem overhead |
| Trigger | Webhook Azure DevOps + endpoint manual | Sem polling, instantaneo, permite ad-hoc |
| Deploy | Container Kamal (mesma infra do Standup) | Zero infra nova, mesmo pipeline |
| Analise | LLM via AI SDK (provider configuravel) | `generateObject` com schema Zod, mesmo padrao do `apps/api` |
| Notificacao | Email (SMTP via nodemailer) | Sem limite de 2000 chars do Discord |
| Escopo inicial | Endpoints + schemas + migrations | Foco no que realmente quebra o mobile |
| Extensibilidade | Config repo→team via env | Facil adicionar novos pares |
| Logging | Pino (Bun-native) via `hono/logger` middleware | Diverge do Winston do NestJS, mas e aceitavel para app independente |

## 1. Arquitetura

```
┌──────────────────────────────────────────────────────────────┐
│                    apps/impact-analyzer                       │
│                                                               │
│  ┌──────────────┐     ┌───────────────┐                      │
│  │ Webhook       │     │ Manual CLI /   │                      │
│  │ POST /webhook │     │ POST /analyze  │                      │
│  │ (Azure DO)    │     │ (script/dev)   │                      │
│  └──────┬────────┘     └──────┬────────┘                      │
│         │                     │                                │
│         └──────────┬──────────┘                                │
│                    ▼                                           │
│         ┌──────────────────────┐                               │
│         │  AnalyzeService      │                               │
│         │  1. Fetch PR diff    │                               │
│         │  2. Classify files   │                               │
│         │  3. Generate report  │                               │
│         │  4. Send email       │                               │
│         └──────────────────────┘                               │
│                    │                                           │
│         ┌──────────┴──────────┐                                │
│         ▼                     ▼                                │
│  ┌──────────────┐    ┌──────────────┐                          │
│  │ Azure DevOps │    │ SMTP / Email │                          │
│  │ REST API     │    │ (nodemailer) │                          │
│  └──────────────┘    └──────────────┘                          │
└────────────────────────────────────────────────────────────────┘
```

## 2. Estrutura de Pastas

```
apps/
  impact-analyzer/
    src/
      main.ts                  # Hono server entrypoint
      modules/
        webhook/
          webhook-handler.ts   # POST /webhook — valida e delega
          webhook-handler.test.ts
        analyzer/
          analyze.service.ts   # orquestracao principal
          analyze.service.test.ts
          pr-diff-fetcher.ts   # busca diff do Azure DevOps
          pr-diff-fetcher.test.ts
          file-classifier.ts   # classifica arquivos por categoria
          file-classifier.test.ts
          report-generator.ts  # gera relatorio via LLM
          report-generator.test.ts
        notifications/
          email-sender.ts      # envia email SMTP
          email-sender.test.ts
      shared/
        env.ts                 # Zod env schema
        env.test.ts
        azure-devops-client.ts # client tipado para Azure DevOps
        azure-devops-client.test.ts
        email-template.ts      # template HTML do email
        email-template.test.ts
        errors.ts              # TaggedErrors
    package.json
    tsconfig.json
    Dockerfile
```

## 3. Environment

Zod schema em `src/shared/env.ts`:

```ts
const envSchema = z.object({
  // Core
  NODE_ENV: z.enum(["development", "production"]).default("development"),
  PORT: z.coerce.number().default(3000),

  // Azure DevOps
  AZURE_DEVOPS_ORG: z.string().min(1),
  AZURE_DEVOPS_PAT: z.string().min(1),
  AZURE_DEVOPS_DEFAULT_PROJECT: z.string().default("AGROTRACE"),

  // LLM
  AI_PROVIDER_API_KEY: z.string().min(1),
  AI_MODEL: z.string().default("gpt-4o"),
  AI_PROVIDER: z.enum(["openai", "anthropic", "google"]).default("openai"), // mesmo padrao configuravel do apps/api

  // Email
  SMTP_HOST: z.string().min(1),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_SECURE: z.coerce.boolean().default(false),
  SMTP_FROM: z.string().email(),
  SMTP_USER: z.string().default(""),
  SMTP_PASS: z.string().default(""),

  // Team routing — formato: "repo:team_name:email1,email2;repo2:team2:email3"
  IMPACT_ROUTING: z.string().default("agrotrace:mobile:dev1@example.com,dev2@example.com"),

  // Webhook
  WEBHOOK_SECRET: z.string().optional(), // valida payload do Azure DevOps

  // Manual endpoint auth
  ANALYZER_API_KEY: z.string().min(1), // Bearer token para POST /analyze
});
```

## 4. Webhook Handler

### Endpoint

```
POST /webhook
```

### Payload Azure DevOps (PullRequestCreated)

Azure DevOps envia um payload JSON com `eventType: "git.pullrequest.created"` e `resource` contendo dados do PR.

### Fluxo

1. Valida `WEBHOOK_SECRET` se configurado. Azure DevOps Service Hooks nao suporta custom headers nem assinaturas nativas. Duas opcoes:
   - **Opcao A (recomendada)**: Sem validacao de payload — confia na rede interna (Tailscale/IP allowlist). `WEBHOOK_SECRET` fica opcional e nao usado.
   - **Opcao B**: Proxy intermediario (ex: Cloudflare Worker, Nginx) que injeta `X-Analyzer-Secret` header antes de encaminhar.
   
   Adotar Opcao A para v1. Se seguranca for requisito, documentar Opcao B.
2. Extrai: `repository.name`, `pullRequestId`, `sourceRefName`, `targetRefName`, `project.name`
3. Resolve team afetado via `IMPACT_ROUTING`
4. Delega para `AnalyzeService`
5. Retorna `202 Accepted` imediatamente (async por tras)

### Respostas

| Status | Condicao |
|--------|----------|
| 202 | PR recebido, analise iniciada |
| 400 | Payload invalido ou evento nao suportado |
| 401 | Webhook secret invalido |
| 404 | Repo nao configurado em `IMPACT_ROUTING` |

## 5. Manual Endpoint

```
POST /analyze
Content-Type: application/json

{
  "repo": "agrotrace-api",
  "projectId": "AGROTRACE",
  "prId": 1234
}
```

Mesmo fluxo do webhook, mas com parametros explicitos. Protegido por `Authorization: Bearer <ANALYZER_API_KEY>` header, onde `ANALYZER_API_KEY` e uma env var compartilhada com o script/CI que faz a chamada.

## 6. AnalyzeService

Orquestrador principal. Fluxo sequencial:

### 6.1 Fetch PR Diff

`PrDiffFetcher.fetch(repo, projectId, prId)`:

1. Usa Azure DevOps REST API para obter diffs sem filesystem operations:
   - `GET /{org}/{project}/_apis/git/repositories/{repo}/pullRequests/{prId}?api-version=7.0` — obtem PR details com `lastMergeSourceCommit.commitId` e `lastMergeTargetCommit.commitId`
   - `GET /{org}/{project}/_apis/git/repositories/{repo}/pullRequests/{prId}/iterations?api-version=7.0` — lista iteracoes para pegar a mais recente
   - `GET /{org}/{project}/_apis/git/repositories/{repo}/pullRequests/{prId}/iterations/{iterationId}/changes?api-version=7.0` — lista arquivos alterados com `changeType` (add, edit, delete) e `url` para conteudo
   - Para cada arquivo alterado: usa o `url` retornado pelo changes endpoint para baixar o diff content
2. Trunca conteudo por arquivo em max 500 linhas (primeiras 250 + ultimas 250 com marcador `[...truncated...]`)
3. Limita total de diffs a ~60000 caracteres (~15000 tokens): prioriza endpoints e schemas, depois migrations. Se exceder, dropa arquivos menos relevantes
4. Retorna lista de arquivos alterados com diff content limitado

### 6.2 Classify Files

`FileClassifier.classify(files)`:

Classifica cada arquivo alterado em categorias:

| Categoria | Patterns | Impacto |
|-----------|----------|---------|
| `migration` | `*.migration.*`, `*.sql`, `drizzle/*`, `migrations/*`, `schema.ts` | Banco de dados |
| `endpoint` | `*controller*`, `*route*`, `*handler*`, `api/`, `routes/` | Endpoints HTTP |
| `schema` | `*dto*`, `*schema*`, `*model*`, `*entity*`, `*contract*` | Contratos request/response |
| `config` | `*.env*`, `*.config.*`, `docker-compose*` | Infra/config (ignorado na analise de impacto mobile) |
| `other` | tudo mais | Ignorado na analise |

Retorna grupos: `{ migrations: File[], endpoints: File[], schemas: File[] }`

### 6.3 Generate Report

`ReportGenerator.generate(classifiedFiles, prInfo)`:

Usa AI SDK (`generateObject`) com Zod schema para output estruturado:

```ts
const ImpactReportSchema = z.object({
  summary: z.string(), // resumo executivo em portugues
  impacts: z.array(z.object({
    category: z.enum(["migration", "endpoint", "schema"]),
    file: z.string(),
    description: z.string(), // o que mudou
    affectedResource: z.string(), // endpoint, tabela, schema
    impactType: z.enum(["BREAKING", "COMPATIBLE", "INFORMATIVE"]),
    recommendation: z.string(), // acao para o time mobile
  })),
  overallRisk: z.enum(["LOW", "MEDIUM", "HIGH"]),
});
```

Prompt:
```
Voce e um analista de impacto de API. Um PR foi aberto no repositorio {repo}.
Analise as alteracoes abaixo e identifique impactos para o time mobile que consome esta API.

PR: #{prId} — {prTitle}
Autor: {author}

### Migrations ({count} arquivos)
{diffs}

### Endpoints ({count} arquivos)
{diffs}

### Schemas ({count} arquivos)
{diffs}

Para cada alteracao, identifique:
1. O que mudou (descreva a mudanca)
2. Qual recurso e afetado (endpoint, tabela, schema)
3. Tipo de impacto: BREAKING, COMPATIBLE, INFORMATIVE
4. Recomendacao para o time mobile
```

Nota: O truncamento de tokens e feito pelo caller antes de montar o prompt. Limite: ~15000 tokens. Como regra pratica, ~4 caracteres por token para codigo ASCII, entao ~60000 caracteres como teto conservador. Se o diff contiver muitos caracteres Unicode ou binary content, o limite de caracteres deve ser reduzido proporcionalmente.

O output estruturado e entao renderizado em HTML via `email-template.ts`.

**Formato dos diffs no prompt**: Cada arquivo e formatado como:

```
--- {filePath} ({changeType: add|edit|delete})
{unified diff content or full file content for adds}
---
```

Para arquivos added: conteudo completo (truncado se > 500 linhas).
Para arquivos edited: diff unificado (`git diff` format).
Para arquivos deleted: nome do arquivo + marcador `[DELETED]`.

### 6.4 Send Email

`EmailSender.send(teamEmails, report)`:

- Usa `nodemailer` como dependencia direta do `apps/impact-analyzer` (nao compartilhada — isolamento intencional)
- Assunto: `[Impacto] PR #{prId} — {repo} → time {teamName}`
- Body: HTML renderizado por `email-template.ts` a partir do `ImpactReport` estruturado
- To: lista de emails do time

`email-template.ts`:

Funcao pura `renderImpactReport(report: ImpactReport, prInfo: PrInfo): string` que gera HTML para email.

Estrutura do HTML:
- Header com titulo: "Analise de Impacto — PR #{prId}"
- Badge de risco overall (`overallRisk`): verde=LOW, ambar=MEDIUM, vermelho=HIGH
- Resumo executivo em paragrafo
- Tabela de impactos com colunas: Arquivo | Categoria | Recurso Afetado | Tipo | Recomendacao
- Footer com link para o PR no Azure DevOps

Estilo: inline CSS (compativel com clientes de email), font-family system-ui, tabela com bordas sutis, badges coloridos.

## 7. Impact Routing

`IMPACT_ROUTING` define quais repos afetam quais times:

```
agrotrace-api:mobile:alice@x.com,bob@x.com;agrotrace-web:mobile:alice@x.com
```

Formato: `repo:team_name:email1,email2;repo2:team2:email3`

Funcao `resolveImpactRouting(repo: string)`:
- Retorna `{ teamName: string, emails: string[] }` ou `null` se nao configurado

Parser e validacao:
- Env schema usa `.refine()` para validar formato: cada segmento deve ter exatamente 3 partes separadas por `:`
- Emails devem ser validados com `z.string().email()` apos split
- Funcao pura `parseImpactRouting(raw: string): Map<string, { teamName: string, emails: string[] }>` em `shared/env.ts` com testes dedicados

## 8. TaggedErrors

```ts
class WebhookSignatureError extends TaggedError("WebhookSignatureError") {}
class PrFetchError extends TaggedError("PrFetchError") {}
class RepoNotRoutedError extends TaggedError("RepoNotRoutedError") {} // repo nao configurado em IMPACT_ROUTING
class NoRelevantFilesError extends TaggedError("NoRelevantFilesError") {} // PR so tem arquivos irrelevantes (doc, readme, etc)
class ReportGenerationError extends TaggedError("ReportGenerationError") {}
class EmailSendError extends TaggedError("EmailSendError") {}
```

## 9. Error Handling

| Erro | Comportamento |
|------|---------------|
| Webhook invalido | 400/401, log warning, sem email |
| PR fetch falha | Log error, retorna 502, sem email |
| LLM falha | Usa `withRetry()` padrao do projeto: 3 tentativas, delays 5s→10s→20s. So retenta erros transitorios. Depois log error, sem email |
| Email falha | Log error — nao propaga (notificacao e non-fatal) |
| Repo nao configurado | 404, log info, sem email |
| PR sem arquivos relevantes | Webhook: 202 (aceito, nada a reportar). Manual: 200 com `{ status: "no_relevant_changes" }` |

## 10. Testes

### `webhook-handler.test.ts`
- Payload valido de pullrequest.created → 202
- Payload de outro evento (push, etc) → 400
- Secret invalido → 401
- Repo nao configurado → 404
- Payload malformado → 400

### `file-classifier.test.ts`
- `user.migration.ts` → migration
- `users.controller.ts` → endpoint
- `create-user.dto.ts` → schema
- `schema.ts` → migration
- `readme.md` → other (ignorado)
- Lista mista retorna grupos corretos

### `analyze.service.test.ts`
- Fluxo completo: fetch → classify → generate → send
- PR sem arquivos relevantes → sem email, log info
- Falha no fetch → error propagado
- Falha no email → log error, nao propaga

### `azure-devops-client.test.ts`
- Autenticacao valida → retorna dados do PR
- PAT invalido → erro de autenticacao
- Repo nao encontrado → erro 404 mapeado para `PrFetchError`
- Rate limit (429) → retry com header `Retry-After`
- Timeout → `PrFetchError`

### `report-generator.test.ts`
- LLM gera relatorio estruturado com diffs classificados
- Falha LLM transitoria → retry via `withRetry()`
- Falha LLM permanente → ReportGenerationError
- Output valida contra `ImpactReportSchema`

### `email-sender.test.ts`
- Envia email com HTML report para lista de destinatarios
- SMTP falha → EmailSendError

### `env.test.ts`
- Env valida com valores minimos
- IMPACT_ROUTING com formato invalido → erro
- Valores default aplicados corretamente

## 11. Arquivos Impactados

### Novos (apps/impact-analyzer/)
- `src/main.ts`
- `src/modules/webhook/webhook-handler.ts` + `.test.ts`
- `src/modules/analyzer/analyze.service.ts` + `.test.ts`
- `src/modules/analyzer/pr-diff-fetcher.ts` + `.test.ts`
- `src/modules/analyzer/file-classifier.ts` + `.test.ts`
- `src/modules/analyzer/report-generator.ts` + `.test.ts`
- `src/modules/notifications/email-sender.ts` + `.test.ts`
- `src/shared/env.ts` + `.test.ts`
- `src/shared/azure-devops-client.ts` + `.test.ts`
- `src/shared/email-template.ts` + `.test.ts`
- `src/shared/errors.ts`
- `package.json`
- `tsconfig.json`
- `Dockerfile`

### Modificados (monorepo)
- `package.json` — workspace entry para `impact-analyzer`
- `turbo.json` — task pipeline incluindo `impact-analyzer`
### `docker-compose.yml` — servico `impact-analyzer` (dev)

```yaml
services:
  impact-analyzer:
    build:
      context: .
      dockerfile: apps/impact-analyzer/Dockerfile
    ports:
      - "3000:3000"
    env_file:
      - .env.local
    depends_on:
      - mailpit  # SMTP local para dev
```

Reusa o `mailpit` do docker-compose existente para SMTP em dev.
- `.kamal/` — novo deploy config: `config/deploy/impact-analyzer.yml` com service name, image, port, env refs. Segue padrao do `standup-api` existente

## 12. Data Flow

### Webhook (fire-and-forget — retorna 202 imediatamente)

```
Azure DevOps PR created
  → POST /webhook
    → WebhookHandler valida, extrai repo/prId
    → resolveImpactRouting(repo) → team emails
    → Verifica idempotencia: se prId ja analisado nas ultimas 24h → log info, retorna 202
    → Spawns AnalyzeService.execute() em background (nao await)
    → 202 Accepted (retorna imediatamente)

  [Background]
    → PrDiffFetcher.fetch() → File[]
    → FileClassifier.classify() → { migrations, endpoints, schemas }
    → se vazio → log info, retorna
    → ReportGenerator.generate() → ImpactReport (structured)
    → EmailTemplate.render(report) → HTML
    → EmailSender.send(emails, html)
```

**Idempotencia**: Map em memoria `analyzedPrs: Map<string, number>` (key: `${repo}:${prId}`, value: timestamp). Limpa entries > 24h. Se o mesmo PR chegar de novo, skipa analise.

**Limitacao conhecida**: O Map em memoria e perdido em restarts do container. Se o servico reiniciar, o mesmo PR pode ser reanalisado. Aceitavel para v1 — se tornar problema, migrar para SQLite simples (mesmo Drizzle do `apps/api` ou libsql local).

### Manual endpoint (sincrono — espera analise completar)

```
POST /analyze (com Bearer token)
  → mesmo fluxo, mas await em tudo
  → retorna 200 com corpo:
    { "status": "completed", "prId": 1234, "repo": "agrotrace-api", "impactsFound": 3, "overallRisk": "MEDIUM", "emailsSent": 2 }
  → ou caso sem arquivos relevantes:
    { "status": "no_relevant_changes", "prId": 1234, "message": "Nenhuma alteracao relevante encontrada" }
  → ou 500 se algo falhar:
    { "error": "PrFetchError", "message": "..." }
```

**Nota**: Para PRs muito grandes, o endpoint sincrono pode exceder timeouts de HTTP (ex: 60s em reverse proxies). Se isso ocorrer, o manual endpoint pode ser convertido para o padrao async do webhook com um `GET /status/:prId` para polling.

## 13. Riscos e Mitigacoes

### LLM timeout em PRs grandes
Mitigacao: truncar diffs por arquivo (max 500 linhas) no fetcher, limite total de 15000 tokens no prompt, `withRetry()` para erros transitorios

### LLM hallucination (falso positivo/negativo)
Mitigacao: output estruturado via `generateObject` com schema Zod — reduz alucinacao. Relatorio inclui `overallRisk` (LOW/MEDIUM/HIGH) como flag de confianca. BREAKING changes sempre marcadas como "review required"

### Email nao entregue
Mitigacao: log estruturado com conteudo do report, nao propaga erro

### Webhook Azure DevOps nao configurado
Mitigacao: endpoint manual `/analyze` funciona como fallback; script do dev pode chamar diretamente

### Falso positivo na classificacao de arquivos
Mitigacao: LLM recebe contexto do diff real, nao so nome do arquivo — reduz falsos positivos

### IMPACT_ROUTING desatualizado
Mitigacao: log warning quando repo recebe PR mas nao tem routing configurado

## 14. Ordem de Implementacao Recomendada

Cada step inclui testes co-desenvolvidos (TDD):

1. Setup do app (`package.json`, `tsconfig`, `main.ts`) + env schema com parser de `IMPACT_ROUTING` + testes
2. TaggedErrors + `azure-devops-client.ts` + testes (auth, rate limit, 404, timeout)
3. `pr-diff-fetcher.ts` + testes (Azure DevOps iterations API, truncacao)
4. `file-classifier.ts` + testes
5. `report-generator.ts` + testes (`generateObject` com schema, retry)
6. `email-template.ts` + testes (renderizacao HTML)
7. `email-sender.ts` + testes
8. `analyze.service.ts` + testes (orquestracao completa, idempotencia)
9. Webhook handler + testes
10. Manual endpoint + testes
11. Dockerfile + deploy config
