# Security Audit Fixes (TAS-31) Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corrigir os 15 findings de segurança identificados na auditoria TAS-31, organizados por severidade (Urgent → High → Medium → Low).

**Architecture:** Fixes aplicados nos arquivos existentes sem reestruturação. Cada fix é cirúrgico — altera apenas o mínimo necessário. Rate limiting via `@nestjs/throttler`, security headers via `@hono/hono` middleware, validações via `class-validator` custom decorators.

**Tech Stack:** NestJS 11, Hono adapter, `@nestjs/throttler`, `croner` (já instalado), `class-validator`, TypeScript strict.

**Linear Issues:** TAS-35, TAS-36 (arquivado/já feito), TAS-37 (arquivado/já feito), TAS-38, TAS-39, TAS-40, TAS-41, TAS-42, TAS-43, TAS-44, TAS-45, TAS-46, TAS-47, TAS-48, TAS-49, TAS-50, TAS-51

---

## Chunk 1: Urgent — Rate Limiting HTTP (TAS-35) + Security Headers (TAS-41)

### Files:
- Modify: `apps/api/package.json` — adicionar `@nestjs/throttler`
- Modify: `apps/api/src/app.module.ts` — registrar `ThrottlerModule`
- Modify: `apps/api/src/main.ts` — adicionar security headers middleware
- Create: `apps/api/src/platform/http/throttler/throttler.config.ts` — configuração dos limites
- Create: `apps/api/src/platform/http/throttler/skip-throttle-for-sse.guard.ts` — guard que pula SSE
- Modify: `apps/api/src/contexts/standups/trigger/trigger-standup.controller.ts` — `@Throttle` restrito

---

### Task 1: Instalar @nestjs/throttler

- [ ] **Step 1: Instalar dependência**

```bash
cd apps/api && bun add @nestjs/throttler
```

Expected: `@nestjs/throttler` adicionado em `package.json` dependencies.

- [ ] **Step 2: Verificar instalação**

```bash
cd apps/api && bun run typecheck 2>&1 | head -20
```

Expected: sem erros relacionados a throttler (pacote apenas instalado, ainda não usado).

---

### Task 2: Criar configuração de throttler

**Files:**
- Create: `apps/api/src/platform/http/throttler/throttler.config.ts`

- [ ] **Step 1: Criar o arquivo de config**

```typescript
// apps/api/src/platform/http/throttler/throttler.config.ts
import type { ThrottlerModuleOptions } from '@nestjs/throttler'

/**
 * Rate limiting tiers:
 * - global: 100 req / 60s (padrão para endpoints comuns)
 * - strict: 5 req / 60s (endpoints que disparam LLM ou operações custosas)
 * - auth: 10 req / 60s (rotas de autenticação — anti brute-force)
 *
 * Os nomes 'global', 'strict' e 'auth' são usados nos decoradores @Throttle({ ... })
 */
export const THROTTLER_CONFIG: ThrottlerModuleOptions = {
  throttlers: [
    { name: 'global', ttl: 60_000, limit: 100 },
    { name: 'strict', ttl: 60_000, limit: 5 },
    { name: 'auth', ttl: 60_000, limit: 10 },
  ],
}
```

- [ ] **Step 2: Criar o barrel de exports do throttler**

```typescript
// apps/api/src/platform/http/throttler/index.ts
export { THROTTLER_CONFIG } from './throttler.config'
```

---

### Task 3: Registrar ThrottlerModule no AppModule

**Files:**
- Modify: `apps/api/src/app.module.ts`

- [ ] **Step 1: Ler app.module.ts atual**

Ler o arquivo `apps/api/src/app.module.ts` para ver os imports existentes.

- [ ] **Step 2: Adicionar ThrottlerModule e APP_GUARD**

No array `imports` do `AppModule`, adicionar:

```typescript
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler'
import { APP_GUARD } from '@nestjs/core'
import { THROTTLER_CONFIG } from './platform/http/throttler'

// No @Module imports:
ThrottlerModule.forRoot(THROTTLER_CONFIG),

// No @Module providers (adicionar junto com os outros APP_GUARD/APP_PIPE/APP_INTERCEPTOR existentes):
{
  provide: APP_GUARD,
  useClass: ThrottlerGuard,
},
```

