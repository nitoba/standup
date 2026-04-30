// apps/api/src/interfaces/discord/shared/interceptors/cooldown.interceptor.spec.ts
import type { CallHandler, ExecutionContext } from '@nestjs/common'
import { defaultIfEmpty, firstValueFrom, of } from 'rxjs'
import { describe, expect, it, vi } from 'vitest'
import { CommandCooldownService } from '../../handlers/command-cooldown.service'
import { makeChatInputInteraction, makeButtonInteraction } from '../../../../test/discord/mock-interaction'
import { CooldownInterceptor } from './cooldown.interceptor'

// NecordExecutionContext.create(context) constructs a new ExecutionContextHost
// using context.getArgs(), then getContext() returns getArgByIndex(0) = args[0].
// In real Necord wire: args = [[interaction], discovery], so getContext() = [interaction].
// The mock mirrors this: getArgs() returns [[interaction]], so getContext() = [interaction].
function makeCtx(interaction: unknown): ExecutionContext {
  return {
    getArgs: () => [[interaction]],
    getArgByIndex: (idx: number) => (idx === 0 ? [interaction] : undefined),
    getType: () => 'necord',
    getClass: () => null,
    getHandler: () => null,
  } as unknown as ExecutionContext
}

describe('CooldownInterceptor', () => {
  it('passes through when not on cooldown', async () => {
    const cooldown = new CommandCooldownService()
    const interceptor = new CooldownInterceptor(cooldown)
    const interaction = makeChatInputInteraction()
    ;(interaction as { commandName?: string }).commandName = 'trigger'
    const next: CallHandler = { handle: vi.fn(() => of('ok')) }

    const result = await firstValueFrom(
      interceptor.intercept(makeCtx(interaction), next),
    )

    expect(result).toBe('ok')
    expect(interaction.reply).not.toHaveBeenCalled()
  })

  it('replies ephemeral and aborts when on cooldown', async () => {
    const cooldown = new CommandCooldownService()
    cooldown.record('user-1', 'trigger')
    const interceptor = new CooldownInterceptor(cooldown)
    const interaction = makeChatInputInteraction({ userId: 'user-1' })
    ;(interaction as { commandName?: string }).commandName = 'trigger'
    const next: CallHandler = { handle: vi.fn(() => of('ok')) }

    const result = await firstValueFrom(
      interceptor.intercept(makeCtx(interaction), next).pipe(defaultIfEmpty(null)),
    )

    expect(result).toBeNull()
    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ ephemeral: true }),
    )
    expect(next.handle).not.toHaveBeenCalled()
  })

  it('falls through when interaction lacks commandName (e.g., button)', async () => {
    const cooldown = new CommandCooldownService()
    const interceptor = new CooldownInterceptor(cooldown)
    const buttonInteraction = makeButtonInteraction()
    const next: CallHandler = { handle: vi.fn(() => of('ok')) }

    const result = await firstValueFrom(
      interceptor.intercept(makeCtx(buttonInteraction), next),
    )

    expect(result).toBe('ok')
    expect(next.handle).toHaveBeenCalled()
  })
})
