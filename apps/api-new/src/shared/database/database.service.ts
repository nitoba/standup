import { Injectable } from '@nestjs/common'
import { type DrizzleDatabase, InjectClient } from '@sixaphone/nestjs-drizzle'
import * as schema from './schema'

export type StandupDatabase = DrizzleDatabase<'sqlite', typeof schema>

@Injectable()
export class DatabaseService {
  constructor(
    @InjectClient() private readonly drizzleClient: StandupDatabase,
  ) {}

  get db(): StandupDatabase {
    return this.drizzleClient
  }
}
