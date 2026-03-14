import { Injectable } from '@nestjs/common'
import { InjectClient } from '@sixaphone/nestjs-drizzle'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import * as schema from './schema'

export type StandupDatabase = LibSQLDatabase<typeof schema>

@Injectable()
export class DatabaseService {
  constructor(@InjectClient() private readonly drizzleClient: unknown) {}

  get db(): StandupDatabase {
    return this.drizzleClient as StandupDatabase
  }
}
