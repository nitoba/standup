import { Controller, Inject } from '@nestjs/common'
import { describe, expect, it, vi } from 'vitest'
import { createControllerHttpTestApp } from '../../../../test/http/create-controller-http-test-app'
import { DigestsController } from './digests.controller'
import { WeeklyDigestDispatchService } from './weekly-digest-dispatch.service'

@Controller('digests')
class TestDigestsController extends DigestsController {
  constructor(
    @Inject(WeeklyDigestDispatchService)
    weeklyDigestDispatch: WeeklyDigestDispatchService,
  ) {
    super(weeklyDigestDispatch)
  }
}

describe('DigestsController', () => {
  it('throws when there is no authenticated session', async () => {
    const dispatchWeeklyDigestJob = vi.fn()
    const testApp = await createControllerHttpTestApp({
      controllers: [TestDigestsController],
      providers: [
        {
          provide: WeeklyDigestDispatchService,
          useValue: { dispatchWeeklyDigestJob },
        },
      ],
    })

    try {
      const response = await testApp.request.post('/digests/trigger')

      expect(response.status).toBe(401)
    } finally {
      await testApp.close()
    }
  })

  it('uses the session userId', async () => {
    const dispatchWeeklyDigestJob = vi.fn()
    const testApp = await createControllerHttpTestApp({
      controllers: [TestDigestsController],
      providers: [
        {
          provide: WeeklyDigestDispatchService,
          useValue: { dispatchWeeklyDigestJob },
        },
      ],
    })

    try {
      const response = await testApp
        .withSession({ user: { id: 'user-1' } })
        .post('/digests/trigger')

      expect(response.status).toBe(202)
      expect(response.body).toEqual({ ok: true, accepted: true })
      expect(dispatchWeeklyDigestJob).toHaveBeenCalledWith({
        userId: 'user-1',
      })
    } finally {
      await testApp.close()
    }
  })
})
