# Impact Analyzer — Daily Cron-Based PR Impact Detection

## Context

Quando devs fazem modificacoes nos repositorios monitorados (ex: Agrotrace), alteracoes em endpoints, schemas de request/response e migrations de banco podem impactar o time mobile que consome a API. Hoje nao ha nenhum mecanismo automatico de deteccao.

Este projeto adiciona um app independente no monorepo (`apps/impact-analyzer`) que roda via cron uma vez ao dia, coleta todos os PRs abertos e merged nas ultimas 24h, analisa os diffs com LLM, e envia um unico email consolidado ao time afetado.

## Decisoes de Design

| Decisao | Escolha | Motivo |
|---------|---------|--------|
| Localizacao | `apps/impact-analyzer` no monorepo | Isola deploy e ciclo de vida. Reusa padroes (env, errors, email) mas nao compartilha runtime |
| Runtime | Bun + Hono | Bun nativo, Hono ja conhecido, sem overhead |
| Trigger | Cron diario (configuravel) | Sem webhook, sem disparo por PR. Analise consolidada uma vez ao dia |
| Deploy | Container Kamal (mesma infra do Standup) | Zero infra nova, mesmo pipeline |
| Analise | LLM via AI SDK (provider configuravel) | `generateObject` com schema Zod |
| Notificacao | Email (SMTP via nodemailer) | Sem limite de 2000 chars do Discord |
| Escopo inicial | Endpoints + schemas + migrations | Foco no que realmente quebra o mobile |
| Extensibilidade | Config repo→team via env | Facil adicionar novos pares |
| Logging | Pino (Bun-native) via `hono/logger` middleware | Diverge do Winston do NestJS, aceitavel para app independente |

## 1. Arquitetura

```
┌──────────────────────────────────────────────────────────────┐
│                    apps/impact-analyzer                       │
│                                                               │
│  ┌──────────────┐     ┌───────────────┐                      │
│  │   Cron        │     │ Manual (opt)  │                      │
│  │  scheduler    │     │ POST /run     │                      │
│  │  (once/day)   │     │ (ad-hoc)      │                      │
│  └──────┬────────┘     └──────┬────────┘                      │
│         │                     │                                │
│         └──────────┬──────────┘                                │
│                    ▼                                           │
│         ┌──────────────────────┐                               │
│         │  DailyJobService     │                               │
│         │  1. List PRs (24h)   │                               │
│         │  2. Fetch diffs      │                               │
│         │  3. Classify files   │                               │
│         │  4. Generate report  │                               │
│         │  5. Send email       │                               │
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
      main.ts                  # Hono server + cron bootstrap
      modules/
        scheduler/
          daily-job.service.ts   # orquestracao do job diario
          daily-job.service.test.ts
        analyzer/
          pr-list-fetcher.ts     # lista PRs abertos e merged (24h)
          pr-list-fetcher.test.ts
          pr-diff-fetcher.ts     # busca diff de um PR especifico
          pr-diff-fetcher.test.ts
          file-classifier.ts     # classifica arquivos por categoria
          file-classifier.test.ts
          report-generator.ts    # gera relatorio consolidado via LLM
          report-generator.test.ts
        notifications/
          email-sender.ts        # envia email SMTP
          email-sender.test.ts
      shared/
        env.ts                   # Zod env schema
        env.test.ts
        azure-devops-client.ts   # client tipado para Azure DevOps
        azure-devops-client.test.ts
        email-template.ts        # template HTML do email consolidado
        email-template.test.ts
        errors.ts                # TaggedErrors
    package.json
    tsconfig.json
    vitest.config.ts
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
  AI_PROVIDER: z.enum(["openai", "anthropic", "google"]).default("openai"),

  // Email
  SMTP_HOST: z.string().min(1),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_SECURE: z.coerce.boolean().default(false),
  SMTP_FROM: z.string().email(),
  SMTP_USER: z.string().default(""),
  SMTP_PASS: z.string().default(""),

  // Team routing — formato: "repo:team_name:email1,email2;repo2:team2:email3"
  IMPACT_ROUTING: z.string().default("agrotrace:mobile:dev1@example.com,dev2@example.com"),

  // Cron
  CRON_SCHEDULE: z.string().default("0 18 * * 1-5"), // 18:00, dias uteis
  CRON_TIMEZONE: z.string().default("America/Sao_Paulo"),

  // Manual endpoint auth (para rodar ad-hoc)
  ANALYZER_API_KEY: z.string().min(1),
});
```

