import { Module } from "@nestjs/common";
import { EmailClientService } from "./services/email-client.service";
import { WeeklyDigestEmailService } from "./services/weekly-digest-email.service";

@Module({
  providers: [EmailClientService, WeeklyDigestEmailService],
  exports: [EmailClientService, WeeklyDigestEmailService],
})
export class EmailModule {}
