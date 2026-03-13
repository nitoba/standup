import { describe, expect, it } from 'vitest'
import { validateEnvironment } from './env'

describe('validateEnvironment', () => {
  it('aplica defaults e coercao', () => {
    const env = validateEnvironment({
      PORT: '3333',
      SMTP_SECURE: 'false',
      DISCORD_GATEWAY_ENABLED: 'false',
      SCHEDULER_ENABLED: 'true',
    })

    expect(env.PORT).toBe(3333)
    expect(env.SMTP_SECURE).toBe(false)
    expect(env.DISCORD_GATEWAY_ENABLED).toBe(false)
    expect(env.SCHEDULER_ENABLED).toBe(true)
    expect(env.DATABASE_URL).toBe('file:./data/standup.db')
  })
})
