monorepo com **3 imagens separadas**:

✅ **Cloudflare (DNS + HTTPS na borda)**
✅ **Cloudflare Tunnel (cloudflared) no MacBook** (sem abrir portas / sem depender de IP público)
✅ **Kamal + kamal-proxy** (swap sem downtime)
✅ **Tailscale** (admin/SSH/deploy seguro)

---

## Stack enxuto recomendado (o “bem amarrado”)

### Fluxo de requisição pública (produção)

```
[ Usuário/Internet ]
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
      HTTP localhost:80
        |
[ kamal-proxy (swap + routing por Host) ]
   |             |              |
   |             |              |
 api (3333)   bot (3334)    workers (3335)
```

- **Cloudflare** entrega o HTTPS e manda o tráfego pelo tunnel.
- **cloudflared** recebe e joga pro **kamal-proxy** local.
- **kamal-proxy** é quem te dá o _pulo do gato_: **subir container novo e trocar sem downtime**.

---

## Fluxo de deploy (Kamal)

```
[ Seu notebook / CI ]
        |
     kamal deploy
        |
  SSH (recomendo via Tailscale)
        |
[ MacBook ]
   |  build/pull imagem nova
   |  sobe container novo
   |  healthcheck OK
   v
[ kamal-proxy ]
   -> troca tráfego pro novo
   -> remove/aposenta o antigo
```

O Kamal usa o **kamal-proxy** justamente para “gapless deployments” (sem downtime).

---

## Fluxo de admin (Tailscale)

```
[ Seu celular/notebook (Tailscale) ]
                |
           rede privada
                |
[ MacBook (Tailscale) ] ---- SSH / DB / observabilidade
```

Recomendação prática: **SSH e portas internas só via Tailscale**, e só as 3 APIs ficam públicas via Cloudflare.

---

# O que é redundante e o que não é

## Não redundante (mantém)

- **Cloudflare Tunnel**: elimina abrir portas/CGNAT e cria acesso público estável.
- **Kamal + kamal-proxy**: garante o **swap sem downtime**.
- **Tailscale**: acesso admin e deploy via SSH de forma segura.

## Redundante (neste setup)

- **Caddy para certificados/HTTPS público**: se você já está usando Cloudflare na frente, o TLS público **já está resolvido na borda**.
  Caddy só passa a valer a pena se você quiser uma “camada de app gateway” local (middlewares, auth, rate limit local, roteamentos complexos). Caso contrário, é peça a mais.

---

# Como encaixar seus 3 serviços (monorepo, imagens separadas)

### Subdomínios sugeridos no seu domínio

- `api.nitoba.com.br` → Hono API (3333)
- `bot.nitoba.com.br` → webhook/API do bot (3334)
- `workers.nitoba.com.br` → API dos workers (3335)

---

## 1) Cloudflare Tunnel: 1 tunnel, 3 hostnames

Você cria **um tunnel** e publica **3 DNS CNAMEs** apontando para o UUID do tunnel (`<UUID>.cfargotunnel.com`). A Cloudflare documenta isso tanto via dashboard quanto via CLI.

### `~/.cloudflared/config.yml` (modelo)

A ideia aqui é: **todos os hostnames entregam no mesmo lugar (kamal-proxy)**, e ele decide o destino pelo `Host`.

```yaml
tunnel: <UUID_DO_TUNNEL>
credentials-file: /Users/<seu-user>/.cloudflared/<UUID_DO_TUNNEL>.json

ingress:
  - hostname: api.nitoba.com.br
    service: http://localhost:80
  - hostname: bot.nitoba.com.br
    service: http://localhost:80
  - hostname: workers.nitoba.com.br
    service: http://localhost:80

  - service: http_status:404
```

O uso de `ingress` por hostname é o caminho padrão pra múltiplos serviços.

> Dica: rode o `cloudflared` como serviço (launchd no macOS) pra manter o tunnel sempre up.

---

## 2) Kamal: 3 deploy configs (uma por serviço)

O padrão pra “múltiplos apps no mesmo host” com Kamal 2 é ter **um `deploy.yml` por app/serviço**, cada um com seu `proxy.host`.

Organização no monorepo (exemplo):

```
/services/api
  Dockerfile
  config/deploy.yml

/services/bot
  Dockerfile
  config/deploy.yml

/services/workers
  Dockerfile
  config/deploy.yml
```

### O ponto-chave: `proxy.host` + `proxy.app_port`

Como suas apps expõem 3333/3334/3335, cada deploy precisa dizer isso. O `proxy` é app-specific e não “global” quando você tem múltiplas apps.

Exemplos (skeleton) — ajuste os campos de registry/builder conforme seu ambiente:

**API (3333)**

```yaml
service: nitoba-api
image: <seu-registry>/nitoba-api

servers:
  web:
    - <IP-ou-host-do-macbook>

proxy:
  host: api.nitoba.com.br
  app_port: 3333
```

**BOT (3334)**

```yaml
service: nitoba-bot
image: <seu-registry>/nitoba-bot

servers:
  web:
    - <IP-ou-host-do-macbook>

proxy:
  host: bot.nitoba.com.br
  app_port: 3334
```

**WORKERS (3335)**

```yaml
service: nitoba-workers
image: <seu-registry>/nitoba-workers

servers:
  web:
    - <IP-ou-host-do-macbook>

proxy:
  host: workers.nitoba.com.br
  app_port: 3335
```

> Isso te dá: `Host` → kamal-proxy → container ativo daquele serviço.
> E cada serviço faz deploy independente.

---

# Segurança recomendada (bem importante pro bot + workers)

Como `bot.nitoba.com.br` e `workers.nitoba.com.br` são endpoints “sensíveis” (webhooks / execução de jobs), eu recomendo:

- **Cloudflare WAF / rate limiting** no subdomínio
- **Cloudflare Access** se esses endpoints não precisam ser públicos de verdade (ou deixar público só o endpoint de webhook e proteger o resto)
- Autenticação por token/assinatura (Discord webhooks já ajudam, mas API extra deve ser protegida)

---