> **Nota sobre Hono adapter:** `@nestjs/throttler` usa `Reflector` e funciona no nível NestJS, independente do HTTP adapter. O `ThrottlerGuard` padrão lê o IP do request via `ExecutionContext`. Com Hono adapter, o IP vem de `request.ip` ou `request.socket.remoteAddress` — o `ThrottlerGuard` padrão suporta isso.

- [ ] **Step 3: Verificar typecheck**

```bash
cd apps/api && bun run typecheck 2>&1 | head -30
```

Expected: sem erros de tipo.

---

### Task 4: Aplicar rate limit restrito em endpoints de LLM

**Files:**
- Modify: `apps/api/src/contexts/standups/trigger/trigger-standup.controller.ts`
- Verify: existe `/digests/trigger` e `/reminders/run-now` — adicionar `@Throttle` neles também

- [ ] **Step 1: Ler o controller de trigger**

Ler `apps/api/src/contexts/standups/trigger/trigger-standup.controller.ts`.

- [ ] **Step 2: Adicionar @Throttle no endpoint de trigger**

```typescript
import { Throttle } from '@nestjs/throttler'

// No método POST do controller:
@Throttle({ strict: { limit: 5, ttl: 60_000 } })
@Post('trigger')
async trigger(...) { ... }
```

- [ ] **Step 3: Buscar e atualizar digests e reminders controllers**

Buscar por `/digests/trigger` e `/reminders/run-now`. Adicionar `@Throttle({ strict: ... })` nesses endpoints também.

- [ ] **Step 4: Verificar typecheck**

```bash
cd apps/api && bun run typecheck 2>&1 | head -30
```

---

### Task 5: Adicionar security headers via middleware Hono (TAS-41)

**Files:**
- Modify: `apps/api/src/main.ts`

> **Importante:** O adapter é Hono, não Express. `helmet` (Express) não funciona. Usar middleware Hono nativo para adicionar headers manualmente — já que `@hono/hono` pode não ter `secureHeaders` disponível na versão em uso.

- [ ] **Step 1: Adicionar middleware de security headers no main.ts**

Após `const adapter = new HonoAdapter()` e antes de `adapter.getInstance().all('/api/auth/*', ...)`, adicionar:

```typescript
// Security headers middleware — aplicado em todas as rotas
adapter.getInstance().use('*', async (ctx, next) => {
  await next()
  ctx.res.headers.set('X-Content-Type-Options', 'nosniff')
  ctx.res.headers.set('X-Frame-Options', 'DENY')
  ctx.res.headers.set('X-XSS-Protection', '0') // modern browsers — desabilitar o filtro legado
  ctx.res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  ctx.res.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  // HSTS só em produção (não funciona em HTTP local)
  if (process.env.NODE_ENV === 'production') {
    ctx.res.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
  }
})
```

- [ ] **Step 2: Verificar typecheck**

```bash
cd apps/api && bun run typecheck 2>&1 | head -30
```

- [ ] **Step 3: Testar manualmente (se ambiente disponível)**

```bash
curl -I http://localhost:3333/health
# Expected: X-Content-Type-Options, X-Frame-Options nos headers
```

---

### Task 6: Commit do Chunk 1

- [ ] **Step 1: Commit**

```bash
git add apps/api/src/platform/http/throttler/ apps/api/src/app.module.ts apps/api/src/main.ts apps/api/package.json apps/api/src/contexts/standups/trigger/trigger-standup.controller.ts
git commit -m "security: add rate limiting (ThrottlerModule) and security headers"
```

---

## Chunk 2: High → Medium — Auth Session, PageSize, Cron Validation (TAS-38, TAS-39, TAS-40)

### Task 7: GET /auth/session — retornar apenas campos necessários (TAS-38)

**Files:**
- Modify: `apps/api/src/contexts/identity/auth.controller.ts`

- [ ] **Step 1: Criar DTO de resposta da sessão**

No mesmo arquivo `auth.controller.ts`, adicionar uma interface de resposta antes do controller:

```typescript
interface SessionResponseDto {
  authenticated: boolean
  userId?: string
  name?: string
  email?: string
  avatarUrl?: string
}
```

