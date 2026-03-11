export type {
  SendEmailInput,
  SendEmailResult,
  SmtpConfig,
} from './email-client.js'
export { sendEmail } from './email-client.js'
export { markdownToEmailHtml } from './markdown-to-email-html.js'
export type { WeeklyDigestData } from './templates/weekly-digest.js'
export {
  renderWeeklyDigest,
  renderWeeklyDigestText,
} from './templates/weekly-digest.js'
export type { EmailTheme, EmailThemeKey } from './theme.js'
export { DARK_THEME, getTheme, LIGHT_THEME, THEMES } from './theme.js'
