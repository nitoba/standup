import { Controller, Inject } from '@nestjs/common'
import { describe, expect, it, vi } from 'vitest'
import { createControllerHttpTestApp } from '../../../test/http/create-controller-http-test-app'
import { StandupStatusController } from './standup-status.controller'
import { StandupStatusService } from './standup-status.service'

const STANDUP_ID = '123e4567-e89b-12d3-a456-426614174000'

@Controller('standups')
class TestStandupStatusController extends StandupStatusController {
  constructor(
    @Inject(StandupStatusService) standupStatus: StandupStatusService,
  ) {
    super(standupStatus)
  }
}

describe('StandupStatusController', () => {
  it('returns 401 without session', async () => {
    const update = vi.fn()
    const testApp = await createControllerHttpTestApp({
      controllers: [TestStandupStatusController],
      providers: [
        {
          provide: StandupStatusService,
          useValue: { update },
        },
      ],
    })

    try {
      const response = await testApp.request
        .patch(`/standups/${STANDUP_ID}/status`)
        .send({ status: 'rejected' })

      expect(response.status).toBe(401)
    } finally {
      await testApp.close()
    }
  })

  it('delegates valid requests to the service', async () => {
    const update = vi
      .fn()
      .mockResolvedValue({ id: STANDUP_ID, status: 'draft' })
    const testApp = await createControllerHttpTestApp({
      controllers: [TestStandupStatusController],
      providers: [
        {
          provide: StandupStatusService,
          useValue: { update },
        },
      ],
    })

    try {
      const response = await testApp
        .withSession({ user: { id: 'user-1' } })
        .patch(`/standups/${STANDUP_ID}/status`)
        .send({ status: 'draft' })

      expect(response.status).toBe(200)
      expect(response.body).toEqual({
        data: { id: STANDUP_ID, status: 'draft' },
      })
      expect(update).toHaveBeenCalledWith('user-1', STANDUP_ID, 'draft')
    } finally {
      await testApp.close()
    }
  })
})
