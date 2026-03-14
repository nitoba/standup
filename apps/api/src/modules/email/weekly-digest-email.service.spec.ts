import { describe, expect, it } from 'vitest'
import { WeeklyDigestEmailService } from './weekly-digest-email.service'

describe('WeeklyDigestEmailService', () => {
  it('composes a weekly digest email using appUrl and theme from local services', async () => {
    const service = new WeeklyDigestEmailService({
      app: { appUrl: 'http://localhost:4200' },
    } as never)

    const email = await service.composeEmail({
      to: 'dev@example.com',
      recipientName: 'João',
      weekStart: '2026-03-10',
      weekEnd: '2026-03-14',
      standupCount: 2,
      insightsMarkdown: '# Insights\nSemana produtiva',
      emailTheme: 'dark',
    })

    expect(email.to).toBe('dev@example.com')
    expect(email.subject).toBe('Resumo da semana 2026-03-10 -> 2026-03-14')
    expect(email.unsubscribeUrl).toBe(
      'http://localhost:4200/settings?unsubscribe=digest',
    )
    expect(email.html).toContain('João')
    expect(email.html).toContain('10/03 a 14/03/2026')
    expect(email.html).toContain('Semana produtiva')
    expect(email.text).toContain('Semana produtiva')
  })
})
