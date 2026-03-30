import { type DynamicModule, Global, Module } from '@nestjs/common'
import { DrizzleModule } from '@sixaphone/nestjs-drizzle'
import type { Table } from 'drizzle-orm'
import { EnvModule } from '../env/env.module'
import { EnvService } from '../env/env.service'
import { DatabaseService } from './database.service'
import { JobRunRepository } from './repositories/job-run.repository'
import { StandupRepository } from './repositories/standup.repository'
import { UserRepository } from './repositories/user.repository'
import { UserSettingsRepository } from './repositories/user-settings.repository'
import { WeeklyDigestRepository } from './repositories/weekly-digest.repository'
import * as schema from './schema'

// @sixaphone/nestjs-drizzle expects Record<string, Table> but our generated
// schema exports SQLiteTableWithColumns<...> objects. The structural shape is
// compatible at runtime; the cast is required to satisfy the library signature.
// Intentional: if @sixaphone/nestjs-drizzle improves its types, remove this
// cast and verify that TypeScript still accepts the module (TAS-73).
const drizzleSchema = schema as unknown as Record<string, Table>

// DrizzleModule.forRootAsync() + useFactory types are incompatible with strict
// NestJS generic inference. Intentional cast until upstream fixes typings (TAS-73).
const drizzleRootModule = DrizzleModule.forRootAsync({
  imports: [EnvModule],
  inject: [EnvService],
  useFactory: ((env: EnvService) => ({
    type: 'sqlite',
    url: env.database.url,
    authToken: env.database.authToken,
    schema: drizzleSchema,
  })) as never,
}) as unknown as DynamicModule

@Global()
@Module({
  imports: [EnvModule, drizzleRootModule],
  providers: [
    DatabaseService,
    StandupRepository,
    JobRunRepository,
    UserRepository,
    UserSettingsRepository,
    WeeklyDigestRepository,
  ],
  exports: [
    DrizzleModule,
    DatabaseService,
    StandupRepository,
    JobRunRepository,
    UserRepository,
    UserSettingsRepository,
    WeeklyDigestRepository,
  ],
})
export class DatabaseModule {}
