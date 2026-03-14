import { Injectable } from '@nestjs/common'
import { Span } from 'nestjs-otel'
import { StandupRepository } from '../../../shared/database/repositories/standup.repository'
import { UserRepository } from '../../../shared/database/repositories/user.repository'
import { UserSettingsRepository } from '../../../shared/database/repositories/user-settings.repository'
import { WeeklyDigestRepository } from '../../../shared/database/repositories/weekly-digest.repository'
import { AppLoggerFactory } from '../../../shared/logger'
import { AppTracingService } from '../../../shared/observability/app-tracing.service'
import { EmailClientService } from '../../email/email-client.service'
import { WeeklyDigestEmailService } from '../../email/weekly-digest-email.service'
import { StandupGeneratorService } from '../standup-generator/standup-generator.service'

function getPreviousWeekStart(now: Date): string {
  const day = now.getDay()
  const daysToLastMonday = day === 0 ? 13 : day + 6
  const monday = new Date(now)
  monday.setDate(now.getDate() - daysToLastMonday)
  return monday.toISOString().slice(0, 10)
}

function getPreviousWeekEnd(weekStart: string): string {
  const monday = new Date(`${weekStart}T00:00:00Z`)
  const friday = new Date(monday)
  friday.setDate(monday.getDate() + 4)
  return friday.toISOString().slice(0, 10)
}

export interface WeeklyDigestJobOptions {
  userId: string
}

@Injectable()
export class RunWeeklyDigestJobService {
  private readonly logger: ReturnType<AppLoggerFactory['create']>

  constructor(
    private readonly loggerFactory: AppLoggerFactory,
    private readonly emailClient: EmailClientService,
    private readonly weeklyDigestEmail: WeeklyDigestEmailService,
    private readonly digestRepository: WeeklyDigestRepository,
    private readonly standupRepository: StandupRepository,
    private readonly userRepository: UserRepository,
    private readonly userSettingsRepository: UserSettingsRepository,
    private readonly standupGenerator: StandupGeneratorService,
    private readonly tracing: AppTracingService,
  ) {
    this.logger = this.loggerFactory.create('weekly-digest-job')
  }

  @Span('worker.digest.job.run')
  async run(options: WeeklyDigestJobOptions): Promise<void> {
    const runId = crypto.randomUUID()
    const now = new Date()
    const weekStart = getPreviousWeekStart(now)
    const weekEnd = getPreviousWeekEnd(weekStart)

    const jobLogger = this.logger.child({
      job: 'weekly-digest',
      run: runId,
      userId: options.userId,
      weekStart,
      weekEnd,
    })

    if (!this.emailClient.isConfigured()) {
      jobLogger.warn('SMTP not configured. Weekly digest skipped.')
      return
    }

    const existingResult = await this.digestRepository.findByUserAndWeek(
      options.userId,
      weekStart,
    )
    if (existingResult.isErr()) {
      jobLogger.error(existingResult.error.message)
      return
    }

    const existingStatus = existingResult.value?.status
    if (
      existingStatus === 'sent' ||
      existingStatus === 'unknown' ||
      existingStatus === 'skipped'
    ) {
      return
    }

    if (!existingResult.value) {
      const createResult = await this.digestRepository.create({
        id: crypto.randomUUID(),
        userId: options.userId,
        weekStart,
        weekEnd,
        standupIds: [],
        insights: '',
        status: 'pending',
      })

      if (createResult.isErr()) {
        jobLogger.error(createResult.error.message)
        return
      }
    }

    const claimResult = await this.digestRepository.claimForSending(
      options.userId,
      weekStart,
    )
    if (claimResult.isErr() || !claimResult.value) {
      return
    }

    const digestId = claimResult.value.id
    const standupsResult = await this.tracing.withSpan(
      'digest.db.find_standups',
      {
        'digest.user_id': options.userId,
        'digest.week_start': weekStart,
        'digest.week_end': weekEnd,
      },
      () =>
        this.standupRepository.findApprovedByUserAndDateRange(
          options.userId,
          weekStart,
          weekEnd,
        ),
    )

    if (standupsResult.isErr()) {
      await this.digestRepository.markFailed(
        digestId,
        standupsResult.error.message,
      )
      return
    }

    if (standupsResult.value.length === 0) {
      await this.digestRepository.markSkipped(digestId)
      return
    }

    const userResult = await this.userRepository.findById(options.userId)
    if (userResult.isErr()) {
      await this.digestRepository.markFailed(digestId, userResult.error.message)
      return
    }

    const userEmail = userResult.value?.email
    if (!userEmail) {
      await this.digestRepository.markSkipped(digestId)
      return
    }

    const settingsResult = await this.userSettingsRepository.findByUserId(
      options.userId,
    )
    const emailTheme =
      settingsResult.isOk() && settingsResult.value?.emailTheme
        ? settingsResult.value.emailTheme
        : 'dark'

    const insightsResult = await this.tracing.withSpan(
      'digest.llm.generate',
      {
        'digest.standup_count': standupsResult.value.length,
        'digest.week_start': weekStart,
        'digest.week_end': weekEnd,
      },
      () => this.standupGenerator.generateWeeklyInsights(standupsResult.value),
    )

    if (insightsResult.isErr()) {
      await this.digestRepository.markFailed(
        digestId,
        insightsResult.error.message,
      )
      return
    }

    const saveContentResult = await this.digestRepository.saveContent(
      digestId,
      standupsResult.value.map((standup) => standup.id),
      insightsResult.value,
    )

    if (saveContentResult.isErr()) {
      await this.digestRepository.markFailed(
        digestId,
        saveContentResult.error.message,
      )
      return
    }

    const userName = userResult.value?.name ?? 'Desenvolvedor'
    const emailPayload = await this.tracing.withSpan(
      'digest.email.render',
      {
        'digest.week_start': weekStart,
        'digest.week_end': weekEnd,
      },
      () =>
        this.weeklyDigestEmail.composeEmail({
          to: userEmail,
          recipientName: userName,
          weekStart,
          weekEnd,
          standupCount: standupsResult.value.length,
          insightsMarkdown: insightsResult.value,
          emailTheme,
        }),
    )

    const sendResult = await this.tracing.withSpan(
      'digest.email.send',
      {
        'email.to': userEmail,
        'digest.id': digestId,
      },
      () => this.emailClient.sendEmail(emailPayload),
    )

    if (sendResult.isErr()) {
      await this.digestRepository.markFailed(digestId, sendResult.error.message)
      return
    }

    const markSentResult = await this.digestRepository.markSent(digestId)
    if (markSentResult.isErr()) {
      await this.digestRepository.markUnknown(
        digestId,
        markSentResult.error.message,
      )
      return
    }
  }
}
