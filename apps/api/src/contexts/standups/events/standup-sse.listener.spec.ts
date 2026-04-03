import { describe, expect, it, vi } from 'vitest'
import { StandupSseListener } from './standup-sse.listener'

describe('StandupSseListener', () => {
  it('maps progress and status events to SSE payloads', () => {
    const emit = vi.fn()
    const listener = new StandupSseListener({ emit } as never)

    listener.handleProgress({
      userId: 'user-1',
      runId: 'run-1',
      date: '13/03/2026',
      mode: 'generate',
      step: 'collecting_git',
      message: 'Collecting commits',
      standupId: 'standup-1',
    })

    listener.handleStatusChanged({
      userId: 'user-1',
      standupId: 'standup-1',
      newStatus: 'approved',
      source: 'web',
    })

    expect(emit).toHaveBeenNthCalledWith(1, 'user-1', {
      type: 'standup_progress',
      runId: 'run-1',
      date: '13/03/2026',
      mode: 'generate',
      step: 'collecting_git',
      message: 'Collecting commits',
      standupId: 'standup-1',
    })
    expect(emit).toHaveBeenNthCalledWith(2, 'user-1', {
      type: 'standup_status_changed',
      standupId: 'standup-1',
      newStatus: 'approved',
    })
  })
})
