import { describe, expect, it, vi } from 'vitest'
import { StandupsService } from './standups.service'

describe('StandupsService', () => {
  it('publica evento ao disparar geracao', () => {
    const eventBus = {
      emitStandupTriggerRequested: vi.fn(),
      emitStandupApprovalRequested: vi.fn(),
    }

    const service = new StandupsService(eventBus as never)
    const result = service.trigger({
      userId: 'user-1',
      discordUserId: 'discord-1',
    })

    expect(result).toEqual({ accepted: true, source: 'http' })
    expect(eventBus.emitStandupTriggerRequested).toHaveBeenCalledWith({
      userId: 'user-1',
      discordUserId: 'discord-1',
      source: 'http',
    })
  })
})
