import { Injectable } from '@nestjs/common'
import { and, eq } from 'drizzle-orm'
import type {
  CustomEntries,
  StandupRecord,
  StandupStatus,
} from '../../../shared/domain'
import {
  DbError,
  InvalidStateTransitionError,
  NotFoundError,
  Result,
  transitionStandupStatus,
} from '../../../shared/domain'
import { AppLoggerFactory } from '../../logger'
import { DatabaseService } from '../database.service'
import { standups } from '../schema'
import {
  type CreateStandupInput,
  dbErr,
  type ReplaceGeneratedStandupInput,
  toRecord,
} from './standup-helpers'

@Injectable()
export class StandupWriteRepository {
  private readonly logger: ReturnType<AppLoggerFactory['create']>

  constructor(
    private readonly loggerFactory: AppLoggerFactory,
    private readonly database: DatabaseService,
  ) {
    this.logger = this.loggerFactory.create('standup-write-repository')
  }

  async create(
    input: CreateStandupInput,
  ): Promise<Result<StandupRecord, DbError>> {
    try {
      const now = Date.now()
      await this.database.db.insert(standups).values({
        id: input.id,
        date: input.date,
        meetingType: input.meetingType,
        content: input.content,
        sourceData: input.sourceData,
        status: 'draft',
        userId: input.userId,
        createdAt: now,
        updatedAt: now,
      })
      const created = await this.database.db
        .select()
        .from(standups)
        .where(eq(standups.id, input.id))
        .get()
      if (!created)
        return dbErr(
          this.logger,
          'create',
          new Error('insert succeeded but row not found'),
        )
      return Result.ok(toRecord(created))
    } catch (error) {
      return dbErr(this.logger, 'create', error)
    }
  }

  async updateStatus(
    id: string,
    nextStatus: StandupStatus,
  ): Promise<
    Result<StandupRecord, NotFoundError | DbError | InvalidStateTransitionError>
  > {
    try {
      const result = await this.database.db.transaction(async (tx) => {
        const row = await tx
          .select()
          .from(standups)
          .where(eq(standups.id, id))
          .get()
        if (!row)
          return Result.err(new NotFoundError({ resource: 'standup', id }))
        const transition = transitionStandupStatus(
          row.status as StandupStatus,
          nextStatus,
        )
        if (transition.isErr()) return transition
        const now = Date.now()
        await tx
          .update(standups)
          .set({ status: nextStatus, updatedAt: now })
          .where(eq(standups.id, id))
        return Result.ok({
          ...toRecord(row),
          status: nextStatus,
          updatedAt: now,
        })
      })
      return result
    } catch (error) {
      return dbErr(this.logger, 'updateStatus', error)
    }
  }

  async updateStatusForUser(
    id: string,
    userId: string,
    nextStatus: StandupStatus,
  ): Promise<
    Result<StandupRecord, NotFoundError | DbError | InvalidStateTransitionError>
  > {
    try {
      const result = await this.database.db.transaction(async (tx) => {
        const row = await tx
          .select()
          .from(standups)
          .where(and(eq(standups.id, id), eq(standups.userId, userId)))
          .get()
        if (!row)
          return Result.err(new NotFoundError({ resource: 'standup', id }))
        const transition = transitionStandupStatus(
          row.status as StandupStatus,
          nextStatus,
        )
        if (transition.isErr()) return transition
        const now = Date.now()
        await tx
          .update(standups)
          .set({ status: nextStatus, updatedAt: now })
          .where(and(eq(standups.id, id), eq(standups.userId, userId)))
        return Result.ok({
          ...toRecord(row),
          status: nextStatus,
          updatedAt: now,
        })
      })
      return result
    } catch (error) {
      return dbErr(this.logger, 'updateStatusForUser', error)
    }
  }

