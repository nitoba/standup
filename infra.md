# Infraestrutura — Standup Bot

Monorepo com **3 imagens Docker separadas** + 1 imagem de migracao.

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
        |
[ Cloudflare Tunnel ]
        |
[ cloudflared no MacBook ]
        |
  HTTP para a VM Linux do Colima
        |
[ kamal-proxy dentro do Colima (swap + routing por Host) ]
        |
      api (3333)   ← unico servico com proxy publico
```

Bot (3334) e Worker (3335) nao passam pelo kamal-proxy.
As aplicacoes rodam dentro da VM Linux do Colima, nao diretamente no macOS host.

### Fluxo de deploy (CI → Kamal → MacBook)

```
[ Push na main ]
        |
[ GitHub Actions ]
   ├─ quality: lint + typecheck + test (ubuntu-latest)
   ├─ build: Docker images arm64 → GHCR (ubuntu-24.04-arm nativo, sem QEMU)
   └─ deploy:
        ├─ Tailscale connect (OAuth, tag:ci, efemero)
        ├─ SSH na VM Colima via Tailscale
        ├─ docker run migrate (one-shot)
        └─ kamal deploy x3 (api, bot, worker) com --skip-push
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
| Diretorio de repos | `/Users/nitoba/repos` (virtiofs mount, read-only no worker) |

Observacao: o MacBook hospeda o Colima, mas API, Bot e Worker executam dentro da VM Linux do Colima.
O diretorio `/opt/standup/data` existe apenas dentro da VM — nao confundir com um path no macOS host.

---

## Imagens Docker

Todas as imagens sao arm64, buildadas no GitHub Actions com runner nativo `ubuntu-24.04-arm` (sem QEMU) e publicadas no GHCR.

| Imagem                           | Dockerfile                    | Base runtime             | Porta |
| -------------------------------- | ----------------------------- | ------------------------ | ----- |
| `ghcr.io/nitoba/standup-api`     | `apps/api/Dockerfile`         | `distroless/cc-debian12` | 3333  |
| `ghcr.io/nitoba/standup-bot`     | `apps/discord-bot/Dockerfile` | `distroless/cc-debian12` | 3334  |
| `ghcr.io/nitoba/standup-worker`  | `apps/worker/Dockerfile`      | `debian:12-slim` + git   | 3335  |
| `ghcr.io/nitoba/standup-migrate` | `packages/db/Dockerfile`      | `oven/bun:1.3.9`         | -     |

**Build strategy**: multi-stage com `bun build --compile --target=bun-linux-arm64`.
O worker usa `debian:12-slim` (nao Alpine) porque Bun nao tem target arm64-musl.
O migrate roda `bun` diretamente (nao compilado) porque precisa de `import.meta.url` para SQL files.

Tags no GHCR:

- `sha-<full-git-sha>` — usada pelo Kamal para identificar a versao
- `latest` — conveniencia para pulls manuais

---

## Configuracao Kamal

### Estrutura de arquivos

```
standup/
  .kamal/
    secrets              # Secrets do Kamal (gitignored) — usa $VAR substitution
  config/
    deploy.api.yml       # API — com kamal-proxy (api.nitodev.com.br)
    deploy.bot.yml       # Discord bot — sem proxy, network alias standup-bot
    deploy.worker.yml    # Worker — sem proxy, network alias standup-worker + volumes
```

### Servicos

| App    | Service name     | Proxy       | Acesso                          | Hostname publico     |
| ------ | ---------------- | ----------- | ------------------------------- | -------------------- |
| API    | `standup-api`    | kamal-proxy | via proxy (:80)                 | `api.nitodev.com.br` |
| Bot    | `standup-bot`    | nenhum      | network alias `standup-bot`     | nenhum (interno)     |
| Worker | `standup-worker` | nenhum      | network alias `standup-worker`  | nenhum (interno)     |

Bot e Worker **nao publicam portas no host** — usam Docker network aliases na rede `kamal`.
Isso evita conflitos de porta durante redeploys (Kamal renomeia o container antigo mas nao o para antes de iniciar o novo).

### Comunicacao interna entre containers

Os 3 containers rodam na rede Docker `kamal` dentro da VM Colima.
URLs internas usam os network aliases dos containers.

| De           | Para                         | URL                                           | Finalidade                      |
| ------------ | ---------------------------- | --------------------------------------------- | ------------------------------- |
| API → Worker | `standup-worker:3335`        | `http://standup-worker:3335`                  | trigger manual                  |
| API → Bot    | `standup-bot:3334`           | `http://standup-bot:3334`                     | notificacoes                    |
| Worker → Bot | `standup-bot:3334`           | `http://standup-bot:3334`                     | standup-ready, job-failed       |
| Bot → API    | `api.nitodev.com.br`         | `https://api.nitodev.com.br`                  | slash commands (via Cloudflare) |

### Volumes

| Volume      | Host path             | Container path | Quem usa         |
| ----------- | --------------------- | -------------- | ---------------- |
| SQLite data | `/opt/standup/data`   | `/app/data`    | API, Bot, Worker |
| Git repos   | `/Users/nitoba/repos` | `/repos` (ro)  | Worker           |

### Healthcheck

Apenas a API tem healthcheck via kamal-proxy (`GET /health`, interval 3s).
Bot e Worker usam `readiness_delay: 10` (tempo para boot antes de ser considerado pronto).

### Deploy commands

