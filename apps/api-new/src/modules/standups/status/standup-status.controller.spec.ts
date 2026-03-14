import { UnauthorizedException } from '@nestjs/common'
import { describe, expect, it, vi } from 'vitest'
import { StandupStatusController } from './standup-status.controller'

describe('StandupStatusController', () => {
  it('returns 401 without session', async () => {
    const controller = new StandupStatusController({ update: vi.fn() } as never)

    await expect(
      controller.update(null, 'standup-1', { status: 'rejected' } as never),
    ).rejects.toThrow(UnauthorizedException)
  })

  it('delegates valid requests to the service', async () => {
    const update = vi
      .fn()
      .mockResolvedValue({ id: 'standup-1', status: 'draft' })
    const controller = new StandupStatusController({ update } as never)

    await expect(
      controller.update({ user: { id: 'user-1' } }, 'standup-1', {
        status: 'draft',
      }),
    ).resolves.toEqual({
      data: { id: 'standup-1', status: 'draft' },
    })
    expect(update).toHaveBeenCalledWith('user-1', 'standup-1', 'draft')
  })
})
