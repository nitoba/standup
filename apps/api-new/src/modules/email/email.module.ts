import { Module } from '@nestjs/common'
import { EmailClientService } from './email-client.service'
import { WeeklyDigestEmailService } from './weekly-digest-email.service'

@Module({
  providers: [EmailClientService, WeeklyDigestEmailService],
  exports: [EmailClientService, WeeklyDigestEmailService],
})
export class EmailModule {}
