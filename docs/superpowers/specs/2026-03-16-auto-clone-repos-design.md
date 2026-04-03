# Auto-Clone de Repos na Selecao e Geracao de Standups

**Data:** 2026-03-16
**Status:** Aprovado

> **Convencao de paths:** Todos os paths relativos neste documento usam `apps/api/src/` como base, exceto quando indicam `apps/web/` ou `scripts/` explicitamente.

## Problema

Para gerar standups, o sistema precisa de repos git clonados localmente em `REPOS_ROOT_PATH`. Hoje o usuario seleciona repos nas preferencias (web ou Discord), mas se um repo nao existe na maquina, o `git log` falha silenciosamente. Nao ha mecanismo de clone automatico.

## Decisoes

- **Momento do clone:** Hibrido. Clone em background ao salvar settings + fallback sincrono antes da coleta no `GitCollectorService`.
- **Autenticacao:** HTTPS com PAT do Azure DevOps (reutiliza infra existente do `GitCollectorService`).
- **Ambiente:** Container escreve no volume montado do host (`REPOS_ROOT_PATH`). Clone persiste no host.
- **Formato de `selectedRepos`:** Migra de `["repo-name"]` para `["project/repo-name"]` para carregar o project necessario na URL de clone.
- **Migration:** Script one-time em `scripts/migrate-selected-repos.ts` (nao e Drizzle migration, pois o schema nao muda — so o conteudo). Recebe `AZURE_DEVOPS_DEFAULT_PROJECT` via env.
- **Feedback ao usuario:** Log + retry silencioso. Sem UI extra de status de clone. Se o clone em background falhar, o fallback na geracao tenta novamente.

## Arquitetura

### Abordagem escolhida: Clone Service centralizado com evento interno

Um `RepoCloneService` dedicado no contexto `contexts/standups/worker/git-collector/` com dois pontos de integracao:

1. **Settings save** — apos persistir, publica `SETTINGS_REPOS_CHANGED_EVENT`. O `RepoCloneListener` escuta e clona em background os repos novos.
2. **GitCollectorService** (fallback) — antes de coletar commits, chama `ensureAllCloned` para garantir que todos os repos existem.

### Fluxo completo

```
Usuario salva settings (web ou Discord)
  |
  +-- Persiste no banco
  +-- Responde 200 / editReply imediatamente
  +-- Emite SETTINGS_REPOS_CHANGED_EVENT (so repos novos)
       |
       +-- RepoCloneListener (background, fire-and-forget)
            +-- RepoCloneService.ensureAllCloned(novos)
                 +-- repo-a: ja existe -> skip
                 +-- repo-b: nao existe -> git clone -> Ok/Err (logado)

... mais tarde ...

Standup trigger (cron, HTTP ou Discord)
  |
  +-- GitCollectorService.collect(selectedRepos)
       |
       +-- RepoCloneService.ensureAllCloned(todos)  <- fallback
       |    +-- repo-b: ja foi clonado -> skip
       |    +-- repo-c: clone falhou antes, tenta de novo -> Ok/Err
       |
       +-- Itera repos existentes, roda git log, coleta commits
```

## Componentes

### 1. Migracao do formato `selectedRepos`

O campo `selectedRepos` no banco passa de `["repo-a"]` para `["AGROTRACE/repo-a"]`.

**Nova funcao utilitaria** em `shared/repos/parse-selected-repos.ts`:

```ts
interface ParsedRepo { project: string; name: string }

function parseRepoIdentifier(identifier: string, defaultProject: string): ParsedRepo
```

O segundo parametro `defaultProject` e obrigatorio — callers passam o valor de `AZURE_DEVOPS_DEFAULT_PROJECT` (obtido via `EnvService` ou `WorkerRuntimeConfigService` conforme o contexto). Se o identifier nao contem `/`, retorna `{ project: defaultProject, name: identifier }`. Identifiers com multiplos `/` sao tratados como erro (nomes de repo no Azure DevOps nao podem conter `/`), retornando `{ project: defaultProject, name: identifier }` (o identifier inteiro como name).

**Pontos de ajuste:**

