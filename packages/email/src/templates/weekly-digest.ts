// ---------------------------------------------------------------------------
// Weekly Digest Email Template
//
// Layout: table-based (required for Outlook compatibility).
// All CSS is inline — no <style> blocks.
// Max width: 600px (standard email width).
// No web fonts — system font stack only.
// Target size: < 100KB (Akita's anti-spam rule).
// ---------------------------------------------------------------------------

import { markdownToEmailHtml } from '../markdown-to-email-html.js'
import { type EmailTheme, getTheme } from '../theme.js'

const FONT_STACK =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"

export interface WeeklyDigestData {
  recipientName: string
  weekLabel: string // "10/03 a 14/03/2026"
  weekStart: string // YYYY-MM-DD
  weekEnd: string // YYYY-MM-DD
  standupCount: number // number of approved standups for the week
  insightsHtml: string // LLM-generated insights, already converted from markdown
  appUrl: string // link back to web app
  unsubscribeUrl: string // for List-Unsubscribe (RFC 8058)
}

function td(style: string, content: string): string {
  return `<td style="${style}">${content}</td>`
}

function row(content: string): string {
  return `<tr>${content}</tr>`
}

function spacer(height: number): string {
  return row(
    `<td style="font-size: 0; line-height: 0; height: ${height}px;">&nbsp;</td>`,
  )
}

function dividerRow(theme: EmailTheme): string {
  return row(
    `<td><hr style="border: none; border-top: 1px solid ${theme.divider}; margin: 0;" /></td>`,
  )
}

// ---------------------------------------------------------------------------
// Header section
// ---------------------------------------------------------------------------

function renderHeader(data: WeeklyDigestData, theme: EmailTheme): string {
  const titleStyle = `font-family: ${FONT_STACK}; font-size: 22px; font-weight: 700; color: ${theme.headerText}; margin: 0 0 4px 0; padding: 0;`
  const subtitleStyle = `font-family: ${FONT_STACK}; font-size: 13px; color: ${theme.headerText}; opacity: 0.85; margin: 0; padding: 0;`

  return row(
    td(
      `background: ${theme.headerBg}; padding: 28px 32px;`,
      `<h1 style="${titleStyle}">Resumo Semanal</h1>` +
        `<p style="${subtitleStyle}">${data.weekLabel} &bull; ${data.standupCount} standup${data.standupCount === 1 ? '' : 's'} aprovado${data.standupCount === 1 ? '' : 's'}</p>`,
    ),
  )
}

// ---------------------------------------------------------------------------
// Greeting
// ---------------------------------------------------------------------------

function renderGreeting(data: WeeklyDigestData, theme: EmailTheme): string {
  const greetingStyle = `font-family: ${FONT_STACK}; font-size: 15px; line-height: 1.5; color: ${theme.text}; margin: 0; padding: 0;`
  return row(
    td(
      `padding: 20px 28px 28px 28px; background: ${theme.cardBg}`,
      `<p style="${greetingStyle}">Ol&aacute;, <strong>${data.recipientName}</strong>! Aqui est&aacute; seu resumo de atividades da semana de <strong>${data.weekLabel}</strong>.</p>`,
    ),
  )
}

// ---------------------------------------------------------------------------
// AI Insights section
// ---------------------------------------------------------------------------

function renderInsights(data: WeeklyDigestData, theme: EmailTheme): string {
  const sectionTitleStyle = `font-family: ${FONT_STACK}; font-size: 11px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; color: ${theme.insightBorder}; margin: 0 0 12px 0; padding: 0;`
  const containerStyle = `background: ${theme.insightBg}; border-left: 3px solid ${theme.insightBorder}; border-radius: 0 4px 4px 0; padding: 16px 20px;`

  return row(
    td(
      'padding: 0;',
      `<div style="${containerStyle}">` +
        `<p style="${sectionTitleStyle}">&#129504; Insights da Semana</p>` +
        data.insightsHtml +
        '</div>',
    ),
  )
}

// ---------------------------------------------------------------------------
// View standups CTA button
// ---------------------------------------------------------------------------

