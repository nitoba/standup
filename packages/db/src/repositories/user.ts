import { Result } from '@standup/domain'
import { createServiceLogger } from '@standup/logger'
import { and, eq, gt } from 'drizzle-orm'
import type { Db } from '../connection.js'
import { account, session, user } from '../schema.js'

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
   * Resolve Discord ID → internal user ID.
   * Retorna apenas o user.id (usado pela API e worker para propagar userId).
   */
  async findUserIdByDiscordId(
    discordId: string,
  ): Promise<Result<string | null, { message: string }>> {
    try {
      const row = await this.db
        .select({ id: user.id })
        .from(account)
        .innerJoin(user, eq(account.userId, user.id))
        .where(
          and(
            eq(account.providerId, 'discord'),
            eq(account.accountId, discordId),
          ),
        )
        .limit(1)
        .get()

      return Result.ok(row?.id ?? null)
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown DB error'
      logger.error('Failed to find userId by Discord ID', {
        discordId,
        error: message,
      })
      return Result.err({ message })
    }
  }

  /**
   * Resolve internal user ID → Discord ID.
   * Usado pela API para resolver discordUserId a partir da sessão.
   */
  async findDiscordIdByUserId(
    userId: string,
  ): Promise<Result<string | null, { message: string }>> {
    try {
      const row = await this.db
        .select({ accountId: account.accountId })
        .from(account)
        .where(
          and(eq(account.userId, userId), eq(account.providerId, 'discord')),
        )
        .limit(1)
        .get()

      return Result.ok(row?.accountId ?? null)
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown DB error'
      logger.error('Failed to find Discord ID by userId', {
        userId,
        error: message,
      })
      return Result.err({ message })
    }
  }

  /**
   * Busca um usuário pelo seu Discord ID (account.accountId onde providerId = 'discord').
   * Retorna null se o usuário não estiver registrado.
   */
  async findByDiscordId(
    discordId: string,
  ): Promise<Result<UserWithAccount | null, { message: string }>> {
    try {
      const rows = await this.db
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

  /**
   * Verifica se o Discord user possui pelo menos uma sessão ativa (não expirada).
   * Retorna `{ userId, hasSession }` se o account existe, ou `null` se não está registrado.
   */
  async hasActiveSession(
    discordId: string,
  ): Promise<
    Result<{ userId: string; hasSession: boolean } | null, { message: string }>
  > {
    try {
      // First check if the user is registered at all
      const accountRow = await this.db
        .select({ userId: account.userId })
        .from(account)
        .where(
          and(
            eq(account.providerId, 'discord'),
            eq(account.accountId, discordId),
          ),
        )
        .limit(1)
        .get()

      if (!accountRow) {
        return Result.ok(null)
      }

      // Check for at least one non-expired session
      const now = new Date()
      const sessionRow = await this.db
        .select({ id: session.id })
        .from(session)
        .where(
          and(
            eq(session.userId, accountRow.userId),
            gt(session.expiresAt, now),
          ),
        )
        .limit(1)
        .get()

      return Result.ok({
        userId: accountRow.userId,
        hasSession: sessionRow !== undefined,
      })
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown DB error'
      logger.error('Failed to check active session', {
        discordId,
        error: message,
      })
      return Result.err({ message })
    }
  }

  /**
   * Finds a user by their internal ID.
   * Used by the worker to fetch the user's email address.
   */
  async findById(
    userId: string,
  ): Promise<
    Result<
      { id: string; name: string; email: string } | null,
      { message: string }
    >
  > {
    try {
      const row = await this.db
        .select({ id: user.id, name: user.name, email: user.email })
        .from(user)
        .where(eq(user.id, userId))
        .limit(1)
        .get()

      return Result.ok(row ?? null)
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown DB error'
      logger.error('Failed to find user by ID', { userId, error: message })
      return Result.err({ message })
    }
  }

  /**
   * Deleta todas as sessões do usuário vinculado ao Discord ID.
   * Equivalente ao hard-delete que Better Auth faz no signOut.
   * Retorna `true` se as sessões foram deletadas, `null` se o account não existe.
   */
  async deleteSessionsByDiscordId(
    discordId: string,
  ): Promise<Result<boolean | null, { message: string }>> {
    try {
      const accountRow = await this.db
        .select({ userId: account.userId })
        .from(account)
        .where(
          and(
            eq(account.providerId, 'discord'),
            eq(account.accountId, discordId),
          ),
        )
        .limit(1)
        .get()

      if (!accountRow) {
        return Result.ok(null)
      }

      await this.db
        .delete(session)
        .where(eq(session.userId, accountRow.userId))
        .run()

      logger.info('Sessions deleted for user', {
        discordId,
        userId: accountRow.userId,
      })

      return Result.ok(true)
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown DB error'
      logger.error('Failed to delete sessions by Discord ID', {
        discordId,
        error: message,
      })
      return Result.err({ message })
    }
  }
}
