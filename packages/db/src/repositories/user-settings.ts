import { DbError, Result } from '@standup/domain'
import { createServiceLogger } from '@standup/logger'
import { eq, lt } from 'drizzle-orm'
import type { Db } from '../connection.js'
import { type UserSettingsRow, userSettings } from '../schema.js'

const logger = createServiceLogger({
  service: 'db',
  component: 'user-settings-repository',
})

export interface UpsertUserSettingsInput {
  userId: string
  standupCron?: string
  reminderCron?: string
  recoveryCron?: string
  timezone?: string
  /** JSON-stringified array of selected repo names, e.g. '["repo-a","repo-b"]' */
  selectedRepos?: string
  gitAuthor: string
  active?: boolean
}

function dbErr(error: unknown, operation: string): DbError {
  const message = error instanceof Error ? error.message : 'Unknown DB error'
  logger.error(`Failed to ${operation}`, { error: message })
  return new DbError({ operation, message: `${operation}: ${message}` })
}

export class UserSettingsRepository {
  constructor(private db: Db) {}

  findByUserId(userId: string): Result<UserSettingsRow | null, DbError> {
    try {
      const row = this.db
        .select()
        .from(userSettings)
        .where(eq(userSettings.userId, userId))
        .limit(1)
        .get()

      return Result.ok(row ?? null)
    } catch (error) {
      return Result.err(dbErr(error, 'findByUserId'))
    }
  }

  findAllActive(): Result<UserSettingsRow[], DbError> {
    try {
      const rows = this.db
        .select()
        .from(userSettings)
        .where(eq(userSettings.active, true))
        .all()

      return Result.ok(rows)
    } catch (error) {
      return Result.err(dbErr(error, 'findAllActive'))
    }
  }

  upsert(input: UpsertUserSettingsInput): Result<UserSettingsRow, DbError> {
    try {
      const now = Date.now()
      const id = crypto.randomUUID()

      const row = this.db
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
          active: input.active ?? true,
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
            ...(input.timezone !== undefined && { timezone: input.timezone }),
            ...(input.selectedRepos !== undefined && {
              selectedRepos: input.selectedRepos,
            }),
            gitAuthor: input.gitAuthor,
            ...(input.active !== undefined && { active: input.active }),
            updatedAt: now,
          },
        })
        .returning()
        .get()

      return Result.ok(row)
    } catch (error) {
      return Result.err(dbErr(error, 'upsert'))
    }
  }

  async updateSnoozedUntil(
    userId: string,
    snoozedUntil: number | null,
  ): Promise<Result<void, DbError>> {
    try {
      await this.db
        .update(userSettings)
        .set({ snoozedUntil, updatedAt: Date.now() })
        .where(eq(userSettings.userId, userId))

      return Result.ok(undefined)
    } catch (error) {
      return Result.err(dbErr(error, 'updateSnoozedUntil'))
    }
  }

  async updateCancelledDate(
    userId: string,
    cancelledDate: string | null,
  ): Promise<Result<void, DbError>> {
    try {
      await this.db
        .update(userSettings)
        .set({ cancelledDate, updatedAt: Date.now() })
        .where(eq(userSettings.userId, userId))

      return Result.ok(undefined)
    } catch (error) {
      return Result.err(dbErr(error, 'updateCancelledDate'))
    }
  }

  async clearExpiredSnoozes(): Promise<Result<number, DbError>> {
    try {
      const now = Date.now()
      const expiredRows = this.db
        .select({ id: userSettings.id })
        .from(userSettings)
        .where(lt(userSettings.snoozedUntil, now))
        .all()

      if (expiredRows.length > 0) {
        await this.db
          .update(userSettings)
          .set({ snoozedUntil: null, updatedAt: now })
          .where(lt(userSettings.snoozedUntil, now))
      }

      return Result.ok(expiredRows.length)
    } catch (error) {
      return Result.err(dbErr(error, 'clearExpiredSnoozes'))
    }
  }
}
