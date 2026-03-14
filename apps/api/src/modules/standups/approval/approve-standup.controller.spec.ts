import { UnauthorizedException } from '@nestjs/common'
import { describe, expect, it, vi } from 'vitest'
import { ApproveStandupController } from './approve-standup.controller'

describe('ApproveStandupController', () => {
  it('returns 401 without session', async () => {
    const controller = new ApproveStandupController({
      approve: vi.fn(),
    } as never)

    await expect(controller.approve(null, 'standup-1', {})).rejects.toThrow(
      UnauthorizedException,
    )
  })

  it('delegates approve requests to the service', async () => {
    const approve = vi.fn().mockResolvedValue({ id: 'standup-1' })
    const controller = new ApproveStandupController({ approve } as never)

    await expect(
      controller.approve({ user: { id: 'user-1' } }, 'standup-1', {
        customEntries: {
          scheduledMeetings: ['Planning'],
          directCalls: [],
        },
      }),
    ).resolves.toEqual({
      data: { id: 'standup-1' },
    })
    expect(approve).toHaveBeenCalledWith('user-1', 'standup-1', {
      scheduledMeetings: ['Planning'],
      directCalls: [],
    })
  })
})