- [ ] **Step 2: Atualizar o método getSession**

Substituir a linha 26:
```typescript
// ANTES:
return { authenticated: session !== null, session }

// DEPOIS:
if (!session || typeof session !== 'object' || !('user' in session)) {
  return { authenticated: false } satisfies SessionResponseDto
}
const s = session as { user: Record<string, unknown> }
return {
  authenticated: true,
  userId: typeof s.user.id === 'string' ? s.user.id : undefined,
  name: typeof s.user.name === 'string' ? s.user.name : undefined,
  email: typeof s.user.email === 'string' ? s.user.email : undefined,
  avatarUrl: typeof s.user.image === 'string' ? s.user.image : undefined,
} satisfies SessionResponseDto
```

- [ ] **Step 3: Verificar typecheck**

```bash
cd apps/api && bun run typecheck 2>&1 | head -30
```

---

### Task 8: pageSize com limite máximo (TAS-39)

**Files:**
- Modify: `apps/api/src/platform/database/repositories/standup.repository.ts` linha 241
- Modify: `apps/api/src/contexts/standups/query/standups-query.controller.ts` (documentação via `@ApiQuery`)

- [ ] **Step 1: Adicionar Math.min no repository**

Em `standup.repository.ts`, linha 241:
```typescript
// ANTES:
const pageSize = Math.max(filters?.pageSize ?? 20, 1)

// DEPOIS:
const pageSize = Math.min(Math.max(filters?.pageSize ?? 20, 1), 100)
```

- [ ] **Step 2: Atualizar documentação do parâmetro no controller**

Em `standups-query.controller.ts`, linha 49:
```typescript
// ANTES:
@ApiQuery({ name: 'pageSize', required: false, type: Number, example: 20 })

// DEPOIS:
@ApiQuery({ name: 'pageSize', required: false, type: Number, example: 20, description: 'Max: 100' })
```

- [ ] **Step 3: Rodar testes**

```bash
cd apps/api && bun run test --run 2>&1 | tail -20
```

Expected: todos os testes passando.

---

### Task 9: Validação de sintaxe de cron nos campos do DTO (TAS-40)

**Files:**
- Create: `apps/api/src/shared/validators/is-valid-cron.validator.ts`
- Modify: `apps/api/src/contexts/preferences/me/me-settings.dto.ts`

> **Nota:** `croner` já está instalado no projeto. Usar `Cron` do croner para validar — se a instanciação não lançar erro, o cron é válido.

- [ ] **Step 1: Criar custom validator**

```typescript
// apps/api/src/shared/validators/is-valid-cron.validator.ts
import {
  registerDecorator,
  type ValidationArguments,
  type ValidationOptions,
} from 'class-validator'
import { Cron } from 'croner'

export function IsValidCron(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isValidCron',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown): boolean {
          if (typeof value !== 'string') return false
          try {
            // croner lança erro se o padrão for inválido
            new Cron(value, { paused: true })
            return true
          } catch {
            return false
          }
        },
        defaultMessage(args: ValidationArguments): string {
          return `${args.property} must be a valid cron expression`
        },
      },
    })
  }
}
```

- [ ] **Step 2: Aplicar o decorator no DTO**

Em `me-settings.dto.ts`, adicionar `@IsValidCron()` nos 3 campos de cron:

```typescript
import { IsValidCron } from '../../../shared/validators/is-valid-cron.validator'

// Para standupCron, reminderCron, recoveryCron:
@ApiProperty()
@IsString()
@MinLength(1, { message: requiredField('standupCron') })
@IsValidCron()
standupCron!: string
```

Repetir para `reminderCron` e `recoveryCron`.

- [ ] **Step 3: Criar teste unitário para o validator**

