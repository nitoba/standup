import { describe, expect, it } from 'vitest'
import { EventBusService } from './event-bus.service'

describe('EventBusService', () => {
  it('does not expose request-style standup event helpers anymore', () => {
    const bus = new EventBusService({ emit: () => undefined } as never)
    const legacyMethods = [
      ['request', 'StandupTrigger'].join(''),
      ['request', 'StandupJobDispatch'].join(''),
      ['request', 'WorkerRepos'].join(''),
      ['request', 'WorkerReminderAction'].join(''),
    ]

    for (const method of legacyMethods) {
      expect(method in bus).toBe(false)
    }
  })
})
