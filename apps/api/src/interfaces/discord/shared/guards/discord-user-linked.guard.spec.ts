// apps/api/src/interfaces/discord/shared/guards/discord-user-linked.guard.spec.ts
import type { ExecutionContext } from '@nestjs/common'
import { describe, expect, it, vi } from 'vitest'
import { makeChatInputInteraction } from '../../../../test/discord/mock-interaction'
import { DiscordUserLinkedGuard } from './discord-user-linked.guard'

function makeCtx(interaction: unknown): ExecutionContext {
  return {
    getArgs: () => [[interaction]],
    getArgByIndex: (idx: number) => (idx === 0 ? [interaction] : undefined),
    getType: () => 'discord',
    getClass: () => class {} as never,
    getHandler: () => (() => {}) as never,
  } as unknown as ExecutionContext
}

describe('DiscordUserLinkedGuard', () => {
  it('returns true when auth resolves a session', async () => {
    const auth = {
      requireChatAuth: vi.fn().mockResolvedValue({ userId: 'app-1' }),
    }
    const guard = new DiscordUserLinkedGuard(auth as never)
    const interaction = makeChatInputInteraction()

    await expect(guard.canActivate(makeCtx(interaction))).resolves.toBe(true)
    expect(auth.requireChatAuth).toHaveBeenCalledWith(interaction)
  })

  it('returns false when auth replies with login link', async () => {
    const auth = { requireChatAuth: vi.fn().mockResolvedValue(null) }
    const guard = new DiscordUserLinkedGuard(auth as never)
    const interaction = makeChatInputInteraction()

    await expect(guard.canActivate(makeCtx(interaction))).resolves.toBe(false)
  })

  it('returns false when no interaction is in the context', async () => {
    const auth = { requireChatAuth: vi.fn() }
    const guard = new DiscordUserLinkedGuard(auth as never)

    await expect(guard.canActivate(makeCtx(undefined))).resolves.toBe(false)
    expect(auth.requireChatAuth).not.toHaveBeenCalled()
  })
})
