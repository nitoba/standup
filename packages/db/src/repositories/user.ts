import { Result } from '@standup/domain'
import { createServiceLogger } from '@standup/logger'
import { and, eq } from 'drizzle-orm'
import type { Db } from '../connection.js'
import { account, user } from '../schema.js'

const logger = createServiceLogger({
  service: 'db',
  component: 'user-repository',
})

export interface UserWithAccount {
  id: string
  name: string
  email: string
  image: string | null
  discordId: string
}

/**
 * Repositório para consultas de usuário autenticado.
 * Usado pelo discord-bot para verificar se um Discord user está registrado.
 */
export class UserRepository {
  constructor(private db: Db) {}

  /**
   * Busca um usuário pelo seu Discord ID (account.accountId onde providerId = 'discord').
   * Retorna null se o usuário não estiver registrado.
   */
  findByDiscordId(
    discordId: string,
  ): Result<UserWithAccount | null, { message: string }> {
    try {
      const rows = this.db
        .select({
          id: user.id,
          name: user.name,
          email: user.email,
          image: user.image,
          discordId: account.accountId,
        })
        .from(account)
        .innerJoin(user, eq(account.userId, user.id))
        .where(
          and(
            eq(account.providerId, 'discord'),
            eq(account.accountId, discordId),
          ),
        )
        .limit(1)
        .all()

      return Result.ok(rows[0] ?? null)
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown DB error'
      logger.error('Failed to find user by Discord ID', {
        discordId,
        error: message,
      })
      return Result.err({ message })
    }
  }
}