| Arquivo | Mudanca |
|---|---|
| `contexts/standups/worker/git-collector/git-collector.service.ts` | `join(reposRoot, parseRepoIdentifier(id).name)` |
| `contexts/preferences/me/me-settings.service.ts` | Recebe `selectedRepos` no formato `project/name` |
| `interfaces/discord/handlers/settings-interaction.service.ts` | `.setValue()` passa `\`${repo.project}/${repo.name}\``; `.setDefault()` compara contra `project/name` em vez de `repo.name` |
| `apps/web/src/app/features/settings/settings-page.ts` | `onRepoCheckedChange()` e `isRepoSelected()` usam `project/name`; template binding em `(zCheckedChange)` passa `repo.project + '/' + repo.name` |

**Migration:** Script one-time em `scripts/migrate-selected-repos.ts`, executado antes do deploy da nova versao. Le todos os `user_settings` com `selectedRepos` nao-vazio, prefiza cada repo name (que nao contem `/`) com o valor de `process.env.AZURE_DEVOPS_DEFAULT_PROJECT`, e atualiza o registro. Nao e uma Drizzle migration (o schema TEXT nao muda, so o conteudo).

### 2. RepoCloneService

**Localizacao:** `contexts/standups/worker/git-collector/repo-clone.service.ts`

**Dependencias injetadas:**
- `WorkerRuntimeConfigService` — para `REPOS_ROOT_PATH`, `AZURE_DEVOPS_PAT` e `AZURE_DEVOPS_ORG`
- `TypedLogger` via `AppLoggerFactory`

**Interface:**

```ts
@Injectable()
class RepoCloneService {
  async ensureCloned(repo: ParsedRepo): Promise<Result<void, RepoCloneError>>
  async ensureAllCloned(repos: ParsedRepo[]): Promise<CloneResult>
}

interface CloneResult {
  cloned: ParsedRepo[]
  alreadyExisted: ParsedRepo[]
  failed: Array<{ repo: ParsedRepo; error: RepoCloneError }>
}
```

**Logica de `ensureCloned`:**

1. Monta path: `join(REPOS_ROOT_PATH, repo.name)`
2. Verifica existencia do diretorio (`fs.access`)
3. Se existe, valida que e um repo git valido: `git -C {path} rev-parse --is-inside-work-tree`. Se falhar (diretorio corrupto/parcial), remove com `fs.rm(path, { recursive: true })` e prossegue para o clone
4. Se nao existe (ou foi removido no passo anterior):
   - `fs.mkdir(REPOS_ROOT_PATH, { recursive: true })` — garante que o parent dir existe
   - Obtem `org` de `WorkerRuntimeConfigService.config.AZURE_DEVOPS_ORG`
   - Monta URL via `buildCloneUrl(org, repo.project, repo.name)` → `https://dev.azure.com/{org}/{repo.project}/_git/{repo.name}`
   - Monta auth header via `buildAuthHeader(pat)` (Base64 de `:{PAT}`)
   - Executa: `git -c credential.helper= -c core.askPass=echo -c http.extraheader={authHeader} clone --quiet {url} {targetPath}` via `runGitCommand`
   - Se exit code 0 → `Ok(void)`, log info
   - Se falhou → `Err(RepoCloneError)`, log warn

**`ensureAllCloned`:** Processa todos em sequencia (evita saturar IO/rede). Nao para no primeiro erro — retorna resumo parcial.

**Concorrencia:** Um `Map<string, Promise<Result<void, RepoCloneError>>>` in-memory garante que clones concorrentes do mesmo repo (ex: dois usuarios selecionam o mesmo repo, ou background + fallback colidem) aguardam a mesma operacao em vez de competir. A promise e removida do map quando resolve.

```ts
private readonly inFlightClones = new Map<string, Promise<Result<void, RepoCloneError>>>()

async ensureCloned(repo: ParsedRepo): Promise<Result<void, RepoCloneError>> {
  const key = `${repo.project}/${repo.name}`
  const existing = this.inFlightClones.get(key)
  if (existing) return existing

  const promise = this.doClone(repo).finally(() => this.inFlightClones.delete(key))
  this.inFlightClones.set(key, promise)
  return promise
}
```

### 3. RepoCloneError

**Localizacao:** `shared/domain/errors.ts` (junto dos outros TaggedErrors do projeto)

```ts
export class RepoCloneError extends TaggedError('RepoCloneError')<{
  repo: string
  message: string
}>() {}
```

