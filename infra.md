# Infraestrutura — Standup Bot

Monorepo com **2 imagens Docker ativas**: API e Web.

---

## Stack

- **Cloudflare** — DNS + HTTPS na borda + WAF
- **Cloudflare Tunnel (cloudflared)** — acesso publico sem abrir portas / sem IP publico
- **Kamal 2 + kamal-proxy** — deploy com swap sem downtime
- **Tailscale** — rede privada para admin/SSH/deploy
- **GitHub Actions** — CI/CD (lint, typecheck, test, build, deploy)
- **GHCR (ghcr.io)** — container registry para as imagens Docker
- **Colima** — runtime Docker em VM Linux no MacBook (Apple Silicon / arm64)

---

## Arquitetura

### Fluxo de requisicao publica (producao)

```
[ Usuario/Internet ]
        |
      HTTPS :443
        |
[ Cloudflare Edge (TLS, WAF, DNS) ]
        |
   (roteia por hostname)
        |           |
        |           |
[ api.nitodev.com.br ]   [ app.nitodev.com.br ]
        |                        |
        └──────────┬─────────────┘
                   |
         [ Cloudflare Tunnel ]
                   |
       [ cloudflared no MacBook ]
                   |
         HTTP :80 → VM Linux do Colima
                   |
[ kamal-proxy dentro do Colima (swap + routing por Host header) ]
        |                        |
   api (3333)              nginx/web (80)
                                 |
                          proxy → api (3333)   ← rotas /standups, /settings, etc.
                          serve  static files  ← Angular SPA
```

Toda a funcionalidade de bot, scheduler, jobs e email roda dentro do monolito `standup-api`.
As aplicacoes rodam dentro da VM Linux do Colima, nao diretamente no macOS host.

### Fluxo de deploy (CI → Kamal → MacBook)

```
[ Push na main ]
        |
[ GitHub Actions ]
   ├─ quality: lint + typecheck + test (ubuntu-latest)
   ├─ build: Docker images arm64 → GHCR (ubuntu-24.04-arm nativo, sem QEMU)
   │         2 imagens: api e web
   └─ deploy:
        ├─ Tailscale connect (OAuth, tag:ci, efemero)
        ├─ SSH na VM Colima via Tailscale
        ├─ kamal deploy x2 (api, web) com --skip-push
        └─ SSH no MacBook host → launchctl reload cloudflared
```

### Fluxo de admin (Tailscale)

```
[ Celular/notebook (Tailscale) ]
                |
           rede privada
                |
[ MacBook (Tailscale) ] ---- SSH / DB / logs / observabilidade
```

SSH e portas internas so acessiveis via Tailscale. Apenas a API fica publica via Cloudflare.

---

## Servidor de deploy

| Item               | Valor                                                       |
| ------------------ | ----------------------------------------------------------- |
| Host               | MacBook Apple Silicon (M1) com Colima                       |
| Tailscale hostname | `colima.tail2ee1d6.ts.net`                                  |
| Usuario SSH        | `nitoba`                                                    |
| Container runtime  | Colima (Docker engine em VM Linux)                          |
| Arquitetura        | `aarch64` (arm64)                                           |
| Diretorio de dados | `/opt/standup/data` (dentro da VM Colima, SQLite WAL)       |
| Diretorio de repos | `/Users/nitoba/repos` (virtiofs mount, read-only no container da API) |

Observacao: o MacBook hospeda o Colima, mas a API e o Web executam dentro da VM Linux do Colima.
O diretorio `/opt/standup/data` existe apenas dentro da VM — nao confundir com um path no macOS host.

---

## Imagens Docker

Todas as imagens sao arm64, buildadas no GitHub Actions com runner nativo `ubuntu-24.04-arm` (sem QEMU) e publicadas no GHCR.

| Imagem                           | Dockerfile                    | Base runtime             | Porta |
| -------------------------------- | ----------------------------- | ------------------------ | ----- |
| `ghcr.io/nitoba/standup-api`     | `apps/api/Dockerfile`         | `debian:bookworm-slim`   | 3333  |
| `ghcr.io/nitoba/standup-web`     | `apps/web/Dockerfile`         | `nginx:alpine`           | 80    |

