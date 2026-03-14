import { Module } from '@nestjs/common'
import { AuthModule as BetterAuthModule } from '@thallesp/nestjs-better-auth'
import { DatabaseModule } from '../../shared/database/database.module'
import { EnvModule } from '../../shared/env/env.module'
import { AuthController } from './auth.controller'
import { BetterAuthFactory } from './better-auth.factory'

@Module({
  imports: [
    BetterAuthModule.forRootAsync({
      imports: [EnvModule, DatabaseModule],
      inject: [BetterAuthFactory],
      useFactory: (betterAuthFactory: BetterAuthFactory) => ({
        auth: betterAuthFactory.create(),
        disableTrustedOriginsCors: true,
      }),
    }),
  ],
  providers: [BetterAuthFactory],
  controllers: [AuthController],
  exports: [BetterAuthModule],
})
export class StandupAuthModule {}
