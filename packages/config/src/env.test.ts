import { Result } from '@standup/domain'
import { describe, expect, it } from 'vitest'
import { loadApiEnv, loadBotEnv, loadWorkerEnv } from './env.js'

describe('env loaders', () => {
  it('loadApiEnv validates only API requirements', () => {
    const result = loadApiEnv({
      DISCORD_USER_ID: 'user-123',
    })

    expect(result.isOk()).toBe(true)
    if (Result.isError(result)) {
      throw result.error
    }

    expect(result.value.WORKER_INTERNAL_URL).toBe('http://localhost:3335')
  })

  it('loadBotEnv does not require worker or LLM secrets', () => {
    const result = loadBotEnv({
      DISCORD_BOT_TOKEN: 'bot-token',
      DISCORD_CHANNEL_ID: 'channel-123',
      DISCORD_USER_ID: 'user-123',
    })

    expect(result.isOk()).toBe(true)
  })

  it('loadWorkerEnv does not require Discord bot token', () => {
    const result = loadWorkerEnv({
      ANTHROPIC_AUTH_TOKEN: 'anthropic-token',
      AZURE_DEVOPS_ORG: 'org',
      AZURE_DEVOPS_PAT: 'pat',
    })

    expect(result.isOk()).toBe(true)
  })

  it('returns a ValidationError with the failing field', () => {
    const result = loadWorkerEnv({
      AZURE_DEVOPS_ORG: 'org',
      AZURE_DEVOPS_PAT: 'pat',
    })

    expect(result.isErr()).toBe(true)
    if (Result.isOk(result)) {
      throw new Error('Expected error result')
    }

    expect(result.error.field).toBe('ANTHROPIC_AUTH_TOKEN')
    expect(result.error.message).toContain('ANTHROPIC_AUTH_TOKEN')
  })
})
