import { Injectable } from '@nestjs/common'
import { createServiceLogger } from '@standup/logger'
import {
  RunWeeklyDigestJobService,
  type WeeklyDigestJobOptions,
} from './run-weekly-digest-job.service'

const logger = createServiceLogger({
  service: 'api-new',
  component: 'weekly-digest-dispatch',
})

@Injectable()
export class WeeklyDigestDispatchService {
  constructor(private readonly weeklyDigestJob: RunWeeklyDigestJobService) {}

  dispatchWeeklyDigestJob(options: WeeklyDigestJobOptions): void {
    void this.weeklyDigestJob.run(options).catch((error: unknown) => {
      logger.error('Weekly digest job threw unexpectedly', {
        userId: options.userId,
        error: error instanceof Error ? error.message : String(error),
      })
    })
  }
}