```typescript
// apps/api/src/shared/validators/is-valid-cron.validator.test.ts
import { validate } from 'class-validator'
import { IsString, MinLength } from 'class-validator'
import { describe, expect, it } from 'vitest'
import { IsValidCron } from './is-valid-cron.validator'

class TestDto {
  @IsString()
  @MinLength(1)
  @IsValidCron()
  cron!: string
}

describe('IsValidCron', () => {
  it('deve aceitar cron válido', async () => {
    const dto = Object.assign(new TestDto(), { cron: '0 17 * * 1-5' })
    const errors = await validate(dto)
    expect(errors).toHaveLength(0)
  })

  it('deve rejeitar string inválida', async () => {
    const dto = Object.assign(new TestDto(), { cron: 'foobar' })
    const errors = await validate(dto)
    expect(errors.some((e) => e.constraints?.isValidCron)).toBe(true)
  })

  it('deve rejeitar string vazia (MinLength já pega, mas IsValidCron também)', async () => {
    const dto = Object.assign(new TestDto(), { cron: '' })
    const errors = await validate(dto)
    expect(errors.length).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 4: Rodar teste**

```bash
cd apps/api && bun run test src/shared/validators/is-valid-cron.validator.test.ts --run
```

Expected: 3 testes passando.

- [ ] **Step 5: Verificar typecheck**

```bash
cd apps/api && bun run typecheck 2>&1 | head -30
```

---

### Task 10: Commit do Chunk 2

- [ ] **Step 1: Commit**

```bash
git add apps/api/src/contexts/identity/auth.controller.ts \
        apps/api/src/platform/database/repositories/standup.repository.ts \
        apps/api/src/contexts/standups/query/standups-query.controller.ts \
        apps/api/src/shared/validators/ \
        apps/api/src/contexts/preferences/me/me-settings.dto.ts
git commit -m "security: fix session exposure, add pageSize cap, validate cron expressions"
```

---

## Chunk 3: Medium — Discord Rate Limiting (TAS-42) + CORS centralizado (TAS-43)

### Task 11: Rate limiting em slash commands do Discord (TAS-42)

**Files:**
- Create: `apps/api/src/interfaces/discord/throttler/command-cooldown.service.ts`
- Modify: `apps/api/src/interfaces/discord/handlers/slash-command-handler.service.ts`

> **Nota:** O Discord já tem seus próprios rate limits, mas não impede spam de `/standup trigger` que consome créditos de LLM. Implementar cooldown in-memory por userId Discord.

- [ ] **Step 1: Criar CommandCooldownService**

```typescript
// apps/api/src/interfaces/discord/throttler/command-cooldown.service.ts
import { Injectable } from '@nestjs/common'

const COOLDOWN_MS = 5 * 60 * 1000 // 5 minutos por usuário

@Injectable()
export class CommandCooldownService {
  private readonly cooldowns = new Map<string, number>()

  /**
   * Verifica se o usuário está em cooldown.
   * @returns null se pode prosseguir, ou o número de segundos restantes se em cooldown.
   */
  check(userId: string, command: string): number | null {
    const key = `${userId}:${command}`
    const lastUsed = this.cooldowns.get(key)
    if (lastUsed === undefined) return null

    const elapsed = Date.now() - lastUsed
    if (elapsed >= COOLDOWN_MS) {
      this.cooldowns.delete(key)
      return null
    }
    return Math.ceil((COOLDOWN_MS - elapsed) / 1000)
  }

  /**
   * Registra o uso de um comando para o usuário.
   */
  record(userId: string, command: string): void {
    const key = `${userId}:${command}`
    this.cooldowns.set(key, Date.now())
  }
}
```

- [ ] **Step 2: Criar teste unitário**

```typescript
// apps/api/src/interfaces/discord/throttler/command-cooldown.service.test.ts
import { describe, expect, it, vi } from 'vitest'
import { CommandCooldownService } from './command-cooldown.service'

