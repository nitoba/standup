// ---------------------------------------------------------------------------
// Markdown → Email-safe HTML Converter
//
// Key rules (from Akita's email HTML guide):
//   1. All CSS must be inline on every element
//   2. No web fonts — system font stack only
//   3. No flexbox/grid — email clients (Outlook) don't support them
//   4. Images need explicit width/height and alt text
//   5. Keep HTML well-formed (no unclosed tags)
// ---------------------------------------------------------------------------

import { marked } from 'marked'
import { type EmailTheme, getTheme } from './theme.js'

const FONT_STACK =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"

function styleH1(t: EmailTheme): string {
  return `font-family: ${FONT_STACK}; font-size: 22px; font-weight: 700; color: ${t.text}; margin: 0 0 12px 0; padding: 0; line-height: 1.3;`
}
function styleH2(t: EmailTheme): string {
  return `font-family: ${FONT_STACK}; font-size: 18px; font-weight: 600; color: ${t.text}; margin: 20px 0 8px 0; padding: 0; line-height: 1.3; border-bottom: 1px solid ${t.divider}; padding-bottom: 4px;`
}
function styleH3(t: EmailTheme): string {
  return `font-family: ${FONT_STACK}; font-size: 15px; font-weight: 600; color: ${t.textSecondary}; margin: 16px 0 6px 0; padding: 0; line-height: 1.4;`
}
function styleH4(t: EmailTheme): string {
  return `font-family: ${FONT_STACK}; font-size: 14px; font-weight: 600; color: ${t.textSecondary}; margin: 12px 0 4px 0; padding: 0; line-height: 1.4;`
}
function styleP(t: EmailTheme): string {
  return `font-family: ${FONT_STACK}; font-size: 14px; line-height: 1.6; color: ${t.text}; margin: 0 0 10px 0; padding: 0;`
}
function styleUl(t: EmailTheme): string {
  return `font-family: ${FONT_STACK}; font-size: 14px; line-height: 1.6; color: ${t.text}; margin: 0 0 10px 0; padding-left: 20px;`
}
function styleLi(t: EmailTheme): string {
  return `margin: 0 0 4px 0; color: ${t.text};`
}
function styleBlockquote(t: EmailTheme): string {
  return `border-left: 3px solid ${t.insightBorder}; margin: 12px 0; padding: 8px 12px; background: ${t.insightBg};`
}
function stylePreCode(t: EmailTheme): string {
  return `background: ${t.cardHeaderBg}; border: 1px solid ${t.divider}; border-radius: 4px; padding: 12px 16px; margin: 0 0 12px 0; overflow-x: auto;`
}
function styleCode(t: EmailTheme): string {
  return `font-family: 'Courier New', Courier, monospace; font-size: 13px; color: ${t.text}; white-space: pre-wrap; word-break: break-all;`
}
function styleInlineCode(t: EmailTheme): string {
  return `font-family: 'Courier New', Courier, monospace; font-size: 13px; background: ${t.cardHeaderBg}; color: ${t.accent}; padding: 1px 5px; border-radius: 3px;`
}
function styleStrong(t: EmailTheme): string {
  return `font-weight: 700; color: ${t.text};`
}
function styleHr(t: EmailTheme): string {
  return `border: none; border-top: 1px solid ${t.divider}; margin: 16px 0;`
}
function styleLink(t: EmailTheme): string {
  return `color: ${t.accent}; text-decoration: underline;`
}

/**
 * Applies inline CSS to standard HTML output from marked.parse().
 */
function inlineCss(rawHtml: string, theme: EmailTheme): string {
  const step1 = rawHtml
    .replace(/<h1>/gi, `<h1 style="${styleH1(theme)}">`)
    .replace(/<h2>/gi, `<h2 style="${styleH2(theme)}">`)
    .replace(/<h3>/gi, `<h3 style="${styleH3(theme)}">`)
    .replace(/<h4>/gi, `<h4 style="${styleH4(theme)}">`)
    .replace(/<p>/gi, `<p style="${styleP(theme)}">`)
    .replace(/<ul>/gi, `<ul style="${styleUl(theme)}">`)
    .replace(/<ol>/gi, `<ol style="${styleUl(theme)}">`)
    .replace(/<li>/gi, `<li style="${styleLi(theme)}">`)
    .replace(/<blockquote>/gi, `<blockquote style="${styleBlockquote(theme)}">`)
    // Code blocks: pre > code — replace before standalone <code>
    .replace(
      /<pre><code(?: class="[^"]*")?>/gi,
      `<pre style="${stylePreCode(theme)}"><code style="${styleCode(theme)}">`,
    )
    // Standalone inline code (not inside pre)
    .replace(/<code>/gi, `<code style="${styleInlineCode(theme)}">`)
    .replace(/<strong>/gi, `<strong style="${styleStrong(theme)}">`)
    .replace(/<em>/gi, '<em style="font-style: italic;">')
    .replace(/<hr\s*\/?>/gi, `<hr style="${styleHr(theme)}" />`)

  const step2 = step1.replace(
    /<a href="([^"]*)">/gi,
    (_match, href: string) =>
      `<a href="${href}" style="${styleLink(theme)}" target="_blank" rel="noopener noreferrer">`,
  )

  return step2.replace(
    /<img([^>]*?)(?:\s*\/)?>/gi,
    (_match, attrs: string) =>
      `<img${attrs} style="display: block; max-width: 100%; height: auto; border: 0;" />`,
  )
}

/**
 * Converts Markdown content to email-safe HTML with inline CSS.
 * All styles are determined by the provided theme.
 */
export async function markdownToEmailHtml(
  markdown: string,
  theme: EmailTheme,
): Promise<string> {
  const rawHtml = await marked.parse(markdown, { async: true })
  return inlineCss(rawHtml, theme)
}
