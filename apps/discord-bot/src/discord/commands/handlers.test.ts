import { ExternalServiceError, NotFoundError, Result } from '@standup/domain'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// ---------------------------------------------------------------------------
// vi.hoisted
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => ({
  repoList: vi.fn(),
  getDb: vi.fn().mockReturnValue({}),
  triggerStandup: vi.fn(),
  handleInteraction: vi.fn(),
  loggerInfo: vi.fn(),
  loggerError: vi.fn(),
  interactionReply: vi.fn(),
  interactionDeferReply: vi.fn(),
  interactionEditReply: vi.fn(),
}))

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@standup/logger', () => ({
  createServiceLogger: vi.fn().mockReturnValue({
    info: mocks.loggerInfo,
    error: mocks.loggerError,
  }),
}))

vi.mock('@standup/db', () => {
  function StandupRepository() {
    return { list: mocks.repoList }
  }
  return { getDb: mocks.getDb, StandupRepository }
})

vi.mock('../../services/trigger-standup-service.js', () => ({
  triggerStandup: mocks.triggerStandup,
}))

// ---------------------------------------------------------------------------
// Import após mocks
// ---------------------------------------------------------------------------

import {
  type ChatInputCommandInteraction,
  type Client,
  MessageFlags,
} from 'discord.js'
import { handleApproveCommand } from './approve.js'
import { handleList } from './list.js'
import { handleTrigger } from './trigger.js'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const DATABASE_URL = ':memory:'
const CHANNEL_ID = 'channel-123'
const API_BASE_URL = 'http://localhost:3333'

function makeInteraction(
  overrides: Partial<{
    userId: string
    statusOption: string | null
    idOption: string
  }> = {},
): ChatInputCommandInteraction {
  return {
    user: { id: overrides.userId ?? 'user-abc' },
    options: {
      getString: vi
        .fn()
        .mockImplementation((name: string, required?: boolean) => {
          if (name === 'status') return overrides.statusOption ?? null
          if (name === 'id') return overrides.idOption ?? 'standup-abc'
          if (required) throw new Error(`Missing required option: ${name}`)
          return null
        }),
    },
    reply: mocks.interactionReply.mockResolvedValue(undefined),
    deferReply: mocks.interactionDeferReply.mockResolvedValue(undefined),
    editReply: mocks.interactionEditReply.mockResolvedValue(undefined),
  } as unknown as ChatInputCommandInteraction
}

const fakeClient = {} as unknown as Client

const standupRecord = {
  id: 'standup-abc',
  date: '2026-03-04',
  meetingType: 'daily',
  content: 'Standup content',
  sourceData: '{}',
  status: 'pending_review' as const,
  createdAt: 1000,
  updatedAt: 1000,
}

