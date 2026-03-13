import { Module } from '@nestjs/common'
import { AuthModule as BetterAuthModule } from '@thallesp/nestjs-better-auth'
import { DatabaseModule } from '../../shared/database/database.module'
import { DatabaseService } from '../../shared/database/database.service'
import { EnvModule } from '../../shared/env/env.module'
import { EnvService } from '../../shared/env/env.service'
import { AuthController } from './auth.controller'
import { createBetterAuth } from './create-auth'

@Module({
  imports: [
    BetterAuthModule.forRootAsync({
      imports: [EnvModule, DatabaseModule],
      inject: [EnvService, DatabaseService],
      useFactory: (env: EnvService, database: DatabaseService) => ({
        auth: createBetterAuth({
          env,
          db: database.db,
        }),
        disableTrustedOriginsCors: true,
      }),
    }),
  ],
  controllers: [AuthController],
  exports: [BetterAuthModule],
})
export class StandupAuthModule {}
