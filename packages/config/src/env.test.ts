import { Result } from '@standup/domain'
import { describe, expect, it } from 'vitest'
import { loadApiEnv, loadBotEnv, loadWorkerEnv } from './env.js'

describe('env loaders', () => {
  it('loadApiEnv validates only API requirements', () => {
    const result = loadApiEnv({
      DISCORD_CLIENT_ID: 'client-id',
      DISCORD_CLIENT_SECRET: 'client-secret',
      BETTER_AUTH_SECRET: 'auth-secret',
    })

    expect(result.isOk()).toBe(true)
    if (Result.isError(result)) {
      throw result.error
    }

    expect(result.value.WORKER_INTERNAL_URL).toBe('http://localhost:3335')
    expect(result.value.BETTER_AUTH_URL).toBe('http://localhost:3333')
    expect(result.value.REPOS_ROOT_PATH).toBe('/repos')
  })

  it('loadApiEnv accepts an explicit BETTER_AUTH_URL', () => {
    const result = loadApiEnv({
      DISCORD_CLIENT_ID: 'client-id',
      DISCORD_CLIENT_SECRET: 'client-secret',
      BETTER_AUTH_SECRET: 'auth-secret',
      BETTER_AUTH_URL: 'https://api.example.com',
    })

    expect(result.isOk()).toBe(true)
    if (Result.isError(result)) {
      throw result.error
    }

    expect(result.value.BETTER_AUTH_URL).toBe('https://api.example.com')
  })

  it('loadBotEnv does not require worker or LLM secrets', () => {
    const result = loadBotEnv({
      DISCORD_BOT_TOKEN: 'bot-token',
      DISCORD_CHANNEL_ID: 'channel-123',
    })

    expect(result.isOk()).toBe(true)
  })

  it('loadWorkerEnv does not require Discord bot token', () => {
    const result = loadWorkerEnv({
      AI_PROVIDER_API_KEY: 'provider-key',
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

    expect(result.error.field).toBe('AI_PROVIDER_API_KEY')
    expect(result.error.message).toContain('AI_PROVIDER_API_KEY')
  })

  it('loadApiEnv rejects when a required Better Auth field is missing', () => {
    const result = loadApiEnv({
      DISCORD_CLIENT_ID: 'client-id',
      DISCORD_CLIENT_SECRET: 'client-secret',
    })

    expect(result.isErr()).toBe(true)
    if (Result.isOk(result)) {
      throw new Error('Expected error result')
    }

    expect(result.error.field).toBe('BETTER_AUTH_SECRET')
  })

  it.each([
    'DISCORD_CLIENT_ID',
    'DISCORD_CLIENT_SECRET',
    'BETTER_AUTH_SECRET',
  ] as const)('loadApiEnv requires %s for Better Auth', (missingField) => {
    const rawEnv = {
      DISCORD_CLIENT_ID: 'client-id',
      DISCORD_CLIENT_SECRET: 'client-secret',
      BETTER_AUTH_SECRET: 'auth-secret',
    }

    delete rawEnv[missingField]

    const result = loadApiEnv(rawEnv)

    expect(result.isErr()).toBe(true)
    if (Result.isOk(result)) {
      throw new Error('Expected error result')
    }

    expect(result.error.field).toBe(missingField)
    expect(result.error.message).toContain(missingField)
  })
})