describe('CommandCooldownService', () => {
  it('permite o primeiro uso', () => {
    const svc = new CommandCooldownService()
    expect(svc.check('user1', 'trigger')).toBeNull()
  })

  it('bloqueia segundo uso dentro do cooldown', () => {
    const svc = new CommandCooldownService()
    svc.record('user1', 'trigger')
    const remaining = svc.check('user1', 'trigger')
    expect(remaining).not.toBeNull()
    expect(remaining).toBeGreaterThan(0)
  })

  it('permite uso após cooldown expirar', () => {
    vi.useFakeTimers()
    const svc = new CommandCooldownService()
    svc.record('user1', 'trigger')
    vi.advanceTimersByTime(5 * 60 * 1000 + 1)
    expect(svc.check('user1', 'trigger')).toBeNull()
    vi.useRealTimers()
  })

  it('cooldown é por usuário+comando — não afeta outros usuários', () => {
    const svc = new CommandCooldownService()
    svc.record('user1', 'trigger')
    expect(svc.check('user2', 'trigger')).toBeNull()
  })
})
```

- [ ] **Step 3: Rodar teste**

```bash
cd apps/api && bun run test src/interfaces/discord/throttler/command-cooldown.service.test.ts --run
```

Expected: 4 testes passando.

- [ ] **Step 4: Registrar no módulo Discord**

Ler o arquivo do módulo Discord (`discord.module.ts`) e adicionar `CommandCooldownService` no array `providers`.

- [ ] **Step 5: Injetar e usar no slash-command-handler**

No `slash-command-handler.service.ts`, injetar `CommandCooldownService` e adicionar verificação de cooldown no handler do comando `trigger`:

```typescript
// Antes de disparar o pipeline de geração:
const remaining = this.cooldown.check(interaction.user.id, 'trigger')
if (remaining !== null) {
  await interaction.reply({
    content: `⏳ Aguarde ${remaining}s antes de usar /standup trigger novamente.`,
    ephemeral: true,
  })
  return
}
this.cooldown.record(interaction.user.id, 'trigger')
// ... restante do handler
```

- [ ] **Step 6: Verificar typecheck**

```bash
cd apps/api && bun run typecheck 2>&1 | head -30
```

---

### Task 12: Centralizar CORS em middleware global (TAS-43)

**Files:**
- Modify: `apps/api/src/main.ts`

> **Contexto:** Atualmente CORS está em 3 lugares: `adapter.getInstance().all('/api/auth/*', ...)` (linhas 40-50), `enableCors()` (linha ~83), e o middleware SSE. O objetivo é ter um único middleware Hono que gerencie CORS para todas as rotas, incluindo Better Auth e SSE.

- [ ] **Step 1: Ler o main.ts completo**

Ler o arquivo completo para entender a estrutura atual e identificar todos os pontos de CORS.

- [ ] **Step 2: Criar helper centralizado de CORS**

Antes do `adapter.getInstance().all('/api/auth/*', ...)`, extrair a lógica de CORS em um helper inline:

```typescript
// Helper para aplicar headers CORS na resposta raw Node.js
function applyCorsHeaders(res: ServerResponse, origin: string | undefined, corsOrigin: string) {
  if (origin === corsOrigin) {
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Access-Control-Allow-Credentials', 'true')
    res.setHeader('Vary', 'Origin')
  }
}

