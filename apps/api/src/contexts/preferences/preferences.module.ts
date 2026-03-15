import { Module } from '@nestjs/common'
import { DatabaseModule } from '../../platform/database/database.module'
import { MeSettingsController } from './me/me-settings.controller'
import { MeSettingsService } from './me/me-settings.service'

@Module({
  imports: [DatabaseModule],
  controllers: [MeSettingsController],
  providers: [MeSettingsService],
})
export class PreferencesModule {}