## 4. Scheduler

### Cron

Usa `croner` (mesma lib do `apps/api`) para agendar execucao diaria.

- `CRON_SCHEDULE`: expressao cron (default: `0 18 * * 1-5` — 18:00 em dias uteis)
- `CRON_TIMEZONE`: timezone para avaliacao do cron (default: `America/Sao_Paulo`)

O cron roda dentro do processo Hono. Quando o container sobe, o scheduler e registrado e o servidor fica ouvindo na porta configurada.

### Manual Trigger (opcional)

```
POST /run
Authorization: Bearer <ANALYZER_API_KEY>
```

Dispara o mesmo job diario de forma sincrona. Retorna `200` com resumo ao completar.

## 5. DailyJobService

Orquestrador principal. Fluxo sequencial:

### 5.1 List PRs (ultimas 24h)

`PrListFetcher.list(repo, projectId)`:

1. Usa Azure DevOps REST API:
   - `GET /{org}/{project}/_apis/git/repositories/{repo}/pullrequests?searchCriteria.status=all&api-version=7.0` — lista todos os PRs
2. Filtra client-side por `creationDate` e `closedDate` nas ultimas 24h
3. Separa em dois grupos:
   - **merged**: `status === "completed"` e `completionOptions.mergeStatus === "succeeded"` (ou `closedDate` presente com merge)
   - **open**: `status === "active"` ou `status === "abandoned"` (abertos ou abandonados nas ultimas 24h)
4. Retorna `{ merged: PrInfo[], open: PrInfo[] }`

Cada `PrInfo`: `{ id: number, title: string, author: string, status: "merged" | "open" | "abandoned", createdDate: string, sourceRefName: string, targetRefName: string }`

### 5.2 Fetch Diffs

`PrDiffFetcher.fetch(repo, projectId, prId)` — para cada PR listado:

1. Usa Azure DevOps REST API:
   - `GET /{org}/{project}/_apis/git/repositories/{repo}/pullRequests/{prId}/iterations?api-version=7.0` — lista iteracoes
   - `GET /{org}/{project}/_apis/git/repositories/{repo}/pullRequests/{prId}/iterations/{iterationId}/changes?api-version=7.0` — lista arquivos alterados
   - Para cada arquivo: usa o `url` retornado para baixar o conteudo
2. Trunca conteudo por arquivo em max 500 linhas
3. Retorna lista de arquivos com diff content

### 5.3 Classify Files

`FileClassifier.classify(files)`:

| Categoria | Patterns | Impacto |
|-----------|----------|---------|
| `migration` | `*.migration.*`, `*.sql`, `drizzle/*`, `migrations/*`, `schema.ts` | Banco de dados |
| `endpoint` | `*controller*`, `*route*`, `*handler*`, `api/`, `routes/` | Endpoints HTTP |
| `schema` | `*dto*`, `*schema*`, `*model*`, `*entity*`, `*contract*` | Contratos request/response |
| `config` | `*.env*`, `*.config.*`, `docker-compose*` | Infra/config (ignorado) |
| `other` | tudo mais | Ignorado |

Retorna: `{ migrations: FileDiff[], endpoints: FileDiff[], schemas: FileDiff[] }`

### 5.4 Generate Consolidated Report

`ReportGenerator.generate(dailyData)`:

`dailyData` contem:
```ts
{
  repo: string,
  date: string,
  merged: { pr: PrInfo, classified: ClassifiedFiles }[],
  open: { pr: PrInfo, classified: ClassifiedFiles }[],
}
```

Usa AI SDK (`generateObject`) com Zod schema:

```ts
const DailyImpactReportSchema = z.object({
  summary: z.string(), // resumo executivo do dia
  mergedImpacts: z.array(z.object({
    prId: z.number(),
    prTitle: z.string(),
    impacts: z.array(z.object({
      category: z.enum(["migration", "endpoint", "schema"]),
      file: z.string(),
      description: z.string(),
      affectedResource: z.string(),
      impactType: z.enum(["BREAKING", "COMPATIBLE", "INFORMATIVE"]),
      recommendation: z.string(),
    })),
  })),
  openImpacts: z.array(z.object({
    prId: z.number(),
    prTitle: z.string(),
    impacts: z.array(z.object({
      category: z.enum(["migration", "endpoint", "schema"]),
      file: z.string(),
      description: z.string(),
      affectedResource: z.string(),
      impactType: z.enum(["BREAKING", "COMPATIBLE", "INFORMATIVE"]),
      recommendation: z.string(),
    })),
  })),
  overallRisk: z.enum(["LOW", "MEDIUM", "HIGH"]),
  totalPrsAnalyzed: z.number(),
  totalImpactsFound: z.number(),
});
```

