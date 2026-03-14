import { marked } from "marked";
import type { EmailTheme } from "./theme";

const FONT_STACK =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

function styleH1(theme: EmailTheme): string {
  return `font-family: ${FONT_STACK}; font-size: 22px; font-weight: 700; color: ${theme.text}; margin: 0 0 12px 0; padding: 0; line-height: 1.3;`;
}

function styleH2(theme: EmailTheme): string {
  return `font-family: ${FONT_STACK}; font-size: 18px; font-weight: 600; color: ${theme.text}; margin: 20px 0 8px 0; padding: 0; line-height: 1.3; border-bottom: 1px solid ${theme.divider}; padding-bottom: 4px;`;
}

function styleH3(theme: EmailTheme): string {
  return `font-family: ${FONT_STACK}; font-size: 15px; font-weight: 600; color: ${theme.textSecondary}; margin: 16px 0 6px 0; padding: 0; line-height: 1.4;`;
}

function styleH4(theme: EmailTheme): string {
  return `font-family: ${FONT_STACK}; font-size: 14px; font-weight: 600; color: ${theme.textSecondary}; margin: 12px 0 4px 0; padding: 0; line-height: 1.4;`;
}

function styleParagraph(theme: EmailTheme): string {
  return `font-family: ${FONT_STACK}; font-size: 14px; line-height: 1.6; color: ${theme.text}; margin: 0 0 10px 0; padding: 0;`;
}

function styleList(theme: EmailTheme): string {
  return `font-family: ${FONT_STACK}; font-size: 14px; line-height: 1.6; color: ${theme.text}; margin: 0 0 10px 0; padding-left: 20px;`;
}

function styleListItem(theme: EmailTheme): string {
  return `margin: 0 0 4px 0; color: ${theme.text};`;
}

function styleBlockquote(theme: EmailTheme): string {
  return `border-left: 3px solid ${theme.insightBorder}; margin: 12px 0; padding: 8px 12px; background: ${theme.insightBg};`;
}

function stylePreCode(theme: EmailTheme): string {
  return `background: ${theme.cardHeaderBg}; border: 1px solid ${theme.divider}; border-radius: 4px; padding: 12px 16px; margin: 0 0 12px 0; overflow-x: auto;`;
}

function styleCode(theme: EmailTheme): string {
  return `font-family: 'Courier New', Courier, monospace; font-size: 13px; color: ${theme.text}; white-space: pre-wrap; word-break: break-all;`;
}

function styleInlineCode(theme: EmailTheme): string {
  return `font-family: 'Courier New', Courier, monospace; font-size: 13px; background: ${theme.cardHeaderBg}; color: ${theme.accent}; padding: 1px 5px; border-radius: 3px;`;
}

function styleStrong(theme: EmailTheme): string {
  return `font-weight: 700; color: ${theme.text};`;
}

function styleHr(theme: EmailTheme): string {
  return `border: none; border-top: 1px solid ${theme.divider}; margin: 16px 0;`;
}

function styleLink(theme: EmailTheme): string {
  return `color: ${theme.accent}; text-decoration: underline;`;
}

function inlineCss(rawHtml: string, theme: EmailTheme): string {
  const withInlineElements = rawHtml
    .replace(/<h1>/gi, `<h1 style="${styleH1(theme)}">`)
    .replace(/<h2>/gi, `<h2 style="${styleH2(theme)}">`)
    .replace(/<h3>/gi, `<h3 style="${styleH3(theme)}">`)
    .replace(/<h4>/gi, `<h4 style="${styleH4(theme)}">`)
    .replace(/<p>/gi, `<p style="${styleParagraph(theme)}">`)
    .replace(/<ul>/gi, `<ul style="${styleList(theme)}">`)
    .replace(/<ol>/gi, `<ol style="${styleList(theme)}">`)
    .replace(/<li>/gi, `<li style="${styleListItem(theme)}">`)
    .replace(/<blockquote>/gi, `<blockquote style="${styleBlockquote(theme)}">`)
    .replace(
      /<pre><code(?: class="[^"]*")?>/gi,
      `<pre style="${stylePreCode(theme)}"><code style="${styleCode(theme)}">`,
    )
    .replace(/<code>/gi, `<code style="${styleInlineCode(theme)}">`)
    .replace(/<strong>/gi, `<strong style="${styleStrong(theme)}">`)
    .replace(/<em>/gi, '<em style="font-style: italic;">')
    .replace(/<hr\s*\/?>/gi, `<hr style="${styleHr(theme)}" />`);

  const withLinks = withInlineElements.replace(
    /<a href="([^"]*)">/gi,
    (_match, href: string) =>
      `<a href="${href}" style="${styleLink(theme)}" target="_blank" rel="noopener noreferrer">`,
  );

  return withLinks.replace(
    /<img([^>]*?)(?:\s*\/)?>/gi,
    (_match, attrs: string) =>
      `<img${attrs} style="display: block; max-width: 100%; height: auto; border: 0;" />`,
  );
}

export async function markdownToEmailHtml(
  markdown: string,
  theme: EmailTheme,
): Promise<string> {
  const rawHtml = await marked.parse(markdown, { async: true });
  return inlineCss(rawHtml, theme);
}
