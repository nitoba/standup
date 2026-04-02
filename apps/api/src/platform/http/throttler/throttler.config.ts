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
    { name: 'global', ttl: 60_000, limit: 5000 },
    { name: 'strict', ttl: 60_000, limit: 5 },
    { name: 'auth', ttl: 60_000, limit: 200 },
  ],
}