// Middleware global CORS para Hono (todas as rotas exceto Better Auth que usa raw Node.js)
adapter.getInstance().use('*', async (ctx, next) => {
  const origin = ctx.req.header('origin')
  if (origin === corsOrigin) {
    ctx.res.headers.set('Access-Control-Allow-Origin', origin)
    ctx.res.headers.set('Access-Control-Allow-Credentials', 'true')
    ctx.res.headers.set('Vary', 'Origin')
  }
  if (ctx.req.method === 'OPTIONS') {
    ctx.res.headers.set('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS')
    ctx.res.headers.set('Access-Control-Allow-Headers', 'Content-Type,Authorization')
    ctx.res.headers.set('Access-Control-Max-Age', '86400')
    return ctx.body(null, 204)
  }
  await next()
})
```

- [ ] **Step 3: Remover as configurações duplicadas de CORS**

- Remover o bloco de CORS inline dentro do handler `/api/auth/*` (linhas 40-54) — manter apenas `await authHandler(ctx.env.incoming, res)` + `return RESPONSE_ALREADY_SENT`.
  
  > **Atenção:** O Better Auth usa `toNodeHandler` que escreve direto na `ServerResponse` do Node.js, bypassando o Hono. O CORS middleware Hono NÃO cobre esse path (resposta já foi enviada). Manter os headers CORS no handler do Better Auth, mas remover duplicações — ou usar o `applyCorsHeaders` helper.

- Remover `app.enableCors(...)` do NestJS — o middleware Hono já cobre.

- Remover CORS manual do SSE controller (se existir).

- [ ] **Step 4: Verificar que app.enableCors() foi removido**

Buscar no `main.ts` por `enableCors` — deve retornar zero ocorrências.

- [ ] **Step 5: Verificar typecheck e que a app ainda sobe**

```bash
cd apps/api && bun run typecheck 2>&1 | head -30
```

---

### Task 13: Commit do Chunk 3

- [ ] **Step 1: Commit**

```bash
git add apps/api/src/interfaces/discord/throttler/ \
        apps/api/src/interfaces/discord/handlers/slash-command-handler.service.ts \
        apps/api/src/main.ts
git commit -m "security: add Discord command cooldown, centralize CORS middleware"
```

---

## Chunk 4: Low — Timezone, LIKE wildcards, TriggerDto, DB URL, OpenAPI, marked, error details

### Task 14: Validação de timezone via Intl (TAS-44)

**Files:**
- Create: `apps/api/src/shared/validators/is-valid-timezone.validator.ts`
- Modify: `apps/api/src/contexts/preferences/me/me-settings.dto.ts`

- [ ] **Step 1: Criar custom validator**

```typescript
// apps/api/src/shared/validators/is-valid-timezone.validator.ts
import {
  registerDecorator,
  type ValidationArguments,
  type ValidationOptions,
} from 'class-validator'

// Lazy-cache da lista de timezones suportados
let supportedTimezones: ReadonlySet<string> | null = null

function getSupportedTimezones(): ReadonlySet<string> {
  if (!supportedTimezones) {
    try {
      supportedTimezones = new Set(Intl.supportedValuesOf('timeZone'))
    } catch {
      // Fallback: aceitar qualquer string se Intl.supportedValuesOf não disponível
      supportedTimezones = new Set()
    }
  }
  return supportedTimezones
}

export function IsValidTimezone(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isValidTimezone',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown): boolean {
          if (typeof value !== 'string') return false
          const supported = getSupportedTimezones()
          // Se supportedTimezones está vazio (Intl.supportedValuesOf indisponível), aceita qualquer string não vazia
          if (supported.size === 0) return value.length > 0
          return supported.has(value)
        },
        defaultMessage(args: ValidationArguments): string {
          return `${args.property} must be a valid IANA timezone (e.g. "America/Sao_Paulo")`
        },
      },
    })
  }
}
```

- [ ] **Step 2: Aplicar no DTO**

Em `me-settings.dto.ts`:
```typescript
import { IsValidTimezone } from '../../../shared/validators/is-valid-timezone.validator'

@ApiProperty()
@IsString()
@MinLength(1, { message: requiredField('timezone') })
@IsValidTimezone()
timezone!: string
```

- [ ] **Step 3: Criar teste unitário**

```typescript
// apps/api/src/shared/validators/is-valid-timezone.validator.test.ts
import { validate } from 'class-validator'
import { describe, expect, it } from 'vitest'
import { IsValidTimezone } from './is-valid-timezone.validator'

class TestDto {
  @IsValidTimezone()
  timezone!: string
}

describe('IsValidTimezone', () => {
  it('aceita timezone IANA válido', async () => {
    const dto = Object.assign(new TestDto(), { timezone: 'America/Sao_Paulo' })
    const errors = await validate(dto)
    expect(errors).toHaveLength(0)
  })

  it('rejeita string inválida', async () => {
    const dto = Object.assign(new TestDto(), { timezone: 'foobar/timezone' })
    const errors = await validate(dto)
    expect(errors.some((e) => e.constraints?.isValidTimezone)).toBe(true)
  })
})
```

- [ ] **Step 4: Rodar teste**

```bash
cd apps/api && bun run test src/shared/validators/is-valid-timezone.validator.test.ts --run
```

---

### Task 15: Escapar wildcards LIKE no search (TAS-45)

**Files:**
- Modify: `apps/api/src/platform/database/repositories/standup.repository.ts`

- [ ] **Step 1: Localizar onde o LIKE é construído**

O LIKE está em `buildListConditions()` no repository (linhas ~146-162). Localizar a função e verificar o padrão exato.

- [ ] **Step 2: Adicionar função de escape**

Antes de `buildListConditions`, adicionar:
```typescript
/** Escapa wildcards do SQLite LIKE: % e _ */
function escapeLikePattern(value: string): string {
  return value.replace(/%/g, '\\%').replace(/_/g, '\\_')
}
```

- [ ] **Step 3: Usar a função no LIKE pattern**

```typescript
// ANTES:
like(standups.content, `%${search}%`)