### 4. Funcoes puras extraidas

**Novo arquivo:** `contexts/standups/worker/git-collector/azure-devops-git-auth.ts`

Extrai de `GitCollectorService` (hoje metodos `private`):

- `buildAuthHeader(pat: string): string` — `AUTHORIZATION: Basic ${base64(':' + pat)}`
- `buildCloneUrl(org: string, project: string, name: string): string` — `https://dev.azure.com/{org}/{project}/_git/{name}`

Importados tanto pelo `GitCollectorService` quanto pelo `RepoCloneService`.

O `GitCollectorService` tambem tem `buildAzureDevopsHttpRemoteUrl` (converte remote URL existente para HTTPS). Essa funcao NAO e extraida — e especifica da coleta (parse de remotes SSH/HTTPS existentes), nao e usada pelo clone.

### 5. Evento SETTINGS_REPOS_CHANGED_EVENT

**Definicao** em `platform/events/standup-events.ts`:

```ts
export const SETTINGS_REPOS_CHANGED_EVENT = 'settings.repos-changed'

export type SettingsReposChangedEvent = {
  userId: string
  selectedRepos: string[]  // formato 'project/name', so os novos
}
```

**Emit** no `EventBusService` (`platform/events/event-bus.service.ts`):

```ts
emitSettingsReposChanged(payload: SettingsReposChangedEvent): void
```

**Publicacao** em dois pontos. Ambos precisam ler os settings atuais antes de salvar para calcular o diff de repos novos:

**1. `MeSettingsService.put()` (`contexts/preferences/me/me-settings.service.ts`)**

Hoje o metodo `put()` chama `upsert()` diretamente sem ler o estado atual. A mudanca:
- Adiciona `EventBusService` como 4o parametro do construtor (testes existentes precisam atualizar mocks)
- Antes do `upsert()`, faz `findByUserId()` para obter os `selectedRepos` anteriores
- Apos o `upsert()` retornar Ok, compara repos novos vs anteriores e emite `SETTINGS_REPOS_CHANGED_EVENT` se houver novos

Nota: a leitura extra (`findByUserId`) antes do `upsert` e aceitavel — o endpoint de settings e low-frequency (usuario salva manualmente). Race condition entre dois saves concorrentes do mesmo usuario e irrelevante na pratica (worst case: um clone em background duplicado, que e idempotente).

**2. `SettingsInteractionService.handleModal()` (`interfaces/discord/handlers/settings-interaction.service.ts`)**

Mesmo padrao: precisa injetar `EventBusService` (disponivel via `@Global()`) e ler settings atuais antes de salvar para calcular o diff. O `SettingsInteractionService` ja tem acesso ao `UserSettingsRepository` para o `findByUserId`.

### 6. RepoCloneListener

**Localizacao:** `contexts/standups/worker/git-collector/repo-clone.listener.ts`

```ts
@Injectable()
class RepoCloneListener {
  @OnEvent(SETTINGS_REPOS_CHANGED_EVENT)
  async handleReposChanged(event: SettingsReposChangedEvent): Promise<void>
}
```

Fire-and-forget. Falha e logada, nao propagada. O `@OnEvent` funciona porque `EventsModule` e `@Global()` — nao precisa de import explicito no `GitCollectorModule`.

Dependencias: `RepoCloneService` e `TypedLogger` via `AppLoggerFactory`.

### 7. Fallback no GitCollectorService

No inicio de `collect()`, antes de iterar os repos:

```ts
const defaultProject = this.runtimeConfig.config.AZURE_DEVOPS_DEFAULT_PROJECT
const parsed = selectedRepos.map(id => parseRepoIdentifier(id, defaultProject))
const cloneResult = await this.repoCloneService.ensureAllCloned(parsed)

// Log warns para failed, continua com os repos que existem
for (const { repo, error } of cloneResult.failed) {
  this.logger.warn('Repo clone failed, skipping', { repo: repo.name, error: error.message })
}

const failedKeys = new Set(cloneResult.failed.map(f => `${f.repo.project}/${f.repo.name}`))
const repositoryPaths = parsed
  .filter(r => !failedKeys.has(`${r.project}/${r.name}`))
  .map(r => join(reposRootPath, r.name))
```

Se um repo falha no clone, o collect continua com os demais. Standup parcial e mais util do que nenhum.

