import { Global, Module } from '@nestjs/common'
import { LocalDateService } from './local-date.service'

@Global()
@Module({
  providers: [LocalDateService],
  exports: [LocalDateService],
})
export class TimeModule {}
