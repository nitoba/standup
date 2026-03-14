import { ExternalServiceError } from '@standup/domain'
import { afterEach, describe, expect, it, vi } from 'vitest'

const { createTransportMock, sendMailMock } = vi.hoisted(() => ({
  createTransportMock: vi.fn(),
  sendMailMock: vi.fn(),
}))

vi.mock('nodemailer', () => ({
  createTransport: createTransportMock,
}))

import { EmailClientService } from './email-client.service'

describe('EmailClientService', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  function makeEnvService() {
    return {
      smtp: {
        host: 'smtp.example.com',
        port: 587,
        secure: false,
        user: 'bot',
        pass: 'secret',
        from: 'Standup Bot <bot@example.com>',
      },
    }
  }

  function makeLoggerFactory() {
    return {
      create: vi.fn(() => ({
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        child: vi.fn(),
      })),
    }
  }

  it('sends an email and includes unsubscribe headers when provided', async () => {
    createTransportMock.mockReturnValue({
      sendMail: sendMailMock.mockResolvedValue({ messageId: 'msg-1' }),
    })
    const service = new EmailClientService(
      makeLoggerFactory() as never,
      makeEnvService() as never,
    )

    const result = await service.sendEmail({
      to: 'dev@example.com',
      subject: 'Resumo',
      html: '<p>oi</p>',
      text: 'oi',
      unsubscribeUrl: 'https://example.com/unsubscribe',
    })

    expect(result.isOk()).toBe(true)
    expect(sendMailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: {
          'List-Unsubscribe': '<https://example.com/unsubscribe>',
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        },
      }),
    )
  })

  it('returns an ExternalServiceError when send fails', async () => {
    createTransportMock.mockReturnValue({
      sendMail: sendMailMock.mockRejectedValue(new Error('smtp failed')),
    })
    const service = new EmailClientService(
      makeLoggerFactory() as never,
      makeEnvService() as never,
    )

    const result = await service.sendEmail({
      to: 'dev@example.com',
      subject: 'Resumo',
      html: '<p>oi</p>',
      text: 'oi',
    })

    expect(result.isErr()).toBe(true)
    if (result.isErr()) {
      expect(result.error).toBeInstanceOf(ExternalServiceError)
      expect(result.error.message).toBe('smtp failed')
    }
  })

  it('reports missing SMTP configuration from env', async () => {
    const service = new EmailClientService(
      makeLoggerFactory() as never,
      {
        smtp: {
          host: undefined,
          port: 587,
          secure: false,
          user: undefined,
          pass: undefined,
          from: undefined,
        },
      } as never,
    )

    expect(service.isConfigured()).toBe(false)

    const result = await service.sendEmail({
      to: 'dev@example.com',
      subject: 'Resumo',
      html: '<p>oi</p>',
      text: 'oi',
    })

    expect(result.isErr()).toBe(true)
    if (result.isErr()) {
      expect(result.error).toBeInstanceOf(ExternalServiceError)
      expect(result.error.message).toBe('SMTP not configured')
    }
  })
})
