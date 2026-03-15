import { Controller, Inject, type MessageEvent } from '@nestjs/common'
import { of } from 'rxjs'
import { describe, expect, it, vi } from 'vitest'
import { createControllerHttpTestApp } from '../../../test/http/create-controller-http-test-app'
import { StandupEventsController } from './standup-events.controller'
import { StandupSseBusService } from './standup-sse-bus.service'

@Controller('standups')
class TestStandupEventsController extends StandupEventsController {
  constructor(
    @Inject(StandupSseBusService) standupSseBus: StandupSseBusService,
  ) {
    super(standupSseBus)
  }
}

describe('StandupEventsController', () => {
  it('returns 401 when session is missing', async () => {
    const subscribe = vi.fn()
    const testApp = await createControllerHttpTestApp({
      controllers: [TestStandupEventsController],
      providers: [
        {
          provide: StandupSseBusService,
          useValue: { subscribe },
        },
      ],
    })

    try {
      const response = await testApp.request.get('/standups/events')

      expect(response.status).toBe(401)
    } finally {
      await testApp.close()
    }
  })

  it('subscribes with the authenticated user id', async () => {
    const stream = of<MessageEvent>({ data: { type: 'generated' } })
    const subscribe = vi.fn().mockReturnValue(stream)
    const testApp = await createControllerHttpTestApp({
      controllers: [TestStandupEventsController],
      providers: [
        {
          provide: StandupSseBusService,
          useValue: { subscribe },
        },
      ],
    })

    try {
      const response = await testApp
        .withSession({ user: { id: 'user-1' } })
        .get('/standups/events')

      expect(response.status).toBe(200)
      expect(response.headers['content-type']).toContain('text/event-stream')
      expect(response.text).toContain('data:')
      expect(subscribe).toHaveBeenCalledWith('user-1')
    } finally {
      await testApp.close()
    }
  })
})
