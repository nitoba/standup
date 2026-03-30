import { ServiceUnavailableException } from '@nestjs/common'
import { describe, expect, it } from 'vitest'
import { ExternalServiceError } from '../../../shared/domain'
import { throwStandupHttpError } from './throw-standup-http-error'

describe('throwStandupHttpError', () => {
  it('preserves curated publicMessage for external service errors', () => {
    expect(() =>
      throwStandupHttpError(
        new ExternalServiceError({
          service: 'discord-automation',
          message: 'raw internal detail',
          publicMessage: 'Discord automation is not configured.',
        }),
      ),
    ).toThrowError(ServiceUnavailableException)

    try {
      throwStandupHttpError(
        new ExternalServiceError({
          service: 'discord-automation',
          message: 'raw internal detail',
          publicMessage: 'Discord automation is not configured.',
        }),
      )
    } catch (error) {
      expect(error).toBeInstanceOf(ServiceUnavailableException)
      expect((error as ServiceUnavailableException).message).toBe(
        'Discord automation is not configured.',
      )
    }
  })

  it('falls back to generic message when no curated publicMessage exists', () => {
    try {
      throwStandupHttpError(
        new ExternalServiceError({
          service: 'azure-devops',
          message: 'resolveIdentity failed: HTTP 401 body token invalid',
        }),
      )
    } catch (error) {
      expect(error).toBeInstanceOf(ServiceUnavailableException)
      expect((error as ServiceUnavailableException).message).toBe(
        'Service unavailable',
      )
    }
  })
})
