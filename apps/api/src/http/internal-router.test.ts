import { describe, expect, it, vi } from 'vitest'
import { createInternalRouter } from './internal-router.js'

describe('createInternalRouter', () => {
  it('emits standup_progress events to the event bus', async () => {
    const eventBus = {
      emit: vi.fn(),
      subscribe: vi.fn(),
      emitToAll: vi.fn(),
    } as unknown as import('../sse/event-bus.js').EventBus

    const app = createInternalRouter({
      internalSecret: 'secret-123',
      eventBus,
    })

    const response = await app.fetch(
      new Request('http://localhost/internal/events/standup', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-internal-secret': 'secret-123',
        },
        body: JSON.stringify({
          type: 'standup_progress',
          userId: 'user-1',
          runId: 'run-1',
          date: '2026-03-10',
          mode: 'generate',
          step: 'collecting_git',
          message: 'Coletando commits',
        }),
      }),
    )

    expect(response.status).toBe(200)
    expect(eventBus.emit).toHaveBeenCalledWith('user-1', {
      type: 'standup_progress',
      runId: 'run-1',
      date: '2026-03-10',
      mode: 'generate',
      step: 'collecting_git',
      message: 'Coletando commits',
    })
  })

  it('rejects invalid internal event payloads', async () => {
    const eventBus = {
      emit: vi.fn(),
      subscribe: vi.fn(),
      emitToAll: vi.fn(),
    } as unknown as import('../sse/event-bus.js').EventBus

    const app = createInternalRouter({
      internalSecret: 'secret-123',
      eventBus,
    })

    const response = await app.fetch(
      new Request('http://localhost/internal/events/standup', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-internal-secret': 'secret-123',
        },
        body: JSON.stringify({
          type: 'standup_progress',
          userId: 'user-1',
          runId: 'run-1',
        }),
      }),
    )

    expect(response.status).toBe(400)
    expect(eventBus.emit).not.toHaveBeenCalled()
  })
})