### 8. Registro no GitCollectorModule

`contexts/standups/worker/git-collector/git-collector.module.ts` ganha dois providers:
- `RepoCloneService`
- `RepoCloneListener`

O modulo ja importa `WorkerRuntimeConfigModule` (que prove `WorkerRuntimeConfigService`). `EventsModule` e `@Global()`, entao `@OnEvent` e `EventBusService` funcionam sem import adicional. `AppLoggerFactory` tambem e global.

## Error Handling

| Erro | Onde | Comportamento |
|---|---|---|
| `RepoCloneError` | `RepoCloneService` | Capturado pelo caller, nunca propagado como excecao |
| Clone falha no background | `RepoCloneListener` | Log warn, non-fatal. Fallback tenta de novo |
| Clone falha no fallback | `GitCollectorService` | Log warn, continua com repos existentes |
| Todos os repos falham | `GitCollectorService` | Collect retorna `repos: []`, pipeline trata como "nenhum commit encontrado" |
| `REPOS_ROOT_PATH` nao existe | `RepoCloneService` | `mkdir(recursive: true)` antes do clone |
| PAT invalido/expirado | `runGitCommand` exit != 0 | `RepoCloneError` com stderr |
| Repo nao existe no Azure DevOps | `git clone` 404 | `RepoCloneError` |
| `AZURE_DEVOPS_ORG` nao configurado | `RepoCloneService.ensureCloned` | Retorna `Err(RepoCloneError)` com mensagem explicativa |
| Diretorio existe mas nao e git repo valido | `RepoCloneService.ensureCloned` | Remove diretorio e tenta clone novamente |
| Clone concorrente do mesmo repo | `RepoCloneService` | In-memory lock (`Map<string, Promise>`) — segundo caller aguarda o primeiro |

## Testes

> Convencao: arquivos de teste usam sufixo `.spec.ts` (consistente com o codebase).

### RepoCloneService (repo-clone.service.spec.ts)

- Repo ja existe e e git valido — retorna `alreadyExisted`, nao chama git clone
- Repo ja existe mas nao e git valido — remove e clona novamente
- Repo nao existe, clone sucesso — retorna `cloned`, args do git clone corretos (URL com org/project/name, auth header, target path)
- Repo nao existe, clone falha — retorna `failed` com `RepoCloneError`
- `AZURE_DEVOPS_ORG` vazio — retorna `failed` com erro explicativo
- `ensureAllCloned` com mix de existentes e novos — clona so os novos
- `ensureAllCloned` com falha parcial — continua processando, retorna resumo completo
- Concorrencia: dois `ensureCloned` do mesmo repo — `runGitCommand` chamado uma unica vez

### RepoCloneListener (repo-clone.listener.spec.ts)

- Evento com repos novos — chama `ensureAllCloned`
- Clone parcial falha — loga warn, nao lanca excecao
- Evento com lista vazia — no-op

### azure-devops-git-auth (azure-devops-git-auth.spec.ts)

- `buildAuthHeader` — formato Base64 correto (`AUTHORIZATION: Basic {base64}`)
- `buildCloneUrl` — URL valida com org, project e name
- `buildCloneUrl` com caracteres especiais no name — URL valida

### parseRepoIdentifier (parse-selected-repos.spec.ts — novos casos)

- `parseRepoIdentifier('AGROTRACE/my-repo', 'DEFAULT')` → `{ project: 'AGROTRACE', name: 'my-repo' }` (defaultProject ignorado)
- `parseRepoIdentifier('my-repo', 'AGROTRACE')` (sem slash) → `{ project: 'AGROTRACE', name: 'my-repo' }` (usa defaultProject)
- `parseRepoIdentifier('ORG/PROJ/EXTRA/repo', 'DEFAULT')` (multiplos slashes) → `{ project: 'DEFAULT', name: 'ORG/PROJ/EXTRA/repo' }` (repos do Azure DevOps nao tem `/` no nome)

### Ajustes em testes existentes

- `git-collector.service.spec.ts` — mock do `RepoCloneService`, formato `project/name` nos inputs
- `me-settings.service.spec.ts` — mock do `EventBusService` (4o param do construtor), teste do emit condicional (repos novos vs sem mudanca)
- `settings-interaction.service.spec.ts` — formato `project/name` no setValue e setDefault, mock do `EventBusService`, teste do emit

