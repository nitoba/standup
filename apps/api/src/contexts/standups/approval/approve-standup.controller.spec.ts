import { Controller, Inject } from '@nestjs/common'
import { describe, expect, it, vi } from 'vitest'
import { createControllerHttpTestApp } from '../../../test/http/create-controller-http-test-app'
import { ApproveStandupController } from './approve-standup.controller'
import { ApproveStandupService } from './approve-standup.service'

const STANDUP_ID = '123e4567-e89b-12d3-a456-426614174000'

@Controller('standups')
class TestApproveStandupController extends ApproveStandupController {
  constructor(
    @Inject(ApproveStandupService) approveStandup: ApproveStandupService,
  ) {
    super(approveStandup)
  }
}

describe('ApproveStandupController', () => {
  it('returns 401 without session', async () => {
    const service = {
      approve: vi.fn(),
    }
    const testApp = await createControllerHttpTestApp({
      controllers: [TestApproveStandupController],
      providers: [{ provide: ApproveStandupService, useValue: service }],
    })

    try {
      const response = await testApp.request
        .post(`/standups/${STANDUP_ID}/approve`)
        .send({})

      expect(response.status).toBe(401)
    } finally {
      await testApp.close()
    }
  })

  it('delegates approve requests to the service', async () => {
    const approve = vi.fn().mockResolvedValue({ id: STANDUP_ID })
    const testApp = await createControllerHttpTestApp({
      controllers: [TestApproveStandupController],
      providers: [
        {
          provide: ApproveStandupService,
          useValue: { approve },
        },
      ],
    })
    const body = {
      customEntries: {
        scheduledMeetings: ['Planning'],
        directCalls: [],
      },
    }

    try {
      const response = await testApp
        .withSession({ user: { id: 'user-1' } })
        .post(`/standups/${STANDUP_ID}/approve`)
        .send(body)

      expect(response.status).toBe(200)
      expect(response.body).toEqual({
        data: { id: STANDUP_ID },
      })
      expect(approve).toHaveBeenCalledWith('user-1', STANDUP_ID, {
        scheduledMeetings: ['Planning'],
        directCalls: [],
      })
    } finally {
      await testApp.close()
    }
  })

  it('returns 400 for an invalid standup id', async () => {
    const approve = vi.fn()
    const testApp = await createControllerHttpTestApp({
      controllers: [TestApproveStandupController],
      providers: [
        {
          provide: ApproveStandupService,
          useValue: { approve },
        },
      ],
    })

    try {
      const response = await testApp
        .withSession({ user: { id: 'user-1' } })
        .post('/standups/not-a-uuid/approve')
        .send({})

      expect(response.status).toBe(400)
      expect(approve).not.toHaveBeenCalled()
    } finally {
      await testApp.close()
    }
  })
})
