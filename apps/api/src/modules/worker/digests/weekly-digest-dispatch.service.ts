import { Injectable } from '@nestjs/common'
import { AppLoggerFactory } from '../../../shared/module/logger'
import {
  RunWeeklyDigestJobService,
  type WeeklyDigestJobOptions,
} from './run-weekly-digest-job.service'

@Injectable()
export class WeeklyDigestDispatchService {
  private readonly logger: ReturnType<AppLoggerFactory['create']>
  constructor(
    private readonly loggerFactory: AppLoggerFactory,
    private readonly weeklyDigestJob: RunWeeklyDigestJobService,
  ) {
    this.logger = this.loggerFactory.create('weekly-digest-dispatch')
  }

  dispatchWeeklyDigestJob(options: WeeklyDigestJobOptions): void {
    void this.weeklyDigestJob.run(options).catch((error: unknown) => {
      this.logger.error('Weekly digest job threw unexpectedly', {
        userId: options.userId,
        error: error instanceof Error ? error.message : String(error),
      })
    })
  }
}
