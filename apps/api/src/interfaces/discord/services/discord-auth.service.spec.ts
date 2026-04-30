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

describe('DiscordAuthService.handleLogoutCommand', () => {
  it('defers reply first then replies "Erro interno ao verificar sessão" when hasActiveSession returns error', async () => {
    const userRepo = {
      hasActiveSession: vi.fn().mockResolvedValue({ status: 'error', error: new Error('db error') }),
      deleteSessionsByDiscordId: vi.fn(),
    }

    const service = new DiscordAuthService(
      makeLoggerFactory() as never,
      userRepo as never,
      makeEnv() as never,
    )

    const interaction = makeChatInputInteraction({ userId: 'user-1' })

    await service.handleLogoutCommand(interaction as never)

    expect(interaction.deferReply).toHaveBeenCalledWith({
      flags: MessageFlags.Ephemeral,
    })
    expect(interaction.editReply).toHaveBeenCalledWith(
      'Erro interno ao verificar sessão. Tente novamente.',
    )
    expect(userRepo.deleteSessionsByDiscordId).not.toHaveBeenCalled()
    assertCalledBefore(interaction.deferReply, interaction.editReply)
  })

  it('defers reply first then replies "Você não está registrado" when hasActiveSession returns null', async () => {
    const userRepo = {
      hasActiveSession: vi.fn().mockResolvedValue({ status: 'ok', value: null }),
      deleteSessionsByDiscordId: vi.fn(),
    }

    const service = new DiscordAuthService(
      makeLoggerFactory() as never,
      userRepo as never,
      makeEnv() as never,
    )

    const interaction = makeChatInputInteraction({ userId: 'user-2' })

    await service.handleLogoutCommand(interaction as never)

    expect(interaction.deferReply).toHaveBeenCalledWith({
      flags: MessageFlags.Ephemeral,
    })
    expect(interaction.editReply).toHaveBeenCalledWith(
      'Você não está registrado no sistema. Use `/login` para conectar sua conta.',
    )
    assertCalledBefore(interaction.deferReply, interaction.editReply)
  })

  it('defers reply first then replies "Você não possui sessão ativa" when hasSession is false', async () => {
    const userRepo = {
      hasActiveSession: vi.fn().mockResolvedValue({
        status: 'ok',
        value: { userId: 'user-3', hasSession: false },
      }),
      deleteSessionsByDiscordId: vi.fn(),
    }

    const service = new DiscordAuthService(
      makeLoggerFactory() as never,
      userRepo as never,
      makeEnv() as never,
    )

    const interaction = makeChatInputInteraction({ userId: 'user-3' })

    await service.handleLogoutCommand(interaction as never)

    expect(interaction.deferReply).toHaveBeenCalledWith({
      flags: MessageFlags.Ephemeral,
    })
    expect(interaction.editReply).toHaveBeenCalledWith(
      'Você não possui sessão ativa. Use `/login` para reconectar.',
    )
    assertCalledBefore(interaction.deferReply, interaction.editReply)
  })

  it('defers reply first then replies "Erro ao encerrar sessão" when deleteSessionsByDiscordId returns error', async () => {
    const userRepo = {
      hasActiveSession: vi.fn().mockResolvedValue({
        status: 'ok',
        value: { userId: 'user-4', hasSession: true },
      }),
      deleteSessionsByDiscordId: vi
        .fn()
        .mockResolvedValue({ status: 'error', error: new Error('db error') }),
    }

    const service = new DiscordAuthService(
      makeLoggerFactory() as never,
      userRepo as never,
      makeEnv() as never,
    )

    const interaction = makeChatInputInteraction({ userId: 'user-4' })

    await service.handleLogoutCommand(interaction as never)

    expect(interaction.deferReply).toHaveBeenCalledWith({
      flags: MessageFlags.Ephemeral,
    })
    expect(interaction.editReply).toHaveBeenCalledWith(
      'Erro ao encerrar sessão. Tente novamente.',
    )
    assertCalledBefore(interaction.deferReply, interaction.editReply)
  })

  it('defers reply first then replies success when session exists and delete succeeds', async () => {
    const userRepo = {
      hasActiveSession: vi.fn().mockResolvedValue({
        status: 'ok',
        value: { userId: 'user-5', hasSession: true },
      }),
      deleteSessionsByDiscordId: vi
        .fn()
        .mockResolvedValue({ status: 'ok', value: true }),
    }

    const service = new DiscordAuthService(
      makeLoggerFactory() as never,
      userRepo as never,
      makeEnv() as never,
    )

    const interaction = makeChatInputInteraction({ userId: 'user-5' })

    await service.handleLogoutCommand(interaction as never)

    expect(interaction.deferReply).toHaveBeenCalledWith({
      flags: MessageFlags.Ephemeral,
    })
    expect(interaction.editReply).toHaveBeenCalledWith(
      'Sessão encerrada com sucesso. Use `/login` quando quiser reconectar.',
    )
    assertCalledBefore(interaction.deferReply, interaction.editReply)
  })
})

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
