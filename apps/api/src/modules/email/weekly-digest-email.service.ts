import { Injectable } from '@nestjs/common'
import { EnvService } from '../../shared/env/env.service'
import type { SendEmailInput } from './email-client.service'
import { markdownToEmailHtml } from './markdown-to-email-html'
import {
  renderWeeklyDigest,
  renderWeeklyDigestText,
} from './templates/weekly-digest'
import { type EmailThemeKey, getTheme } from './theme'

export interface ComposeWeeklyDigestEmailInput {
  to: string
  recipientName: string
  weekStart: string
  weekEnd: string
  standupCount: number
  insightsMarkdown: string
  emailTheme?: EmailThemeKey
}

@Injectable()
export class WeeklyDigestEmailService {
  constructor(private readonly env: EnvService) {}

  async composeEmail(
    input: ComposeWeeklyDigestEmailInput,
  ): Promise<SendEmailInput> {
    const theme = getTheme(input.emailTheme ?? 'dark')
    const weekLabel = this.formatWeekLabel(input.weekStart, input.weekEnd)
    const appUrl = this.env.app.appUrl
    const unsubscribeUrl = `${appUrl}/settings?unsubscribe=digest`
    const insightsHtml = await markdownToEmailHtml(
      input.insightsMarkdown,
      theme,
    )

    const digestData = {
      recipientName: input.recipientName,
      weekLabel,
      weekStart: input.weekStart,
      weekEnd: input.weekEnd,
      standupCount: input.standupCount,
      insightsHtml,
      appUrl,
      unsubscribeUrl,
    }

    return {
      to: input.to,
      subject: `Resumo da semana ${input.weekStart} -> ${input.weekEnd}`,
      html: renderWeeklyDigest(digestData, theme),
      text: renderWeeklyDigestText(digestData),
      unsubscribeUrl,
    }
  }

  private formatWeekLabel(weekStart: string, weekEnd: string): string {
    const endYear = weekEnd.split('-')[0] ?? ''
    return `${this.formatShortDate(weekStart)} a ${this.formatShortDate(weekEnd)}/${endYear}`
  }

  private formatShortDate(date: string): string {
    const [, mm, dd] = date.split('-')
    return `${dd}/${mm}`
  }
}