// DEPOIS:
like(standups.content, `%${escapeLikePattern(search)}%`)
```

> **Nota:** SQLite suporta ESCAPE clause, mas `like()` do Drizzle não expõe isso diretamente. O escape via replace é suficiente para prevenir pattern injection — os caracteres `\%` e `\_` no pattern são tratados como literais pelo SQLite.

- [ ] **Step 4: Verificar typecheck**

```bash
cd apps/api && bun run typecheck 2>&1 | head -20
```

---

### Task 16: Remover userId/discordUserId do TriggerStandupDto (TAS-46)

**Files:**
- Modify: `apps/api/src/contexts/standups/trigger/trigger-standup.dto.ts`

- [ ] **Step 1: Ler o arquivo atual**

Ler `apps/api/src/contexts/standups/trigger/trigger-standup.dto.ts`.

- [ ] **Step 2: Remover campos redundantes**

Remover os campos `userId` e `discordUserId` do DTO (ou decorá-los com `@ApiHideProperty()` se ainda usados internamente).

Verificar se algum código usa `dto.userId` ou `dto.discordUserId` e substituir pelo valor da sessão.

- [ ] **Step 3: Verificar typecheck**

```bash
cd apps/api && bun run typecheck 2>&1 | head -20
```

---

### Task 17: Mascarar Database URL nos logs de migration (TAS-48)

**Files:**
- Modify: `apps/api/src/platform/database/migrate.ts` linhas 147-153

- [ ] **Step 1: Ler o arquivo**

Ler `apps/api/src/platform/database/migrate.ts` ao redor das linhas 147-153.

- [ ] **Step 2: Substituir log da URL completa**

```typescript
// Helper para mascarar URL sensível nos logs
function maskDatabaseUrl(url: string): string {
  try {
    const parsed = new URL(url)
    return `${parsed.protocol}//${parsed.host}${parsed.pathname}`
  } catch {
    // Se não é uma URL válida (ex: file:./data/standup.db), retornar só o início
    return url.length > 40 ? `${url.slice(0, 40)}...` : url
  }
}

// No log:
logger.log(`Running migrations on: ${maskDatabaseUrl(databaseUrl)}`)
```

- [ ] **Step 3: Verificar typecheck**

```bash
cd apps/api && bun run typecheck 2>&1 | head -20
```

---

### Task 18: Proteger endpoints OpenAPI em produção (TAS-49)

**Files:**
- Modify: `apps/api/src/main.ts` linhas 142-144
- Modify: `apps/api/src/platform/http/controllers/api-reference.controller.ts`

- [ ] **Step 1: Ler os arquivos**

Ler `apps/api/src/main.ts` linhas 140-149 e o controller de api-reference.

- [ ] **Step 2: Condicionar OpenAPI ao NODE_ENV**

No `main.ts`, envolver o setup do OpenAPI:
```typescript
if (env.app.nodeEnv !== 'production') {
  // setup do swagger/openapi
  createOpenApiDocument(app)
  // montar endpoint /openapi.json e /docs
}
```

No `api-reference.controller.ts`, adicionar guard baseado em NODE_ENV:
```typescript
import { ForbiddenException } from '@nestjs/common'

// No início do handler:
if (process.env.NODE_ENV === 'production') {
  throw new ForbiddenException('API docs not available in production')
}
```

- [ ] **Step 3: Verificar typecheck**

```bash
cd apps/api && bun run typecheck 2>&1 | head -20
```

---

### Task 19: Sanitização do marked em templates de email (TAS-50)

**Files:**
- Modify: `apps/api/src/interfaces/email/utils/markdown-to-email-html.ts`

> **Nota:** Instalar `sanitize-html` (mais leve que DOMPurify para Node.js).

- [ ] **Step 1: Instalar sanitize-html**

```bash
cd apps/api && bun add sanitize-html && bun add -d @types/sanitize-html
```

- [ ] **Step 2: Aplicar sanitização após o parse**

```typescript
import sanitizeHtml from 'sanitize-html'

