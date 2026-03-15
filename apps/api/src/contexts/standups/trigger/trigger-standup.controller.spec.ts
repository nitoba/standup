import { Controller, Inject } from '@nestjs/common'
import { describe, expect, it, vi } from 'vitest'
import { createControllerHttpTestApp } from '../../../test/http/create-controller-http-test-app'
import { TriggerStandupController } from './trigger-standup.controller'
import { TriggerStandupService } from './trigger-standup.service'

@Controller('standups')
class TestTriggerStandupController extends TriggerStandupController {
  constructor(
    @Inject(TriggerStandupService) triggerStandup: TriggerStandupService,
  ) {
    super(triggerStandup)
  }
}

describe('TriggerStandupController', () => {
  it('returns 401 without session', async () => {
    const trigger = vi.fn()
    const testApp = await createControllerHttpTestApp({
      controllers: [TestTriggerStandupController],
      providers: [
        {
          provide: TriggerStandupService,
          useValue: { trigger },
        },
      ],
    })

    try {
      const response = await testApp.request.post('/standups/trigger').send({})

      expect(response.status).toBe(401)
    } finally {
      await testApp.close()
    }
  })

  it('delegates trigger requests to the trigger service', async () => {
    const trigger = vi.fn().mockResolvedValue({ ok: true, accepted: true })
    const body = { extraContext: 'contexto' }
    const session = { user: { id: 'user-1' } }
    const testApp = await createControllerHttpTestApp({
      controllers: [TestTriggerStandupController],
      providers: [
        {
          provide: TriggerStandupService,
          useValue: { trigger },
        },
      ],
    })

    try {
      const response = await testApp
        .withSession(session)
        .post('/standups/trigger')
        .send(body)

      expect(response.status).toBe(202)
      expect(response.body).toEqual({
        ok: true,
        accepted: true,
      })
      expect(trigger).toHaveBeenCalledWith(body, session)
    } finally {
      await testApp.close()
    }
  })
})
