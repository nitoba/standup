// apps/api/src/interfaces/discord/services/discord-auth.service.spec.ts
import { MessageFlags } from 'discord.js'
import { describe, expect, it, vi } from 'vitest'
import { makeChatInputInteraction } from '../../../test/discord/mock-interaction'
import { DiscordAuthService } from './discord-auth.service'

function makeLoggerFactory() {
  return {
    create: vi.fn(() => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      child: vi.fn(),
    })),
  }
}

function makeEnv(baseUrl = 'http://localhost:3333') {
  return {
    auth: { baseUrl },
  }
}

/** Assert that mockA was called before mockB using invocation call orders. */
function assertCalledBefore(
  // biome-ignore lint/suspicious/noExplicitAny: test helper
  mockA: ReturnType<typeof vi.fn<any>>,
  // biome-ignore lint/suspicious/noExplicitAny: test helper
  mockB: ReturnType<typeof vi.fn<any>>,
) {
  const orderA = mockA.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY
  const orderB = mockB.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY
  expect(orderA).toBeLessThan(orderB)
}

describe('DiscordAuthService.handleLoginCommand', () => {
  it('defers reply first then responds "Você já está logado" when session is active', async () => {
    const userRepo = {
      hasActiveSession: vi.fn().mockResolvedValue({
        isErr: () => false,
        isOk: () => true,
        value: { userId: 'user-1', hasSession: true },
      }),
    }

    const service = new DiscordAuthService(
      makeLoggerFactory() as never,
      userRepo as never,
      makeEnv() as never,
    )

    const interaction = makeChatInputInteraction({ userId: 'user-1' })

    await service.handleLoginCommand(interaction as never)

    expect(interaction.deferReply).toHaveBeenCalledWith({
      flags: MessageFlags.Ephemeral,
    })
    expect(interaction.editReply).toHaveBeenCalledWith(
      'Você já está logado! Use `/logout` para encerrar sua sessão.',
    )
    // deferReply must have been called before editReply
    assertCalledBefore(interaction.deferReply, interaction.editReply)
  })

  it('defers reply first then shows login button with "Você precisa conectar" when never connected (null session)', async () => {
    const userRepo = {
      hasActiveSession: vi.fn().mockResolvedValue({
        isErr: () => true,
        isOk: () => false,
        error: new Error('not found'),
      }),
    }

    const service = new DiscordAuthService(
      makeLoggerFactory() as never,
      userRepo as never,
      makeEnv() as never,
    )

    const interaction = makeChatInputInteraction({ userId: 'user-2' })

    await service.handleLoginCommand(interaction as never)

    expect(interaction.deferReply).toHaveBeenCalledWith({
      flags: MessageFlags.Ephemeral,
    })

    expect(interaction.editReply).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining('Você precisa conectar sua conta'),
        components: expect.arrayContaining([expect.anything()]),
      }),
    )

    // deferReply must have been called before editReply
    assertCalledBefore(interaction.deferReply, interaction.editReply)
  })

  it('defers reply first then shows login button with "Sua sessão expirou" when session is inactive', async () => {
    const userRepo = {
      hasActiveSession: vi.fn().mockResolvedValue({
        isErr: () => false,
        isOk: () => true,
        value: { userId: 'user-3', hasSession: false },
      }),
    }

    const service = new DiscordAuthService(
      makeLoggerFactory() as never,
      userRepo as never,
      makeEnv() as never,
    )

    const interaction = makeChatInputInteraction({ userId: 'user-3' })

    await service.handleLoginCommand(interaction as never)

    expect(interaction.deferReply).toHaveBeenCalledWith({
      flags: MessageFlags.Ephemeral,
    })

    expect(interaction.editReply).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining('Sua sessão expirou'),
        components: expect.arrayContaining([expect.anything()]),
      }),
    )

    // deferReply must have been called before editReply
    assertCalledBefore(interaction.deferReply, interaction.editReply)
  })
})
