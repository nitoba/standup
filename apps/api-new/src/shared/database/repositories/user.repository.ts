import { Injectable } from '@nestjs/common'
import { Result } from '@standup/domain'
import { createServiceLogger } from '@standup/logger'
import { and, eq, gt } from 'drizzle-orm'
import { DatabaseService } from '../database.service'
import { account, session, user } from '../schema'

const logger = createServiceLogger({
  service: 'api-new',
  component: 'user-repository',
})

@Injectable()
export class UserRepository {
  constructor(private readonly database: DatabaseService) {}

  async findUserIdByDiscordId(
    discordId: string,
  ): Promise<Result<string | null, { message: string }>> {
    try {
      const row = await this.database.db
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

  async findDiscordIdByUserId(
    userId: string,
  ): Promise<Result<string | null, { message: string }>> {
    try {
      const row = await this.database.db
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

  async findByDiscordId(discordId: string): Promise<
    Result<
      {
        id: string
        name: string
        email: string
        image: string | null
        discordId: string
      } | null,
      { message: string }
    >
  > {
    try {
      const row = await this.database.db
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
        .get()

      return Result.ok(row ?? null)
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

  async hasActiveSession(
    discordId: string,
  ): Promise<
    Result<{ userId: string; hasSession: boolean } | null, { message: string }>
  > {
    try {
      const accountRow = await this.database.db
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

      const sessionRow = await this.database.db
        .select({ id: session.id })
        .from(session)
        .where(
          and(
            eq(session.userId, accountRow.userId),
            gt(session.expiresAt, new Date()),
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

  async findById(
    userId: string,
  ): Promise<
    Result<
      { id: string; name: string; email: string } | null,
      { message: string }
    >
  > {
    try {
      const row = await this.database.db
        .select({ id: user.id, name: user.name, email: user.email })
        .from(user)
        .where(eq(user.id, userId))
        .limit(1)
        .get()

      return Result.ok(row ?? null)
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown DB error'

      logger.error('Failed to find user by ID', {
        userId,
        error: message,
      })

      return Result.err({ message })
    }
  }

  async deleteSessionsByDiscordId(
    discordId: string,
  ): Promise<Result<boolean | null, { message: string }>> {
    try {
      const accountRow = await this.database.db
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

      await this.database.db
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