## Arquivos

### Novos (7)

| Arquivo | Descricao |
|---|---|
| `contexts/standups/worker/git-collector/azure-devops-git-auth.ts` | Funcoes puras de auth e URL |
| `contexts/standups/worker/git-collector/azure-devops-git-auth.spec.ts` | Testes |
| `contexts/standups/worker/git-collector/repo-clone.service.ts` | RepoCloneService |
| `contexts/standups/worker/git-collector/repo-clone.service.spec.ts` | Testes |
| `contexts/standups/worker/git-collector/repo-clone.listener.ts` | RepoCloneListener |
| `contexts/standups/worker/git-collector/repo-clone.listener.spec.ts` | Testes |
| `scripts/migrate-selected-repos.ts` | Data migration one-time |

### Modificados (12)

| Arquivo | Mudanca |
|---|---|
| `shared/domain/errors.ts` | Adiciona `RepoCloneError` |
| `platform/events/standup-events.ts` | Novo evento `SETTINGS_REPOS_CHANGED_EVENT` + tipo |
| `platform/events/event-bus.service.ts` | Novo metodo `emitSettingsReposChanged()` |
| `shared/repos/parse-selected-repos.ts` | Adiciona `ParsedRepo` type e `parseRepoIdentifier()` |
| `shared/repos/parse-selected-repos.spec.ts` | Testes novos para `parseRepoIdentifier` |
| `contexts/standups/worker/git-collector/git-collector.service.ts` | Extrai `buildAuthHeader`/`buildCloneUrl` para `azure-devops-git-auth.ts`. Injeta `RepoCloneService`. Chama `ensureAllCloned` antes do collect. Usa `parseRepoIdentifier` para extrair `name` ao montar paths |
| `contexts/standups/worker/git-collector/git-collector.service.spec.ts` | Mock `RepoCloneService`, formato `project/name` |
| `contexts/standups/worker/git-collector/git-collector.module.ts` | Registra `RepoCloneService` e `RepoCloneListener` como providers |
| `contexts/preferences/me/me-settings.service.ts` | Injeta `EventBusService` (4o param construtor). Adiciona `findByUserId()` antes do `upsert()` para diff. Emite evento se houver repos novos |
| `contexts/preferences/me/me-settings.service.spec.ts` | Mock `EventBusService`, testes do emit condicional |
| `interfaces/discord/handlers/settings-interaction.service.ts` | `.setValue()` passa `project/name`. `.setDefault()` compara contra `project/name`. `handleModal()` le settings atuais antes de salvar para diff. Injeta `EventBusService`, emite evento |
| `apps/web/src/app/features/settings/settings-page.ts` | `onRepoCheckedChange()` e `isRepoSelected()` usam `project/name`. Template binding ajustado |

### Sem mudanca

- Schema do banco (campo `selectedRepos` continua `TEXT`)
- `PutMeSettingsDto` (validacao continua `@IsString({each:true})`)
- `StandupJobOptions`, `StandupPipelineService`, `RunStandupJobService`
- `WorkerSchedulerService` (`parseSelectedRepos` continua funcionando)

## Ordem de implementacao

1. Funcoes puras — `azure-devops-git-auth.ts`, `parseRepoIdentifier()` + testes
2. `RepoCloneError` em `shared/domain/errors.ts`
3. `RepoCloneService` + testes
4. Evento — tipo em `standup-events.ts` + emit em `event-bus.service.ts`
5. `RepoCloneListener` + testes
6. `GitCollectorService` refactor — extrai metodos privados para `azure-devops-git-auth.ts`, injeta `RepoCloneService`, adiciona fallback com `ensureAllCloned` + testes
7. `GitCollectorModule` — registra `RepoCloneService` e `RepoCloneListener`
8. `MeSettingsService` — injeta `EventBusService`, adiciona `findByUserId` pre-upsert, emit condicional + testes
9. `SettingsInteractionService` — formato `project/name` no setValue, le settings antes de salvar, emit + testes
10. Frontend settings page — `onRepoCheckedChange` e `isRepoSelected` com `project/name`
11. Data migration script — `scripts/migrate-selected-repos.ts`
12. `bun run ci` — lint + typecheck + test verde