  async approveForUser(
    id: string,
    userId: string,
    mergedContent: string | null,
    customEntries: CustomEntries | null,
  ): Promise<
    Result<StandupRecord, NotFoundError | DbError | InvalidStateTransitionError>
  > {
    try {
      return await this.database.db.transaction(async (tx) => {
        const row = await tx
          .select()
          .from(standups)
          .where(and(eq(standups.id, id), eq(standups.userId, userId)))
          .get()
        if (!row)
          return Result.err(new NotFoundError({ resource: 'standup', id }))
        const transition = transitionStandupStatus(
          row.status as StandupStatus,
          'approved',
        )
        if (transition.isErr()) return transition
        const now = Date.now()
        const serializedEntries = customEntries
          ? JSON.stringify(customEntries)
          : row.customEntries
        await tx
          .update(standups)
          .set({
            status: 'approved',
            content: mergedContent ?? row.content,
            customEntries: serializedEntries,
            updatedAt: now,
          })
          .where(and(eq(standups.id, id), eq(standups.userId, userId)))
        return Result.ok(
          toRecord({
            ...row,
            status: 'approved',
            content: mergedContent ?? row.content,
            customEntries: serializedEntries,
            updatedAt: now,
          }),
        )
      })
    } catch (error) {
      return dbErr(this.logger, 'approveForUser', error)
    }
  }

  async updateDmMessageId(
    id: string,
    dmMessageId: string,
  ): Promise<Result<StandupRecord, NotFoundError | DbError>> {
    try {
      const found = await this.findById(id)
      if (found.isErr()) return found
      const now = Date.now()
      await this.database.db
        .update(standups)
        .set({ dmMessageId, updatedAt: now })
        .where(eq(standups.id, id))
      return Result.ok({ ...found.value, dmMessageId, updatedAt: now })
    } catch (error) {
      return dbErr(this.logger, 'updateDmMessageId', error)
    }
  }

  async updateSentToDiscordAt(
    id: string,
  ): Promise<Result<StandupRecord, NotFoundError | DbError>> {
    try {
      const found = await this.findById(id)
      if (found.isErr()) return found
      const now = Date.now()
      await this.database.db
        .update(standups)
        .set({ sentToDiscordAt: now, updatedAt: now })
        .where(eq(standups.id, id))
      return Result.ok({ ...found.value, sentToDiscordAt: now, updatedAt: now })
    } catch (error) {
      return dbErr(this.logger, 'updateSentToDiscordAt', error)
    }
  }

  async replaceGeneratedForUser(
    id: string,
    userId: string,
    input: ReplaceGeneratedStandupInput,
  ): Promise<Result<StandupRecord, NotFoundError | DbError>> {
    try {
      const found = await this.findByIdForUser(id, userId)
      if (found.isErr()) return found
      const now = Date.now()
      await this.database.db
        .update(standups)
        .set({
          meetingType: input.meetingType,
          content: input.content,
          sourceData: input.sourceData,
          customEntries: null,
          status: 'draft',
          updatedAt: now,
        })
        .where(and(eq(standups.id, id), eq(standups.userId, userId)))
      return Result.ok({
        ...found.value,
        meetingType: input.meetingType,
        content: input.content,
        sourceData: input.sourceData,
        customEntries: null,
        status: 'draft',
        updatedAt: now,
      })
    } catch (error) {
      return dbErr(this.logger, 'replaceGeneratedForUser', error)
    }
  }

  private async findById(
    id: string,
  ): Promise<Result<StandupRecord, NotFoundError | DbError>> {
    try {
      const row = await this.database.db
        .select()
        .from(standups)
        .where(eq(standups.id, id))
        .get()
      if (!row)
        return Result.err(new NotFoundError({ resource: 'standup', id }))
      return Result.ok(toRecord(row))
    } catch (error) {
      return dbErr(this.logger, 'findById', error)
    }
  }

  private async findByIdForUser(
    id: string,
    userId: string,
  ): Promise<Result<StandupRecord, NotFoundError | DbError>> {
    try {
      const row = await this.database.db
        .select()
        .from(standups)
        .where(and(eq(standups.id, id), eq(standups.userId, userId)))
        .get()
      if (!row)
        return Result.err(new NotFoundError({ resource: 'standup', id }))
      return Result.ok(toRecord(row))
    } catch (error) {
      return dbErr(this.logger, 'findByIdForUser', error)
    }
  }
}