**Build strategy**: multi-stage com `bun build --compile --target=bun-linux-arm64`.
A API usa `debian:bookworm-slim` no runtime, copia o binario do Bun para o entrypoint e executa `migrate.ts` antes de iniciar o binario compilado.
O web compila a SPA Angular via `bun install --ignore-scripts` (evita falha de compilacao nativa do `lmdb` no arm64) e serve com nginx.

Tags no GHCR:

- `sha-<full-git-sha>` — usada pelo Kamal para identificar a versao
- `latest` — conveniencia para pulls manuais

---

## Configuracao Kamal

### Estrutura de arquivos

```
standup/
  .kamal/
    secrets-common       # Secrets do Kamal (gitignored) — usa $VAR substitution
  config/
    deploy.api.yml       # Monolito NestJS — com kamal-proxy (api.nitodev.com.br)
    deploy.web.yml       # Web SPA — com kamal-proxy (app.nitodev.com.br)
```

### Servicos

| App | Service name    | Proxy       | Acesso          | Hostname publico     |
| --- | --------------- | ----------- | --------------- | -------------------- |
| API | `standup-api`   | kamal-proxy | via proxy (:80) | `api.nitodev.com.br` |
| Web | `standup-web`   | kamal-proxy | via proxy (:80) | `app.nitodev.com.br` |

### Comunicacao interna entre containers

Os containers rodam na rede Docker `kamal` dentro da VM Colima.
URLs internas usam os network aliases dos containers.

| De        | Para                       | URL                         | Finalidade                                 |
| --------- | -------------------------- | --------------------------- | ------------------------------------------ |
| Web → API | `standup-api:3333` (nginx) | `http://standup-api:3333`   | REST + SSE `/standups` proxiado pelo nginx |

Obs: o nginx do `standup-web` usa `resolver 127.0.0.11` + `set $upstream` para deferir a resolucao DNS ao runtime (evita falha fatal no boot quando `standup-api` ainda nao esta disponivel).

### Volumes

| Volume      | Host path             | Container path | Quem usa |
| ----------- | --------------------- | -------------- | -------- |
| SQLite data | `/opt/standup/data`   | `/app/data`    | API      |
| Git repos   | `/Users/nitoba/repos` | `/repos` (ro)  | API      |

`REPOS_ROOT_PATH` deve ser `/repos` em todos os containers. Fora de containers
(ex.: `bun run dev` local), ele deve apontar para um path absoluto do host.
No `docker-compose.yml`, o bind source do host usa `HOST_REPOS_ROOT_PATH` para
nao conflitar com o path de runtime dentro do container.

### Healthcheck

Apenas a API tem healthcheck via kamal-proxy (`GET /health`, interval 3s).

### Deploy commands

```bash
# Deploy individual
kamal deploy -c config/deploy.api.yml --skip-push --version "sha-<commit>"

# Logs
kamal app logs -c config/deploy.api.yml

# First-time setup (bootstraps kamal-proxy + containers)
kamal setup -c config/deploy.api.yml
```

---

## Pipeline CI/CD

### Workflow: `.github/workflows/ci.yml`

```
push/PR (qualquer branch)     push na main
         |                         |
      quality                   quality → build → deploy
   (lint, typecheck, test)         |         |         |
                                   |     2 imagens   Tailscale
                                   |     arm64       + SSH
                                   |     → GHCR      + kamal deploy x2
```

### Job: quality

- Roda em **todo push e PR**
- `bun install --frozen-lockfile` → `bun run lint` → `bun run typecheck` → `bun run test`

### Job: build

- Roda **apenas em push na main**, apos quality passar
- Runner nativo arm64 (`ubuntu-24.04-arm`) — sem QEMU, sem emulacao
- Builds sequenciais (api → web) no mesmo job para evitar cancelamentos por concurrency
- Docker Buildx com cache GHA (scope por app)
- Login no GHCR via `GITHUB_TOKEN` (permissao `packages: write`)
- Push com tags `sha-<commit>` + `latest`
- Discord webhook atualiza a mesma mensagem com progresso de cada imagem

### Job: deploy

- Roda **apenas em push na main**, apos build
- `tailscale/github-action@v4` com OAuth client (tag:ci, efemero)
- SSH key setup (`~/.ssh/deploy_key`) com `StrictHostKeyChecking accept-new`
- Instala Kamal via `gem install kamal`
- `kamal deploy --skip-push --version "sha-<commit>"` para cada app
- Sequencial: API → Web
- Apos deploy web: SSH no MacBook host (`MAC_HOST`) e reload do `cloudflared` via `launchctl`

