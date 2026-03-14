import { Injectable } from '@nestjs/common'
import { createTransport } from 'nodemailer'
import { ExternalServiceError, Result } from '../../shared/domain'
import { EnvService } from '../../shared/env/env.service'
import { AppLoggerFactory } from '../../shared/logger'

export interface SmtpConfig {
  host: string
  port: number
  secure: boolean
  user: string
  pass: string
  fromAddress: string
}

export interface SendEmailInput {
  to: string
  subject: string
  html: string
  text: string
  unsubscribeUrl?: string
}

export interface SendEmailResult {
  messageId: string
}

@Injectable()
export class EmailClientService {
  private readonly logger: ReturnType<AppLoggerFactory['create']>
  constructor(
    private readonly loggerFactory: AppLoggerFactory,
    private readonly env: EnvService,
  ) {
    this.logger = this.loggerFactory.create('email-client')
  }

  isConfigured(): boolean {
    const smtp = this.env.smtp
    return Boolean(smtp.host && smtp.user && smtp.pass && smtp.from)
  }

  async sendEmail(
    input: SendEmailInput,
  ): Promise<Result<SendEmailResult, ExternalServiceError>> {
    const configResult = this.getSmtpConfig()
    if (configResult.isErr()) {
      return configResult
    }

    const config = configResult.value

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

        this.logger.info('Email sent', {
          to: input.to,
          subject: input.subject,
          messageId: info.messageId,
        })

        return { messageId: info.messageId as string }
      },
      catch: (error) => {
        const message = error instanceof Error ? error.message : String(error)
        this.logger.error('Failed to send email', {
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

  private getSmtpConfig(): Result<SmtpConfig, ExternalServiceError> {
    const smtp = this.env.smtp

    if (!smtp.host || !smtp.user || !smtp.pass || !smtp.from) {
      return Result.err(
        new ExternalServiceError({
          service: 'smtp',
          message: 'SMTP not configured',
        }),
      )
    }

    return Result.ok({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      user: smtp.user,
      pass: smtp.pass,
      fromAddress: smtp.from,
    })
  }
}
