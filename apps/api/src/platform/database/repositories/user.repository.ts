import { Injectable } from '@nestjs/common'
import { and, eq, gt } from 'drizzle-orm'
import { DbError, Result } from '../../../shared/domain'
import { AppLoggerFactory } from '../../logger'
import { DatabaseService } from '../database.service'
import { account, session, user } from '../schema'

@Injectable()
export class UserRepository {
  private readonly logger: ReturnType<AppLoggerFactory['create']>

  constructor(
    private readonly loggerFactory: AppLoggerFactory,
    private readonly database: DatabaseService,
  ) {
    this.logger = this.loggerFactory.create('user-repository')
  }

  private dbErr(operation: string, error: unknown): Result<never, DbError> {
    const message = error instanceof Error ? error.message : 'Unknown DB error'

    this.logger.error(`Failed to ${operation}`, {
      error: message,
    })

    return Result.err(new DbError({ operation, message }))
  }

  async findUserIdByDiscordId(
    discordId: string,
  ): Promise<Result<string | null, DbError>> {
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
      return this.dbErr('findUserIdByDiscordId', error)
    }
  }

  async findDiscordIdByUserId(
    userId: string,
  ): Promise<Result<string | null, DbError>> {
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
      return this.dbErr('findDiscordIdByUserId', error)
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
      DbError
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
      return this.dbErr('findByDiscordId', error)
    }
  }

  async hasActiveSession(
    discordId: string,
  ): Promise<Result<{ userId: string; hasSession: boolean } | null, DbError>> {
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
      return this.dbErr('hasActiveSession', error)
    }
  }

  async findById(
    userId: string,
  ): Promise<
    Result<{ id: string; name: string; email: string } | null, DbError>
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
      return this.dbErr('findById', error)
    }
  }

  async deleteSessionsByDiscordId(
    discordId: string,
  ): Promise<Result<boolean | null, DbError>> {
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

      this.logger.info('Sessions deleted for user', {
        discordId,
        userId: accountRow.userId,
      })

      return Result.ok(true)
    } catch (error) {
      return this.dbErr('deleteSessionsByDiscordId', error)
    }
  }
}
