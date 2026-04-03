import { describe, expect, it, vi } from 'vitest'
import { Result } from '../../../shared/domain'
import { UserTimezoneService } from './user-timezone.service'

describe('UserTimezoneService', () => {
  it('returns the persisted timezone when user settings exist', async () => {
    const service = new UserTimezoneService({
      findByUserId: vi
        .fn()
        .mockResolvedValue(Result.ok({ timezone: 'America/Fortaleza' })),
    } as never)

    await expect(service.resolve('user-1')).resolves.toBe('America/Fortaleza')
  })

  it('falls back to America/Sao_Paulo when settings are missing', async () => {
    const service = new UserTimezoneService({
      findByUserId: vi.fn().mockResolvedValue(Result.ok(null)),
    } as never)

    await expect(service.resolve('user-1')).resolves.toBe('America/Sao_Paulo')
  })
})
