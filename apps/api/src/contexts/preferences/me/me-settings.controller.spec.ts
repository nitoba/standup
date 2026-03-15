import { Controller, Inject } from '@nestjs/common'
import { describe, expect, it, vi } from 'vitest'
import { createControllerHttpTestApp } from '../../../test/http/create-controller-http-test-app'
import { MeSettingsController } from './me-settings.controller'
import { MeSettingsService } from './me-settings.service'

@Controller('settings')
class TestMeSettingsController extends MeSettingsController {
  constructor(@Inject(MeSettingsService) meSettingsService: MeSettingsService) {
    super(meSettingsService)
  }
}

describe('MeSettingsController', () => {
  it('returns 401 without session', async () => {
    const service = {
      get: vi.fn(),
      put: vi.fn(),
    }
    const testApp = await createControllerHttpTestApp({
      controllers: [TestMeSettingsController],
      providers: [{ provide: MeSettingsService, useValue: service }],
    })

    try {
      const response = await testApp.request.get('/settings/me')

      expect(response.status).toBe(401)
    } finally {
      await testApp.close()
    }
  })

  it('delegates get and put for authenticated users', async () => {
    const service = {
      get: vi.fn().mockResolvedValue({ timezone: 'America/Sao_Paulo' }),
      put: vi.fn().mockResolvedValue({ timezone: 'America/Fortaleza' }),
    }
    const body = {
      standupCron: '30 17 * * 1-5',
      reminderCron: '20 17 * * 1-5',
      recoveryCron: '0 18 * * 1-5',
      timezone: 'America/Fortaleza',
      gitAuthor: 'user@example.com',
      selectedRepos: ['repo-1'],
    }
    const testApp = await createControllerHttpTestApp({
      controllers: [TestMeSettingsController],
      providers: [{ provide: MeSettingsService, useValue: service }],
    })

    try {
      const getResponse = await testApp
        .withSession({ user: { id: 'user-1' } })
        .get('/settings/me')
      const putResponse = await testApp
        .withSession({ user: { id: 'user-1' } })
        .put('/settings/me')
        .send(body)

      expect(getResponse.status).toBe(200)
      expect(getResponse.body).toEqual({
        data: { timezone: 'America/Sao_Paulo' },
      })
      expect(putResponse.status).toBe(200)
      expect(putResponse.body).toEqual({
        data: { timezone: 'America/Fortaleza' },
      })
      expect(service.get).toHaveBeenCalledWith('user-1')
      expect(service.put).toHaveBeenCalledWith('user-1', body)
    } finally {
      await testApp.close()
    }
  })
})