// Após marked.parse():
const rawHtml = await marked.parse(markdown, { async: true })
const sanitized = sanitizeHtml(rawHtml, {
  allowedTags: sanitizeHtml.defaults.allowedTags.concat(['img', 'h1', 'h2', 'h3']),
  allowedAttributes: {
    ...sanitizeHtml.defaults.allowedAttributes,
    img: ['src', 'alt', 'title'],
    '*': ['class'],
  },
})
return sanitized
```

- [ ] **Step 3: Verificar typecheck**

```bash
cd apps/api && bun run typecheck 2>&1 | head -20
```

---

### Task 20: Filtrar detalhes internos nas respostas de erro HTTP (TAS-51)

**Files:**
- Modify: `apps/api/src/platform/http/filters/global-exception.filter.ts` linhas 184-206

- [ ] **Step 1: Ler o arquivo**

Ler `apps/api/src/platform/http/filters/global-exception.filter.ts` ao redor das linhas 184-206.

- [ ] **Step 2: Filtrar campos internos do `details`**

Identificar quais campos de domain exceptions são expostos. Criar allowlist dos campos seguros:

```typescript
// Campos permitidos em detalhes públicos de erro
const PUBLIC_ERROR_DETAIL_KEYS = new Set(['field', 'resource', 'message', 'code', 'param'])

function sanitizeErrorDetails(details: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(details).filter(([key]) => PUBLIC_ERROR_DETAIL_KEYS.has(key))
  )
}
```

Usar `sanitizeErrorDetails(details)` ao construir a resposta.

- [ ] **Step 3: Verificar typecheck**

```bash
cd apps/api && bun run typecheck 2>&1 | head -20
```

---

### Task 21: Commit final do Chunk 4

- [ ] **Step 1: Run CI completo**

```bash
cd apps/api && bun run lint && bun run typecheck && bun run test --run
```

Expected: tudo passando sem erros.

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/shared/validators/ \
        apps/api/src/contexts/preferences/me/me-settings.dto.ts \
        apps/api/src/platform/database/repositories/standup.repository.ts \
        apps/api/src/contexts/standups/trigger/trigger-standup.dto.ts \
        apps/api/src/platform/database/migrate.ts \
        apps/api/src/main.ts \
        apps/api/src/platform/http/controllers/api-reference.controller.ts \
        apps/api/src/interfaces/email/utils/markdown-to-email-html.ts \
        apps/api/src/platform/http/filters/global-exception.filter.ts \
        apps/api/package.json
git commit -m "security: fix LOW severity findings — timezone/LIKE/DTO/OpenAPI/email/error details"
```

---

## Notas de Implementação

### TAS-47 (PAT via git credential helper) — Adiado

O finding TAS-47 recomenda usar git credential helper em vez de `-c http.extraheader=...`. Isso requer mudanças na lógica de autenticação do `git-collector.service.ts` e impacta o comportamento de clones/pulls. Está marcado como LOW e "padrão da indústria". Adiar para uma issue dedicada após validação dos outros fixes.

### TAS-36 e TAS-37 — Arquivados

Já resolvidos (confirmado pelo `archivedAt` nas issues do Linear). Não incluídos neste plano.

### Ordem de execução recomendada para subagentes paralelos

Se usar `subagent-driven-development`, estes grupos podem rodar em paralelo:
- **Paralelo 1:** Task 7 (auth session) + Task 8 (pageSize) — arquivos diferentes, sem dependência
- **Paralelo 2:** Task 14 (timezone) + Task 15 (LIKE) + Task 16 (TriggerDto) — todos independentes
- **Sequencial obrigatório:** Task 1→2→3→4→5→6 (rate limiting depende da instalação do pacote primeiro)

---

## Checklist Final

- [ ] `bun run lint` sem erros
- [ ] `bun run typecheck` sem erros  
- [ ] `bun run test --run` todos passando
- [ ] Atualizar status das issues no Linear para "Done"
