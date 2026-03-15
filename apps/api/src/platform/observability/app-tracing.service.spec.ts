import { describe, expect, it, vi } from 'vitest'
import { AppTracingService } from './app-tracing.service'

describe('AppTracingService', () => {
  it('wraps a function in a span and ends it on success', async () => {
    const span = {
      end: vi.fn(),
      setStatus: vi.fn(),
      recordException: vi.fn(),
      addEvent: vi.fn(),
    }
    const startActiveSpan = vi
      .fn()
      .mockImplementation(async (_name, _options, callback) => callback(span))
    const service = new AppTracingService({
      getTracer: vi.fn().mockReturnValue({
        startActiveSpan,
      }),
    } as never)

    await expect(
      service.withSpan('test.span', { test: true }, async () => 'ok'),
    ).resolves.toBe('ok')
    expect(startActiveSpan).toHaveBeenCalledWith(
      'test.span',
      { attributes: { test: true } },
      expect.any(Function),
    )
    expect(span.end).toHaveBeenCalled()
    expect(span.setStatus).not.toHaveBeenCalled()
  })

  it('marks the span as error and records the exception on failure', async () => {
    const span = {
      end: vi.fn(),
      setStatus: vi.fn(),
      recordException: vi.fn(),
      addEvent: vi.fn(),
    }
    const service = new AppTracingService({
      getTracer: vi.fn().mockReturnValue({
        startActiveSpan: vi
          .fn()
          .mockImplementation(async (_name, _options, callback) =>
            callback(span),
          ),
      }),
    } as never)

    await expect(
      service.withSpan('test.span', {}, async () => {
        throw new Error('boom')
      }),
    ).rejects.toThrow('boom')
    expect(span.setStatus).toHaveBeenCalled()
    expect(span.recordException).toHaveBeenCalled()
    expect(span.end).toHaveBeenCalled()
  })
})