### Concurrency

`cancel-in-progress: true` por branch — um novo push cancela o deploy anterior.

---

## GitHub Secrets

### Tailscale + SSH

| Secret                   | Descricao                                                    |
| ------------------------ | ------------------------------------------------------------ |
| `TS_OAUTH_CLIENT_ID`     | OAuth client Tailscale (scope: Devices Write, tag: `tag:ci`) |
| `TS_OAUTH_CLIENT_SECRET` | OAuth client secret Tailscale                                |
| `SSH_PRIVATE_KEY`        | Chave privada Ed25519 para SSH (MacBook e VM Colima)         |
| `DEPLOY_HOST`            | `colima.tail2ee1d6.ts.net` (VM Colima — kamal + docker)      |
| `MAC_HOST`               | `nitoba-mac.tail2ee1d6.ts.net` (MacBook host — cloudflared)  |
| `DEPLOY_USER`            | `nitoba`                                                     |

### App secrets

| Secret                    | Usado por                      |
| ------------------------- | ------------------------------ |
| `DISCORD_CLIENT_ID`       | API                            |
| `DISCORD_CLIENT_SECRET`   | API                            |
| `BETTER_AUTH_SECRET`      | API                            |
| `DISCORD_BOT_TOKEN`       | API                            |
| `DISCORD_CHANNEL_ID`      | API                            |
| `DISCORD_GUILD_ID`        | API                            |
| `AI_PROVIDER_API_KEY`     | API                            |
| `AZURE_DEVOPS_ORG`        | API                            |
| `AZURE_DEVOPS_PAT`        | API                            |
| `AZURE_DEVOPS_DEFAULT_PROJECT` | API                       |
| `SMTP_HOST`               | API                            |
| `SMTP_PORT`               | API                            |
| `SMTP_SECURE`             | API                            |
| `SMTP_FROM`               | API                            |
| `SMTP_USER`               | API                            |
| `SMTP_PASS`               | API                            |
| `DATABASE_URL`            | API                            |
| `DATABASE_AUTH_TOKEN`     | API                            |
| `DISCORD_DEPLOY_WEBHOOK_URL` | CI deploy notifications     |

O `KAMAL_REGISTRY_PASSWORD` usa o secret `GHCR_PAT` (PAT pessoal com scope `read:packages`).
O build job usa `GITHUB_TOKEN` para push; o deploy job usa `GHCR_PAT` para pull via Kamal.
`BETTER_AUTH_URL` nao e secret; em producao ele fica fixo em `https://api.nitodev.com.br`
no `config/deploy.api.yml`.

---

## Cloudflare Tunnel

Um tunnel, 2 hostnames publicos (API e Web).

O `cloudflared` roda como servico LaunchDaemon no MacBook (`com.cloudflare.cloudflared`).
Rotas sao carregadas no startup — o CI faz reload automatico apos cada deploy via `launchctl stop/start`.

### `~/.cloudflared/config.yml`

```yaml
tunnel: <UUID_DO_TUNNEL>
credentials-file: /Users/nitoba/.cloudflared/<UUID_DO_TUNNEL>.json

ingress:
  - hostname: api.nitodev.com.br
    service: http://<COLIMA_ENDPOINT>:80

  - hostname: app.nitodev.com.br
    service: http://<COLIMA_ENDPOINT>:80

  - service: http_status:404
```

> `COLIMA_ENDPOINT` = IP/hostname exposto pela VM do Colima para alcancar o `kamal-proxy`.
> O kamal-proxy roteia para o container correto pelo `Host` header (`api.nitodev.com.br` → `standup-api`, `app.nitodev.com.br` → `standup-web`).

---

## Tailscale ACLs

A tag `tag:ci` deve existir nas ACLs antes de criar o OAuth client:

```json
{
  "tagOwners": {
    "tag:ci": ["autogroup:admin"]
  }
}
```

