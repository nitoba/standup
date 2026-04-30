// apps/api/src/interfaces/discord/shared/filters/discord-exception.filter.spec.ts
import type { ArgumentsHost } from '@nestjs/common'
import { describe, expect, it, vi } from 'vitest'
import { TaggedError } from '../../../../shared/domain'
import { DiscordExceptionFilter } from './discord-exception.filter'
import { makeButtonInteraction } from '../../../../test/discord/mock-interaction'

class TestError extends TaggedError('TestError')<{ message: string }>() {
  constructor() {
    super({ message: 'boom' })
  }
}

const logger = {
  create: () => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  }),
}

function makeHost(interaction: unknown): ArgumentsHost {
  return {
    getArgs: () => [[interaction]],
    getArgByIndex: (idx: number) => (idx === 0 ? [interaction] : undefined),
    getType: () => 'discord',
  } as unknown as ArgumentsHost
}

describe('DiscordExceptionFilter', () => {
  it('uses reply when interaction is fresh', async () => {
    const filter = new DiscordExceptionFilter(logger as never)
    const interaction = makeButtonInteraction({ deferred: false, replied: false })
    ;(interaction as { reply?: unknown }).reply = vi.fn().mockResolvedValue(undefined)

    await filter.catch(new TestError(), makeHost(interaction))

    expect(interaction.reply).toHaveBeenCalledWith({
      content: 'Erro: boom',
      ephemeral: true,
    })
  })

  it('uses followUp when interaction is deferred', async () => {
    const filter = new DiscordExceptionFilter(logger as never)
    const interaction = makeButtonInteraction({ deferred: true })

    await filter.catch(new TestError(), makeHost(interaction))

    expect(interaction.followUp).toHaveBeenCalledWith({
      content: 'Erro: boom',
      ephemeral: true,
    })
  })

  it('does nothing when interaction is not repliable', async () => {
    const filter = new DiscordExceptionFilter(logger as never)
    const interaction = { isRepliable: () => false } as unknown
    await expect(
      filter.catch(new TestError(), makeHost(interaction)),
    ).resolves.toBeUndefined()
  })

  it('does nothing when error is not a TaggedError', async () => {
    const filter = new DiscordExceptionFilter(logger as never)
    const interaction = makeButtonInteraction({ deferred: false, replied: false })
    ;(interaction as { reply?: unknown }).reply = vi.fn().mockResolvedValue(undefined)

    await filter.catch(new Error('plain'), makeHost(interaction))

    expect(interaction.reply).not.toHaveBeenCalled()
    expect(interaction.followUp).not.toHaveBeenCalled()
  })
})
