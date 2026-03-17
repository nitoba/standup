import { Injectable } from '@nestjs/common'
import { eq, lt } from 'drizzle-orm'
import { DbError, Result } from '../../../shared/domain'
import { AppLoggerFactory } from '../../logger'
import { DatabaseService } from '../database.service'
import { userSettings } from '../schema'

export interface UpsertUserSettingsInput {
  userId: string
  standupCron?: string
  reminderCron?: string
  recoveryCron?: string
  timezone?: string
  selectedRepos?: string
  gitAuthor: string
  gitSincePeriod?: string
  active?: boolean
  emailTheme?: 'light' | 'dark'
  azureDevopsUser?: string | null
}

@Injectable()
export class UserSettingsRepository {
  private readonly logger: ReturnType<AppLoggerFactory['create']>

  constructor(
    private readonly loggerFactory: AppLoggerFactory,
    private readonly database: DatabaseService,
  ) {
    this.logger = this.loggerFactory.create('user-settings-repository')
  }

  async findByUserId(
    userId: string,
  ): Promise<Result<typeof userSettings.$inferSelect | null, DbError>> {
    try {
      const row = await this.database.db
        .select()
        .from(userSettings)
        .where(eq(userSettings.userId, userId))
        .limit(1)
        .get()

      return Result.ok(row ?? null)
    } catch (error) {
      return Result.err(this.dbErr(error, 'findByUserId'))
    }
  }

  async findAllActive() {
    try {
      const rows = await this.database.db
        .select()
        .from(userSettings)
        .where(eq(userSettings.active, true))
        .all()

      return Result.ok(rows)
    } catch (error) {
      return Result.err(this.dbErr(error, 'findAllActive'))
    }
  }

  async upsert(
    input: UpsertUserSettingsInput,
  ): Promise<Result<typeof userSettings.$inferSelect, DbError>> {
    try {
      const now = Date.now()
      const id = crypto.randomUUID()

      const row = await this.database.db
        .insert(userSettings)
        .values({
          id,
          userId: input.userId,
          standupCron: input.standupCron ?? '30 17 * * 1-5',
          reminderCron: input.reminderCron ?? '20 17 * * 1-5',
          recoveryCron: input.recoveryCron ?? '0 18 * * 1-5',
          timezone: input.timezone ?? 'America/Sao_Paulo',
          selectedRepos: input.selectedRepos ?? '[]',
          gitAuthor: input.gitAuthor,
          gitSincePeriod: input.gitSincePeriod ?? '8 hours ago',
          active: input.active ?? true,
          emailTheme: input.emailTheme ?? 'dark',
          azureDevopsUser: input.azureDevopsUser ?? null,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: userSettings.userId,
          set: {
            ...(input.standupCron !== undefined && {
              standupCron: input.standupCron,
            }),
            ...(input.reminderCron !== undefined && {
              reminderCron: input.reminderCron,
            }),
            ...(input.recoveryCron !== undefined && {
              recoveryCron: input.recoveryCron,
            }),
            ...(input.timezone !== undefined && {
              timezone: input.timezone,
            }),
            ...(input.selectedRepos !== undefined && {
              selectedRepos: input.selectedRepos,
            }),
            gitAuthor: input.gitAuthor,
            ...(input.gitSincePeriod !== undefined && {
              gitSincePeriod: input.gitSincePeriod,
            }),
            ...(input.active !== undefined && {
              active: input.active,
            }),
            ...(input.emailTheme !== undefined && {
              emailTheme: input.emailTheme,
            }),
            ...(input.azureDevopsUser !== undefined && {
              azureDevopsUser: input.azureDevopsUser,
            }),
            updatedAt: now,
          },
        })
        .returning()
        .get()

      return Result.ok(row)
    } catch (error) {
      return Result.err(this.dbErr(error, 'upsert'))
    }
  }

  async updateSnoozedUntil(
    userId: string,
    snoozedUntil: number | null,
  ): Promise<Result<void, DbError>> {
    try {
      await this.database.db
        .update(userSettings)
        .set({ snoozedUntil, updatedAt: Date.now() })
        .where(eq(userSettings.userId, userId))

      return Result.ok(undefined)
    } catch (error) {
      return Result.err(this.dbErr(error, 'updateSnoozedUntil'))
    }
  }

  async updateCancelledDate(
    userId: string,
    cancelledDate: string | null,
  ): Promise<Result<void, DbError>> {
    try {
      await this.database.db
        .update(userSettings)
        .set({ cancelledDate, updatedAt: Date.now() })
        .where(eq(userSettings.userId, userId))

      return Result.ok(undefined)
    } catch (error) {
      return Result.err(this.dbErr(error, 'updateCancelledDate'))
    }
  }

  async clearExpiredSnoozes(): Promise<Result<number, DbError>> {
    try {
      const now = Date.now()
      const expiredRows = await this.database.db
        .select({ id: userSettings.id })
        .from(userSettings)
        .where(lt(userSettings.snoozedUntil, now))
        .all()

      if (expiredRows.length > 0) {
        await this.database.db
          .update(userSettings)
          .set({ snoozedUntil: null, updatedAt: now })
          .where(lt(userSettings.snoozedUntil, now))
      }

      return Result.ok(expiredRows.length)
    } catch (error) {
      return Result.err(this.dbErr(error, 'clearExpiredSnoozes'))
    }
  }

  private dbErr(error: unknown, operation: string): DbError {
    const message = error instanceof Error ? error.message : 'Unknown DB error'
    this.logger.error(`Failed to ${operation}`, { error: message })
    return new DbError({ operation, message: `${operation}: ${message}` })
  }
}