Prompt:
```
Voce e um analista de impacto de API. Analise os PRs do repositorio {repo}
das ultimas 24h e identifique impactos para o time mobile que consome esta API.

Data: {date}

### PRs MERGED (ja incorporados) — {count} PRs
{merged PRs com diffs classificados}

### PRs ABERTOS (pendentes de merge) — {count} PRs
{open PRs com diffs classificados}

Para cada alteracao em cada PR, identifique:
1. O que mudou
2. Qual recurso e afetado (endpoint, tabela, schema)
3. Tipo de impacto: BREAKING, COMPATIBLE, INFORMATIVE
4. Recomendacao para o time mobile

PRs merged representam mudancas que JA estao em producao/staging.
PRs abertos representam mudancas que ENTRARAO em breve.
```

Nota: Truncamento de tokens feito pelo caller. Limite total: ~15000 tokens (~60000 chars). Se exceder, prioriza PRs merged sobre open, e dentro de cada PR prioriza endpoints e schemas.

### 5.5 Send Consolidated Email

`EmailSender.send(teamEmails, report)`:

- `nodemailer` como dependencia direta
- Assunto: `[Impacto Diario] {date} — {repo} → time {teamName} — {mergedCount} merged, {openCount} abertos`
- Body: HTML renderizado por `email-template.ts`

`email-template.ts`:

Funcao pura `renderDailyReport(report: DailyImpactReport, repo: string, date: string): string`.

Estrutura do HTML:
- Header: "Relatorio Diario de Impacto — {repo} — {date}"
- Resumo executivo
- Badge de risco overall
- Metricas rapidas: `{X} PRs merged, {Y} PRs abertos, {Z} impactos encontrados`
- Seccao 1: **PRs Merged** (ja incorporados) — tabela por PR com impactos
- Seccao 2: **PRs Abertos** (pendentes) — tabela por PR com impactos
- Footer com link para o repo no Azure DevOps

Estilo: inline CSS, system-ui, tabelas com bordas sutis, badges coloridos (verde=LOW, ambar=MEDIUM, vermelho=HIGH).

## 6. Impact Routing

Mesmo formato da spec anterior: `repo:team_name:email1,email2;repo2:team2:email3`

Parser e validacao: `.refine()` no Zod, funcao pura `parseImpactRouting()` com testes.

## 7. TaggedErrors

```ts
class PrFetchError extends TaggedError("PrFetchError") {}
class RepoNotRoutedError extends TaggedError("RepoNotRoutedError") {}
class NoRelevantFilesError extends TaggedError("NoRelevantFilesError") {}
class ReportGenerationError extends TaggedError("ReportGenerationError") {}
class EmailSendError extends TaggedError("EmailSendError") {}
```

Sem `WebhookSignatureError` — nao ha webhook.

## 8. Error Handling

| Erro | Comportamento |
|------|---------------|
| PR fetch falha (um PR) | Log warning, continua com os demais PRs |
| Todos os PRs falham | Log error, sem email |
| LLM falha | `withRetry()`: 3 tentativas, 5s→10s→20s. So retenta transitorios. Depois log error, sem email |
| Email falha | Log error — nao propaga (non-fatal) |
| Repo sem PRs nas 24h | Log info, sem email |
| Repo nao configurado | Log warning, skipa |

## 9. Testes

### `pr-list-fetcher.test.ts`
- PRs merged nas ultimas 24h → retornados no grupo `merged`
- PRs abertos nas ultimas 24h → retornados no grupo `open`
- PRs antigos (> 24h) → filtrados fora
- Sem PRs → arrays vazios
- Azure DevOps auth falha → `PrFetchError`
- Rate limit (429) → respeita `Retry-After`

### `pr-diff-fetcher.test.ts`
- PR valido → retorna arquivos com diffs
- PR nao encontrado → `PrFetchError`
- Diff de arquivo grande → truncado a 500 linhas
- Total de diffs excede limite → dropa menos relevantes

