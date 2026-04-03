import { createHmac } from 'node:crypto'

export function signWebhookPayload(
  secret: string,
  body: string,
): { header: string; timestamp: string } {
  const timestamp = Date.now().toString()
  const payload = `${timestamp}.${body}`
  const hmac = createHmac('sha256', secret).update(payload).digest('hex')

  return {
    header: `${timestamp},${hmac}`,
    timestamp,
  }
}