const deps = {
  databaseUrl: DATABASE_URL,
  discordChannelId: CHANNEL_ID,
  handleInteraction: mocks.handleInteraction,
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('handleTrigger', () => {
  beforeEach(() => vi.clearAllMocks())
  afterEach(() => vi.restoreAllMocks())

  it('responde com sucesso quando API aceita trigger manual', async () => {
    mocks.triggerStandup.mockResolvedValue(Result.ok({ accepted: true }))
    const interaction = makeInteraction()

    await handleTrigger(interaction, { apiBaseUrl: API_BASE_URL })

    expect(mocks.interactionReply).toHaveBeenCalledTimes(1)
    const [replyArg] = mocks.interactionReply.mock.calls[0] as [
      { content: string; flags: number },
    ]
    expect(replyArg.flags).toBe(MessageFlags.Ephemeral)
    expect(replyArg.content).toMatch(/sucesso/i)
    expect(mocks.triggerStandup).toHaveBeenCalledWith('user-abc', {
      apiBaseUrl: API_BASE_URL,
    })
  })

  it('responde com mensagem de autorizado quando API retorna forbidden', async () => {
    mocks.triggerStandup.mockResolvedValue(
      Result.ok({ accepted: false, reason: 'forbidden' }),
    )
    const interaction = makeInteraction()

    await handleTrigger(interaction, { apiBaseUrl: API_BASE_URL })

    const [replyArg] = mocks.interactionReply.mock.calls[0] as [
      { content: string; flags: number },
    ]
    expect(replyArg.content).toMatch(/nao esta autorizado/i)
  })

  it('responde com erro quando chamada ao API falha', async () => {
    mocks.triggerStandup.mockResolvedValue(
      Result.err(
        new ExternalServiceError({
          service: 'api',
          message: 'HTTP 503',
        }),
      ),
    )
    const interaction = makeInteraction()

    await handleTrigger(interaction, { apiBaseUrl: API_BASE_URL })

    const [replyArg] = mocks.interactionReply.mock.calls[0] as [
      { content: string; flags: number },
    ]
    expect(replyArg.content).toMatch(/falha ao disparar/i)
  })

  it('loga o userId do usuario que disparou o comando', async () => {
    mocks.triggerStandup.mockResolvedValue(Result.ok({ accepted: true }))
    const interaction = makeInteraction({ userId: 'user-xyz' })

    await handleTrigger(interaction, { apiBaseUrl: API_BASE_URL })

    expect(mocks.loggerInfo).toHaveBeenCalledWith(
      expect.stringContaining('trigger'),
      expect.objectContaining({ userId: 'user-xyz' }),
    )
  })
})

describe('handleList', () => {
  beforeEach(() => vi.clearAllMocks())
  afterEach(() => vi.restoreAllMocks())

  it('lista standups sem filtro e exibe embeds', async () => {
    mocks.repoList.mockResolvedValue(Result.ok([standupRecord]))
    const interaction = makeInteraction({ statusOption: null })

    await handleList(interaction, { databaseUrl: DATABASE_URL })

    expect(mocks.interactionDeferReply).toHaveBeenCalledWith({
      flags: MessageFlags.Ephemeral,
    })
    expect(mocks.interactionEditReply).toHaveBeenCalledWith(
      expect.objectContaining({ embeds: expect.any(Array) }),
    )
    const [editArg] = mocks.interactionEditReply.mock.calls[0] as [
      { embeds: unknown[] },
    ]
    expect(editArg.embeds.length).toBeGreaterThan(0)
  })

  it('lista standups com filtro de status', async () => {
    mocks.repoList.mockResolvedValue(Result.ok([standupRecord]))
    const interaction = makeInteraction({ statusOption: 'pending_review' })

    await handleList(interaction, { databaseUrl: DATABASE_URL })

    expect(mocks.repoList).toHaveBeenCalledWith({ status: 'pending_review' })
  })

  it('responde com mensagem de lista vazia quando não há standups', async () => {
    mocks.repoList.mockResolvedValue(Result.ok([]))
    const interaction = makeInteraction({ statusOption: null })

    await handleList(interaction, { databaseUrl: DATABASE_URL })

    expect(mocks.interactionEditReply).toHaveBeenCalledWith(
      expect.stringContaining('Nenhum standup'),
    )
  })

  it('responde com mensagem de erro quando repositório falha', async () => {
    mocks.repoList.mockResolvedValue(
      Result.err(new NotFoundError({ resource: 'standup', id: 'all' })),
    )
    const interaction = makeInteraction()

    await handleList(interaction, { databaseUrl: DATABASE_URL })

    expect(mocks.interactionEditReply).toHaveBeenCalledWith(
      expect.stringContaining('Erro'),
    )
  })
})

describe('handleApproveCommand', () => {
  beforeEach(() => vi.clearAllMocks())
  afterEach(() => vi.restoreAllMocks())

  it('delega para handleInteraction com approve e responde com sucesso', async () => {
    mocks.handleInteraction.mockResolvedValue(
      Result.ok({
        action: 'approve',
        standupId: 'standup-abc',
        message: 'Aprovado!',
      }),
    )
    const interaction = makeInteraction({ idOption: 'standup-abc' })

    await handleApproveCommand(interaction, fakeClient, deps)

    expect(mocks.interactionDeferReply).toHaveBeenCalledWith({
      flags: MessageFlags.Ephemeral,
    })
    expect(mocks.handleInteraction).toHaveBeenCalledWith(
      'approve',
      'standup-abc',
      { databaseUrl: DATABASE_URL, discordChannelId: CHANNEL_ID },
      fakeClient,
    )
    expect(mocks.interactionEditReply).toHaveBeenCalledWith(
      expect.stringContaining('Aprovado!'),
    )
  })

  it('responde com mensagem de erro quando handleInteraction falha', async () => {
    mocks.handleInteraction.mockResolvedValue(
      Result.err(new NotFoundError({ resource: 'standup', id: 'standup-abc' })),
    )
    const interaction = makeInteraction({ idOption: 'standup-abc' })

    await handleApproveCommand(interaction, fakeClient, deps)

    expect(mocks.interactionEditReply).toHaveBeenCalledWith(
      expect.stringContaining('Erro'),
    )
  })
})