### `file-classifier.test.ts`
- `user.migration.ts` → migration
- `users.controller.ts` → endpoint
- `create-user.dto.ts` → schema
- `schema.ts` → migration
- `readme.md` → other (ignorado)
- Lista mista retorna grupos corretos

### `report-generator.test.ts`
- LLM gera relatorio consolidado com multi-PR
- Falha LLM transitoria → retry via `withRetry()`
- Falha LLM permanente → `ReportGenerationError`
- Output valida contra `DailyImpactReportSchema`

### `email-sender.test.ts`
- Envia email consolidado para lista de destinatarios
- SMTP falha → `EmailSendError`

### `daily-job.service.test.ts`
- Fluxo completo: list PRs → fetch diffs → classify → generate → send
- Repo sem PRs relevantes → log info, sem email
- Um PR falha, outros OK → continua, email com o que deu
- Falha no email → log error, nao propaga

### `env.test.ts`
- Env valida com valores minimos
- `IMPACT_ROUTING` formato invalido → erro
- Valores default aplicados corretamente

## 10. Arquivos Impactados

### Novos (apps/impact-analyzer/)
- `src/main.ts`
- `src/modules/scheduler/daily-job.service.ts` + `.test.ts`
- `src/modules/analyzer/pr-list-fetcher.ts` + `.test.ts`
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
- `vitest.config.ts`
- `Dockerfile`

### Modificados (monorepo)
- `package.json` — workspace entry para `impact-analyzer`
- `turbo.json` — task pipeline incluindo `impact-analyzer`
- `docker-compose.yml` — servico `impact-analyzer` (dev)

## 11. docker-compose.yml (dev)

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
      - mailpit
```

Reusa o `mailpit` existente para SMTP em dev.

## 12. Data Flow

```
Cron dispara (ex: 18:00 dias uteis)
  → DailyJobService.execute()
    → Para cada repo em IMPACT_ROUTING:
      → PrListFetcher.list(repo) → { merged: [], open: [] }
      → Se nenhum PR → log info, proximo repo
      → Para cada PR (merged primeiro, depois open):
        → PrDiffFetcher.fetch(pr) → FileDiff[]
        → FileClassifier.classify() → { migrations, endpoints, schemas }
      → ReportGenerator.generate(dailyData) → DailyImpactReport
      → Se nenhum impacto relevante → log info, sem email
      → EmailTemplate.render(report) → HTML
      → EmailSender.send(teamEmails, html)
  → Log resumo: "{X} repos, {Y} PRs, {Z} impactos, email enviado"
```

## 13. Riscos e Mitigacoes

### Muitos PRs em um dia excedem limite de tokens
Mitigacao: prioriza PRs merged sobre open, dentro de cada PR prioriza endpoints/schemas. Trunca diffs por arquivo (500 linhas). Limite total ~15000 tokens.

### LLM hallucination
Mitigacao: `generateObject` com schema Zod reduz alucinacao. `overallRisk` como flag de confianca. BREAKING changes sempre marcadas como "review required".

### Email nao entregue
Mitigacao: log estruturado, nao propaga erro.

### Cron falha silenciosamente
Mitigacao: log estruturado no inicio e fim de cada execucao. Se necessario, adicionar health check endpoint (`GET /health`) para monitoramento externo.

### Falso positivo na classificacao
Mitigacao: LLM recebe diff real, nao so nome do arquivo.

## 14. Ordem de Implementacao Recomendada

Cada step inclui testes co-desenvolvidos (TDD):

1. Setup do app (`package.json`, `tsconfig`, `vitest.config.ts`, `main.ts`) + env schema com parser de `IMPACT_ROUTING` + testes
2. TaggedErrors + `azure-devops-client.ts` + testes (auth, rate limit, 404, timeout)
3. `pr-list-fetcher.ts` + testes (listar PRs merged e open, filtro 24h)
4. `pr-diff-fetcher.ts` + testes (Azure DevOps iterations API, truncacao)
5. `file-classifier.ts` + testes
6. `report-generator.ts` + testes (`generateObject` com schema, retry, multi-PR)
7. `email-template.ts` + testes (renderizacao HTML consolidado)
8. `email-sender.ts` + testes
9. `daily-job.service.ts` + testes (orquestracao completa, error handling parcial)
10. Cron scheduler em `main.ts` + manual endpoint `POST /run`
11. Dockerfile + docker-compose