```bash
# Deploy individual
kamal deploy -c config/deploy.api.yml --skip-push --version "sha-<commit>"
kamal deploy -c config/deploy.bot.yml --skip-push --version "sha-<commit>"
kamal deploy -c config/deploy.worker.yml --skip-push --version "sha-<commit>"

# Logs
kamal app logs -c config/deploy.api.yml
kamal app logs -c config/deploy.bot.yml
kamal app logs -c config/deploy.worker.yml

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
                                   |     4 imagens   Tailscale
                                   |     arm64       + SSH
                                   |     → GHCR      + kamal deploy x3
```

### Job: quality

- Roda em **todo push e PR**
- `bun install --frozen-lockfile` → `bun run lint` → `bun run typecheck` → `bun run test`

### Job: build

- Roda **apenas em push na main**, apos quality passar
- Runner nativo arm64 (`ubuntu-24.04-arm`) — sem QEMU, sem emulacao
- Builds sequenciais (api → bot → worker → migrate) no mesmo job para evitar cancelamentos por concurrency
- Docker Buildx com cache GHA (scope por app)
- Login no GHCR via `GITHUB_TOKEN` (permissao `packages: write`)
- Push com tags `sha-<commit>` + `latest`

### Job: deploy

- Roda **apenas em push na main**, apos build
- `tailscale/github-action@v4` com OAuth client (tag:ci, efemero)
- SSH key setup (`~/.ssh/deploy_key`) com `StrictHostKeyChecking accept-new`
- Instala Kamal via `gem install kamal`
- Roda migracao via `docker run --rm` (SSH na VM Colima, com `docker login ghcr.io` antes)
- `kamal deploy --skip-push --version "sha-<commit>"` para cada app
- Sequencial: API → Bot → Worker

### Concurrency

`cancel-in-progress: true` por branch — um novo push cancela o deploy anterior.

---

## GitHub Secrets

### Tailscale + SSH

| Secret                   | Descricao                                                    |
| ------------------------ | ------------------------------------------------------------ |
| `TS_OAUTH_CLIENT_ID`     | OAuth client Tailscale (scope: Devices Write, tag: `tag:ci`) |
| `TS_OAUTH_CLIENT_SECRET` | OAuth client secret Tailscale                                |
| `SSH_PRIVATE_KEY`        | Chave privada Ed25519 para SSH no MacBook                    |
| `DEPLOY_HOST`            | `colima.tail2ee1d6.ts.net`                                   |
| `DEPLOY_USER`            | `nitoba`                                                     |

### App secrets

| Secret                 | Usado por        |
| ---------------------- | ---------------- |
| `DISCORD_BOT_TOKEN`    | Bot, Worker      |
| `DISCORD_CHANNEL_ID`   | Bot, Worker      |
| `DISCORD_USER_ID`      | API, Bot, Worker |
| `DISCORD_DEPLOY_WEBHOOK_URL` | CI deploy notifications |
| `AI_PROVIDER_API_KEY`  | Worker           |
| `AZURE_DEVOPS_ORG`     | Worker           |
| `AZURE_DEVOPS_PAT`     | Worker           |
| `INTERNAL_SECRET`      | API, Bot, Worker |

O `KAMAL_REGISTRY_PASSWORD` usa o secret `GHCR_PAT` (PAT pessoal com scope `read:packages`).
O build job usa `GITHUB_TOKEN` para push; o deploy job usa `GHCR_PAT` para pull via Kamal.

---

## Cloudflare Tunnel

Um tunnel, 1 hostname (apenas API e publica). Bot e Worker sao internos.

### `~/.cloudflared/config.yml`

```yaml
tunnel: <UUID_DO_TUNNEL>
credentials-file: /Users/nitoba/.cloudflared/<UUID_DO_TUNNEL>.json

ingress:
  - hostname: api.nitodev.com.br
    service: http://<COLIMA_ENDPOINT>:80

  - service: http_status:404
```

> `COLIMA_ENDPOINT` = IP/hostname exposto pela VM do Colima para alcancar o `kamal-proxy`.

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

- **API** (`api.nitodev.com.br`): unico servico publico. Protegido por Cloudflare WAF/rate limiting.
- **Bot**: interno, acessivel apenas via network alias `standup-bot` na rede Docker `kamal`. Sem porta publicada no host.
- **Worker**: interno, acessivel apenas via network alias `standup-worker` na rede Docker `kamal`. Sem porta publicada no host.
- **SSH**: apenas via Tailscale (chave Ed25519, sem senha).
- **Secrets**: nunca commitados. `.kamal/secrets` e `*.env` no `.gitignore`.
- **GHCR**: autenticacao via `GITHUB_TOKEN` (automatico no CI).
- **Comunicacao interna**: header `x-internal-secret` com `INTERNAL_SECRET` compartilhado.

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
- [x] Cloudflare Tunnel configurado (`cloudflared` como servico)
- [x] Primeiro deploy realizado com sucesso (kamal-proxy bootstrapped automaticamente)

---

## Redundancias eliminadas

- **Caddy**: desnecessario — Cloudflare ja resolve TLS na borda.
- **Subdominio publico para bot/worker**: desnecessario — comunicacao interna via rede privada do Colima.
- **Build no servidor**: desnecessario — imagens pre-buildadas no CI via runner arm64 nativo.
- **QEMU cross-compilation**: desnecessario — GitHub oferece `ubuntu-24.04-arm` com arm64 nativo.
- **Portas publicadas para bot/worker**: desnecessario — Docker network aliases evitam conflitos durante redeploys.
