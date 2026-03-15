import { UnauthorizedException } from '@nestjs/common'
import { describe, expect, it, vi } from 'vitest'
import { MeSettingsController } from './me-settings.controller'

describe('MeSettingsController', () => {
  it('returns 401 without session', async () => {
    const controller = new MeSettingsController({ get: vi.fn() } as never)

    await expect(controller.getMe(null)).rejects.toThrow(UnauthorizedException)
  })

  it('delegates get and put for authenticated users', async () => {
    const service = {
      get: vi.fn().mockResolvedValue({ timezone: 'America/Sao_Paulo' }),
      put: vi.fn().mockResolvedValue({ timezone: 'America/Fortaleza' }),
    }
    const controller = new MeSettingsController(service as never)
    const session = { user: { id: 'user-1' } }
    const body = {
      standupCron: '30 17 * * 1-5',
      reminderCron: '20 17 * * 1-5',
      recoveryCron: '0 18 * * 1-5',
      timezone: 'America/Fortaleza',
      gitAuthor: 'user@example.com',
      selectedRepos: ['repo-1'],
    }

    await expect(controller.getMe(session)).resolves.toEqual({
      data: { timezone: 'America/Sao_Paulo' },
    })
    await expect(controller.putMe(session, body)).resolves.toEqual({
      data: { timezone: 'America/Fortaleza' },
    })
    expect(service.get).toHaveBeenCalledWith('user-1')
    expect(service.put).toHaveBeenCalledWith('user-1', body)
  })
})
