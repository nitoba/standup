import { Module } from '@nestjs/common'
import { AuthModule as BetterAuthModule } from '@thallesp/nestjs-better-auth'
import { DatabaseService } from '../../platform/database/database.service'
import { EnvService } from '../../platform/env/env.service'
import { AuthController } from './auth.controller'
import { BetterAuthFactory } from './better-auth.factory'

@Module({
  imports: [
    BetterAuthModule.forRootAsync({
      inject: [EnvService, DatabaseService],
      useFactory: (env: EnvService, db: DatabaseService) => {
        const factory = new BetterAuthFactory(env, db)
        return {
          auth: factory.create(),
          disableTrustedOriginsCors: true,
          // Skip library's NestMiddleware.configure() — its httpAdapter.use()
          // is incompatible with the Hono adapter (empty path never matches,
          // and getNodeRequest returns HonoRequest instead of IncomingMessage).
          // Better Auth routes are mounted directly on Hono in main.ts instead.
          disableControllers: true,
        }
      },
    }),
  ],
  providers: [BetterAuthFactory],
  controllers: [AuthController],
  exports: [BetterAuthModule],
})
export class IdentityModule {}
