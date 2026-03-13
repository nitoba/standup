import { Injectable, Logger } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { EnvService } from '../../shared/env/env.service'

@Injectable()
export class WorkerSchedulerService {
  private readonly logger = new Logger(WorkerSchedulerService.name)

  constructor(private readonly env: EnvService) {}

  @Cron(CronExpression.EVERY_MINUTE, { name: 'standup-scheduler-poll' })
  handleSchedulerTick(): void {
    if (!this.env.worker.schedulerEnabled) {
      return
    }

    this.logger.debug('Tick do scheduler executado')
  }
}