function renderViewButton(data: WeeklyDigestData, theme: EmailTheme): string {
  const viewUrl = `${data.appUrl}/weekly-digest?from=${data.weekStart}&to=${data.weekEnd}`

  const labelStyle = `font-family: ${FONT_STACK}; font-size: 13px; font-weight: 600; letter-spacing: 0.5px; text-transform: uppercase; color: ${theme.textMuted}; margin: 0 0 16px 0; padding: 0; text-align: center;`
  const buttonStyle =
    `display: inline-block; background: ${theme.headerBg}; color: ${theme.text}; ` +
    `padding: 13px 32px; border-radius: 6px; font-family: ${FONT_STACK}; ` +
    'font-size: 15px; font-weight: 600; text-decoration: none; ' +
    'letter-spacing: 0.2px; line-height: 1;'

  return (
    spacer(8) +
    dividerRow(theme) +
    spacer(20) +
    row(
      td(
        'text-align: center;',
        `<p style="${labelStyle}">Standups da Semana</p>` +
          `<a href="${viewUrl}" style="${buttonStyle}">Ver standups no app &rarr;</a>`,
      ),
    ) +
    spacer(20)
  )
}

// ---------------------------------------------------------------------------
// Footer
// ---------------------------------------------------------------------------

function renderFooter(data: WeeklyDigestData, theme: EmailTheme): string {
  const footerStyle = `background: ${theme.footerBg}; padding: 20px 28px;`
  const textStyle = `font-family: ${FONT_STACK}; font-size: 12px; color: ${theme.textMuted}; margin: 0 0 6px 0; padding: 0; text-align: center;`
  const linkStyle = `color: ${theme.accent}; text-decoration: underline;`

  return (
    dividerRow(theme) +
    row(
      td(
        footerStyle,
        `<p style="${textStyle}">Gerado automaticamente pelo <a href="${data.appUrl}" style="${linkStyle}">Standup Bot</a></p>` +
          `<p style="${textStyle}"><a href="${data.unsubscribeUrl}" style="${linkStyle}">Cancelar digest semanal</a></p>`,
      ),
    )
  )
}

// ---------------------------------------------------------------------------
// Full template renderer
// ---------------------------------------------------------------------------

/**
 * Renders the full weekly digest email as a self-contained HTML string.
 * All CSS is inline — safe for all major email clients including Outlook.
 * Output is designed to be under 100KB for anti-spam compliance.
 */
export function renderWeeklyDigest(
  data: WeeklyDigestData,
  theme: EmailTheme,
): string {
  const body =
    renderHeader(data, theme) +
    renderGreeting(data, theme) +
    renderInsights(data, theme) +
    renderViewButton(data, theme) +
    renderFooter(data, theme)

  return (
    '<!DOCTYPE html>' +
    '<html lang="pt-BR">' +
    '<head>' +
    '<meta charset="UTF-8" />' +
    '<meta name="viewport" content="width=device-width, initial-scale=1.0" />' +
    '<meta http-equiv="X-UA-Compatible" content="IE=edge" />' +
    `<title>Resumo Semanal ${data.weekLabel}</title>` +
    '</head>' +
    `<body style="margin: 0; padding: 16px 0; background: ${theme.bg}; font-family: ${FONT_STACK};">` +
    // Outer wrapper table — centers content and limits width
    '<table width="100%" cellpadding="0" cellspacing="0" border="0">' +
    '<tr>' +
    '<td align="center" style="padding: 0;">' +
    // Inner content table — max 600px
    '<table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width: 600px; width: 100%;">' +
    body +
    '</table>' +
    '</td>' +
    '</tr>' +
    '</table>' +
    '</body>' +
    '</html>'
  )
}

// ---------------------------------------------------------------------------
// Plain-text fallback generator
// ---------------------------------------------------------------------------

/**
 * Generates a plain-text version of the digest for email clients that
 * don't support HTML, and as an anti-spam signal (text/html ratio).
 */
export function renderWeeklyDigestText(data: WeeklyDigestData): string {
  const viewUrl = `${data.appUrl}/weekly-digest?from=${data.weekStart}&to=${data.weekEnd}`

  const lines: string[] = [
    `RESUMO SEMANAL — ${data.weekLabel}`,
    '='.repeat(50),
    '',
    `Olá, ${data.recipientName}!`,
    '',
    'INSIGHTS DA SEMANA',
    '-'.repeat(20),
    // Strip HTML tags for plain-text version
    data.insightsHtml.replace(/<[^>]+>/g, '').trim(),
    '',
    '-'.repeat(50),
    `Ver standups da semana: ${viewUrl}`,
    `Cancelar digest: ${data.unsubscribeUrl}`,
  ]

  return lines.join('\n')
}
