import { createHmac } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { signWebhookPayload } from './sign-webhook-payload'

describe('signWebhookPayload', () => {
  it('returns header in format "timestamp,hmacHex"', () => {
    const result = signWebhookPayload('test-secret', '{"key":"value"}')

    expect(result.header).toMatch(/^\d+,[a-f0-9]{64}$/)
  })

  it('generates correct HMAC-SHA256 signature', () => {
    const now = 1710950400000
    vi.spyOn(Date, 'now').mockReturnValue(now)

    const secret = 'my-secret'
    const body = '{"channelUrl":"https://discord.com/channels/1/2","message":"hello"}'
    const result = signWebhookPayload(secret, body)

    const expectedPayload = `${now}.${body}`
    const expectedHmac = createHmac('sha256', secret)
      .update(expectedPayload)
      .digest('hex')

    expect(result.header).toBe(`${now},${expectedHmac}`)
    expect(result.timestamp).toBe(now.toString())

    vi.restoreAllMocks()
  })

  it('returns numeric timestamp string', () => {
    const result = signWebhookPayload('secret', 'body')

    expect(result.timestamp).toMatch(/^\d+$/)
  })
})
