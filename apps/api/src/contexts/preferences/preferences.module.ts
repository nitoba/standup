import { Module } from '@nestjs/common'
import { DatabaseModule } from '../../platform/database/database.module'
import { AzureDevopsRestClientService } from '../standups/worker/azure-devops/azure-devops-rest-client.service'
import { WorkerRuntimeConfigModule } from '../standups/worker/worker-runtime-config.module'
import { MeSettingsController } from './me/me-settings.controller'
import { MeSettingsService } from './me/me-settings.service'

@Module({
  imports: [DatabaseModule, WorkerRuntimeConfigModule],
  controllers: [MeSettingsController],
  providers: [MeSettingsService, AzureDevopsRestClientService],
})
export class PreferencesModule {}
