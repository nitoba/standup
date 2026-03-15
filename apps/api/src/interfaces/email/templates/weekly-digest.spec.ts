import { describe, expect, it } from 'vitest'
import { DARK_THEME, LIGHT_THEME } from '../utils/theme'
import type { WeeklyDigestData } from './weekly-digest'
import { renderWeeklyDigest, renderWeeklyDigestText } from './weekly-digest'

const sampleData: WeeklyDigestData = {
  recipientName: 'João',
  weekLabel: '10/03 a 14/03/2026',
  weekStart: '10/03/2026',
  weekEnd: '14/03/2026',
  standupCount: 2,
  insightsHtml: '<p>Semana produtiva com foco em melhorias de performance.</p>',
  appUrl: 'http://localhost:4200',
  unsubscribeUrl: 'http://localhost:4200/unsubscribe',
}

describe('renderWeeklyDigest', () => {
  it('produces valid DOCTYPE HTML', () => {
    const html = renderWeeklyDigest(sampleData, LIGHT_THEME)
    expect(html).toMatch(/^<!DOCTYPE html>/)
  })

  it('includes recipient name', () => {
    const html = renderWeeklyDigest(sampleData, LIGHT_THEME)
    expect(html).toContain('João')
  })

  it('includes week label', () => {
    const html = renderWeeklyDigest(sampleData, LIGHT_THEME)
    expect(html).toContain('10/03 a 14/03/2026')
  })

  it('includes standup count', () => {
    const html = renderWeeklyDigest(sampleData, LIGHT_THEME)
    expect(html).toContain('2 standups aprovados')
  })

  it('includes insights HTML', () => {
    const html = renderWeeklyDigest(sampleData, LIGHT_THEME)
    expect(html).toContain('Semana produtiva')
  })

  it('includes view button linking to weekly-digest with week range', () => {
    const html = renderWeeklyDigest(sampleData, LIGHT_THEME)
    expect(html).toContain(
      'http://localhost:4200/weekly-digest?from=10%2F03%2F2026&to=14%2F03%2F2026',
    )
    expect(html).toContain('Ver standups no app')
  })

  it('does not include individual standup cards', () => {
    const html = renderWeeklyDigest(sampleData, LIGHT_THEME)
    expect(html).not.toContain('Segunda-feira, 10/03')
    expect(html).not.toContain('Standups da Semana</h2>')
  })

  it('includes app URL and unsubscribe URL', () => {
    const html = renderWeeklyDigest(sampleData, LIGHT_THEME)
    expect(html).toContain('http://localhost:4200')
    expect(html).toContain('http://localhost:4200/unsubscribe')
  })

  it('applies dark theme colors in output', () => {
    const lightHtml = renderWeeklyDigest(sampleData, LIGHT_THEME)
    const darkHtml = renderWeeklyDigest(sampleData, DARK_THEME)
    expect(lightHtml).not.toBe(darkHtml)
    expect(darkHtml).toContain(DARK_THEME.headerBg)
  })

  it('output is under 100KB', () => {
    const html = renderWeeklyDigest(sampleData, LIGHT_THEME)
    const bytes = new TextEncoder().encode(html).length
    expect(bytes).toBeLessThan(100_000)
  })

  it('uses table layout', () => {
    const html = renderWeeklyDigest(sampleData, LIGHT_THEME)
    expect(html).toContain('<table')
    expect(html).not.toContain('display: flex')
    expect(html).not.toContain('display: grid')
  })
})

describe('renderWeeklyDigestText', () => {
  it('includes recipient name', () => {
    const text = renderWeeklyDigestText(sampleData)
    expect(text).toContain('João')
  })

  it('includes week label', () => {
    const text = renderWeeklyDigestText(sampleData)
    expect(text).toContain('10/03 a 14/03/2026')
  })

  it('strips HTML tags', () => {
    const text = renderWeeklyDigestText(sampleData)
    expect(text).not.toContain('<p>')
    expect(text).not.toContain('<strong>')
  })

  it('includes insights in plain text', () => {
    const text = renderWeeklyDigestText(sampleData)
    expect(text).toContain('Semana produtiva')
  })

  it('includes view URL with week range', () => {
    const text = renderWeeklyDigestText(sampleData)
    expect(text).toContain(
      'http://localhost:4200/weekly-digest?from=10%2F03%2F2026&to=14%2F03%2F2026',
    )
  })

  it('includes unsubscribe URL', () => {
    const text = renderWeeklyDigestText(sampleData)
    expect(text).toContain('http://localhost:4200/unsubscribe')
  })
})
