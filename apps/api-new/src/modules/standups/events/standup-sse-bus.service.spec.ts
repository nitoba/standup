import { afterEach, describe, expect, it, vi } from 'vitest'
import { StandupSseBusService } from './standup-sse-bus.service'

describe('StandupSseBusService', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  function makeLoggerFactory() {
    return {
      create: vi.fn(() => ({
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        child: vi.fn(),
      })),
    }
  }

  it('emits connected immediately and forwards user-scoped events', () => {
    const service = new StandupSseBusService(makeLoggerFactory() as never)
    const received: Array<{ type?: string; data?: unknown }> = []

    const subscription = service.subscribe('user-1').subscribe((event) => {
      received.push(event)
    })

    service.emit('user-1', {
      type: 'standup_generated',
      runId: 'run-1',
      standupId: 'standup-1',
      date: '2026-03-13',
      mode: 'generate',
    })
    service.emit('user-2', {
      type: 'standup_generated',
      runId: 'run-2',
      standupId: 'standup-2',
      date: '2026-03-13',
      mode: 'generate',
    })

    expect(received).toEqual([
      { type: 'connected', data: { ok: true } },
      {
        type: 'standup_generated',
        data: {
          type: 'standup_generated',
          runId: 'run-1',
          standupId: 'standup-1',
          date: '2026-03-13',
          mode: 'generate',
        },
      },
    ])

    subscription.unsubscribe()
  })

  it('emits keepalive pings while subscribed', () => {
    vi.useFakeTimers()

    const service = new StandupSseBusService(makeLoggerFactory() as never)
    const received: Array<{ type?: string; data?: unknown }> = []

    const subscription = service.subscribe('user-1').subscribe((event) => {
      received.push(event)
    })

    vi.advanceTimersByTime(30_000)

    expect(received[0]).toEqual({
      type: 'connected',
      data: { ok: true },
    })
    expect(received[1]).toMatchObject({
      type: 'ping',
      data: { ts: expect.any(Number) },
    })

    subscription.unsubscribe()
  })
})