Configurar em: [login.tailscale.com/admin/acls/file](https://login.tailscale.com/admin/acls/file)

---

## Seguranca

- **API** (`api.nitodev.com.br`): servico publico. Protegido por Cloudflare WAF/rate limiting.
- **Web** (`app.nitodev.com.br`): SPA publica servida pelo nginx. Chamadas de API sao proxiadas para `standup-api` internamente.
- **SSH**: apenas via Tailscale (chave Ed25519, sem senha). Mesma chave usada para VM Colima e MacBook host.
- **Secrets**: nunca commitados. `.kamal/secrets-common` e `*.env` no `.gitignore`.
- **GHCR**: autenticacao via `GITHUB_TOKEN` (automatico no CI).
- **Comunicacao interna**: modulos independentes se coordenam por eventos internos do Nest, sem segredo HTTP interno.

---

## Checklist de setup do servidor (MacBook)

- [x] Colima instalado e rodando
- [x] Tailscale instalado e conectado
- [x] SSH habilitado (System Settings > General > Sharing > Remote Login)
- [x] `/usr/local/bin` no PATH do shell nao-interativo (`~/.zshenv`)
- [x] `/opt/standup/data` criado com owner `nitoba`
- [x] Chave publica do deploy em `~/.ssh/authorized_keys`
- [x] Azure DevOps SSH key (RSA 4096) configurada para clone de repos
- [x] Repositorios clonados em `/Users/nitoba/repos` (git-collector faz `fetch --all` automaticamente)
- [x] Cloudflare Tunnel configurado (`cloudflared` como LaunchDaemon) com 2 hostnames: `api.nitodev.com.br` e `app.nitodev.com.br`
- [x] Primeiro deploy realizado com sucesso (kamal-proxy bootstrapped automaticamente)
- [x] `app.nitodev.com.br` adicionado ao tunnel e verificado via `curl -H "Host: app.nitodev.com.br"`

---

## Decisoes Arquiteturais

| Decisao | Alternativa descartada | Motivo |
|---|---|---|
| SSE para notificacoes web em tempo real | Polling ou WebSocket | SSE e unidirecional, sem estado, reconecta automaticamente; polling e ineficiente; WebSocket e overhead desnecessario para este caso |
| EventBus interno no Nest | Chamadas diretas entre modulos | Mantem `standups`, `worker`, `discord` e `auth` desacoplados dentro do mesmo processo |
| Scheduler, bot e jobs dentro da API | Containers/processos separados | Simplifica deploy, elimina autenticacao HTTP interna e reduz duplicacao de infraestrutura |
| `forceRegenerate` derruba lock `running` | So derruba lock `success` | Lock preso em `running` (crash) impedia regeneracao manual; fix necessario para UX |
| `interaction.editReply()` em modais | `interaction.message.edit()` | Canais de DM nao sao cacheados pelo discord.js; `editReply` usa webhook da interacao sem precisar do cache |
| `new Promise`/`Observable` para manter SSE aberta | polling intervalar | stream de SSE precisa ficar aberta e limpa no disconnect, sem busy loop |
| `trigger/regenerate/adjust` fire-and-forget na web | Loading spinner ate completar | Geracao leva 10-30s; SSE notifica quando pronto; UX mais fluida sem bloquear a UI |
| `bun install --ignore-scripts` no Dockerfile web | Install padrao | `@angular/build` tem `lmdb` como dep opcional que compila via `node-gyp`; falha no arm64 sem `--ignore-scripts` |
| nginx `resolver 127.0.0.11` + `set $upstream` | `proxy_pass` com hostname literal | nginx resolve DNS de upstreams no startup; se `standup-api` nao estiver disponivel, nginx falha ao subir |
| Reload `cloudflared` via CI apos deploy web | Reload manual | `cloudflared` carrega rotas no startup; novas rotas no painel do Cloudflare nao sao aplicadas sem restart |
| SSH direto no MacBook host para reload cloudflared | Configurar tunnel remoto via API | Mais simples; `MAC_HOST` e o hostname Tailscale do MacBook (`nitoba-mac.tail2ee1d6.ts.net`), distinto do Colima |

---

## Redundancias eliminadas

- **Caddy**: desnecessario — Cloudflare ja resolve TLS na borda.
- **Subdominio publico para bot/worker**: desnecessario — toda essa funcionalidade foi internalizada no monolito.
- **Build no servidor**: desnecessario — imagens pre-buildadas no CI via runner arm64 nativo.
- **QEMU cross-compilation**: desnecessario — GitHub oferece `ubuntu-24.04-arm` com arm64 nativo.
- **Container dedicado de migrations**: desnecessario — a API roda `migrate.ts` no entrypoint antes de iniciar o binario compilado.
