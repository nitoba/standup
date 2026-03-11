// ---------------------------------------------------------------------------
// Email Client — Nodemailer wrapper
//
// Nodemailer is transport-agnostic: set SMTP_HOST/PORT/USER/PASS to use any
// SMTP server (Gmail, Zoho, etc). The caller never needs to know the transport.
//
// Anti-spam headers included on every send:
//   - List-Unsubscribe + List-Unsubscribe-Post (Gmail requirement since Feb 2024)
//   - Content-Type multipart/alternative with both text/plain and text/html
// ---------------------------------------------------------------------------

import { ExternalServiceError, Result } from '@standup/domain'
import { createServiceLogger } from '@standup/logger'
import { createTransport } from 'nodemailer'

const logger = createServiceLogger({
  service: 'email',
  component: 'email-client',
})

export interface SmtpConfig {
  host: string
  port: number
  secure: boolean // true = TLS on connect (port 465), false = STARTTLS (port 587)
  user: string
  pass: string
  fromAddress: string // e.g. "Standup Bot <bot@yourdomain.com>"
}

export interface SendEmailInput {
  to: string
  subject: string
  html: string
  text: string
  /** Unsubscribe URL for List-Unsubscribe header (RFC 8058) */
  unsubscribeUrl?: string
}

export interface SendEmailResult {
  messageId: string
}

/**
 * Creates a Nodemailer transport and sends an email.
 * Returns Result<{messageId}, ExternalServiceError>.
 *
 * Failure modes:
 *   - SMTP connection refused / auth failure → ExternalServiceError
 *   - Invalid recipient address → ExternalServiceError
 *
 * The caller decides whether to retry (transient vs permanent errors).
 */
export async function sendEmail(
  config: SmtpConfig,
  input: SendEmailInput,
): Promise<Result<SendEmailResult, ExternalServiceError>> {
  return Result.tryPromise({
    try: async () => {
      const transport = createTransport({
        host: config.host,
        port: config.port,
        secure: config.secure,
        auth: {
          user: config.user,
          pass: config.pass,
        },
      })

      const headers: Record<string, string> = {}
      if (input.unsubscribeUrl) {
        // RFC 8058: one-click unsubscribe for Gmail/Yahoo compliance
        headers['List-Unsubscribe'] = `<${input.unsubscribeUrl}>`
        headers['List-Unsubscribe-Post'] = 'List-Unsubscribe=One-Click'
      }

      const info = await transport.sendMail({
        from: config.fromAddress,
        to: input.to,
        subject: input.subject,
        text: input.text,
        html: input.html,
        headers,
      })

      logger.info('Email sent', {
        to: input.to,
        subject: input.subject,
        messageId: info.messageId,
      })

      return { messageId: info.messageId as string }
    },
    catch: (err) => {
      const message = err instanceof Error ? err.message : String(err)
      logger.error('Failed to send email', {
        to: input.to,
        subject: input.subject,
        error: message,
      })
      return new ExternalServiceError({
        service: 'smtp',
        message,
      })
    },
  })
}
