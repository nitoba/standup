import { Global, Module } from '@nestjs/common'
import { WinstonModule } from 'nest-winston'
import { EnvModule } from '../env/env.module'
import { EnvService } from '../env/env.service'
import { AppLoggerFactory } from './app-logger.factory'
import { createWinstonOptions } from './create-winston-options'

@Global()
@Module({
  imports: [
    EnvModule,
    WinstonModule.forRootAsync({
      imports: [EnvModule],
      inject: [EnvService],
      useFactory: (envService: EnvService) =>
        createWinstonOptions({
          service: 'standup-api',
          nodeEnv: envService.app.nodeEnv,

        }),
    }),
  ],
  providers: [AppLoggerFactory],
  exports: [WinstonModule, AppLoggerFactory],
})
export class LoggerModule {}
