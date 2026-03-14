import { Inject, Injectable } from '@nestjs/common'
import { WINSTON_MODULE_PROVIDER } from 'nest-winston'
import type { Logger } from 'winston'
import type { LoggerMeta } from './logger.types'

@Injectable()
export class AppLoggerFactory {
  constructor(
    @Inject(WINSTON_MODULE_PROVIDER)
    private readonly rootLogger: Logger,
  ) {}

  create(component: string, defaultMeta: LoggerMeta = {}): Logger {
    return this.rootLogger.child({
      service: 'standup-api',
      component,
      ...defaultMeta,
    })
  }
}
