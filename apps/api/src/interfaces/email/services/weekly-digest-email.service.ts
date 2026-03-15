import { Injectable } from '@nestjs/common'
import { EnvService } from '../../../platform/env/env.service'
import { LocalDateService } from '../../../platform/time/local-date.service'
import {
  renderWeeklyDigest,
  renderWeeklyDigestText,
} from '../templates/weekly-digest'
import { markdownToEmailHtml } from '../utils/markdown-to-email-html'
import { type EmailThemeKey, getTheme } from '../utils/theme'
import type { SendEmailInput } from './email-client.service'

export interface ComposeWeeklyDigestEmailInput {
  to: string
  recipientName: string
  weekStart: string
  weekEnd: string
  timezone: string
  standupCount: number
  insightsMarkdown: string
  emailTheme?: EmailThemeKey
}

@Injectable()
export class WeeklyDigestEmailService {
  constructor(
    private readonly env: EnvService,
    private readonly localDateService: LocalDateService,
  ) {}

  async composeEmail(
    input: ComposeWeeklyDigestEmailInput,
  ): Promise<SendEmailInput> {
    const theme = getTheme(input.emailTheme ?? 'dark')
    const weekStartDisplay = this.localDateService.formatIsoForTimezone(
      input.weekStart,
      input.timezone,
    )
    const weekEndDisplay = this.localDateService.formatIsoForTimezone(
      input.weekEnd,
      input.timezone,
    )
    const weekLabel = this.formatWeekLabel(weekStartDisplay, weekEndDisplay)
    const appUrl = this.env.app.appUrl
    const unsubscribeUrl = `${appUrl}/settings?unsubscribe=digest`
    const insightsHtml = await markdownToEmailHtml(
      input.insightsMarkdown,
      theme,
    )

    const digestData = {
      recipientName: input.recipientName,
      weekLabel,
      weekStart: weekStartDisplay,
      weekEnd: weekEndDisplay,
      standupCount: input.standupCount,
      insightsHtml,
      appUrl,
      unsubscribeUrl,
    }

    return {
      to: input.to,
      subject: `Resumo da semana ${weekStartDisplay} -> ${weekEndDisplay}`,
      html: renderWeeklyDigest(digestData, theme),
      text: renderWeeklyDigestText(digestData),
      unsubscribeUrl,
    }
  }

  private formatWeekLabel(weekStart: string, weekEnd: string): string {
    const endYear = weekEnd.split('/')[2] ?? ''
    return `${this.formatShortDate(weekStart)} a ${this.formatShortDate(weekEnd)}/${endYear}`
  }

  private formatShortDate(date: string): string {
    const [dd, mm] = date.split('/')
    return `${dd}/${mm}`
  }
}
