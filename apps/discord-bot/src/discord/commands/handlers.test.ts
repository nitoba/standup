import { NotFoundError, Result } from '@standup/domain'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// ---------------------------------------------------------------------------
// vi.hoisted
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => ({
  repoList: vi.fn(),
  getDb: vi.fn().mockReturnValue({}),
  hasActiveSession: vi.fn(),
  createPendingTriggerRequest: vi.fn(),
  checkRemoteServiceHealth: vi.fn(),
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
  function UserRepository() {
    return { hasActiveSession: mocks.hasActiveSession }
  }
  return { getDb: mocks.getDb, StandupRepository, UserRepository }
})

vi.mock('../handlers/trigger-request-store.js', () => ({
  createPendingTriggerRequest: mocks.createPendingTriggerRequest,
}))

vi.mock('../../services/service-health-check.js', () => ({
  checkRemoteServiceHealth: mocks.checkRemoteServiceHealth,
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
import { handleServices } from './services.js'
import { handleTrigger } from './trigger.js'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const DATABASE_URL = ':memory:'
const CHANNEL_ID = 'channel-123'
const API_BASE_URL = 'http://localhost:3333'
const WORKER_INTERNAL_URL = 'http://localhost:3335'

function makeInteraction(
  overrides: Partial<{
    userId: string
    statusOption: string | null
    pageOption: number | null
    searchOption: string | null
    idOption: string
    forceRegenerateOption: boolean | null
    extraContextOption: string | null
    serviceOption: string | null
  }> = {},
): ChatInputCommandInteraction {
  return {
    user: { id: overrides.userId ?? 'user-abc' },
    options: {
      getString: vi
        .fn()
        .mockImplementation((name: string, required?: boolean) => {
          if (name === 'status') return overrides.statusOption ?? null
          if (name === 'search') return overrides.searchOption ?? null
          if (name === 'id') return overrides.idOption ?? 'standup-abc'
          if (name === 'extra-context')
            return overrides.extraContextOption ?? null
          if (name === 'service') return overrides.serviceOption ?? null
          if (required) throw new Error(`Missing required option: ${name}`)
          return null
        }),
      getBoolean: vi.fn().mockImplementation((name: string) => {
        if (name === 'force-regenerate') {
          return overrides.forceRegenerateOption ?? null
        }
        return null
      }),
      getInteger: vi.fn().mockImplementation((name: string) => {
        if (name === 'page') return overrides.pageOption ?? null
        return null
      }),
    },
    reply: mocks.interactionReply.mockResolvedValue(undefined),
    deferReply: mocks.interactionDeferReply.mockResolvedValue(undefined),
    editReply: mocks.interactionEditReply.mockResolvedValue(undefined),
  } as unknown as ChatInputCommandInteraction
}

const fakeClient = {
  isReady: () => true,
} as unknown as Client

const standupRecord = {
  id: 'standup-abc',
  date: '2026-03-04',
  meetingType: 'daily',
  content: 'Standup content',
  sourceData: '{}',
  status: 'pending_review' as const,
  createdAt: 1000,
  dmMessageId: null,
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

  it('responde com confirmação ephemeral e botões, sem disparar API imediatamente', async () => {
    mocks.createPendingTriggerRequest.mockReturnValue({ id: 'req-123' })
    const interaction = makeInteraction()

    await handleTrigger(interaction, { apiBaseUrl: API_BASE_URL })

    expect(mocks.interactionReply).toHaveBeenCalledTimes(1)
    const [replyArg] = mocks.interactionReply.mock.calls[0] as [
      { content: string; flags: number; components?: unknown[] },
    ]
    expect(replyArg.flags).toBe(MessageFlags.Ephemeral)
    expect(replyArg.content).toMatch(/Confirme a geração manual/i)
    expect(replyArg.components?.length).toBe(1)
    expect(mocks.createPendingTriggerRequest).toHaveBeenCalledWith('user-abc', {
      forceRegenerate: false,
      extraContext: undefined,
    })
  })

  it('inclui force-regenerate e extra-context no request pendente', async () => {
    mocks.createPendingTriggerRequest.mockReturnValue({ id: 'req-456' })
    const interaction = makeInteraction({
      forceRegenerateOption: true,
      extraContextOption: 'focar no card 123',
    })

    await handleTrigger(interaction, { apiBaseUrl: API_BASE_URL })

    expect(mocks.createPendingTriggerRequest).toHaveBeenCalledWith('user-abc', {
      forceRegenerate: true,
      extraContext: 'focar no card 123',
    })
  })

  it('loga userId e metadados das opcoes', async () => {
    mocks.createPendingTriggerRequest.mockReturnValue({ id: 'req-789' })
    const interaction = makeInteraction({ userId: 'user-xyz' })

    await handleTrigger(interaction, { apiBaseUrl: API_BASE_URL })

    expect(mocks.loggerInfo).toHaveBeenCalledWith(
      expect.stringContaining('trigger'),
      expect.objectContaining({
        userId: 'user-xyz',
        forceRegenerate: false,
        hasExtraContext: false,
      }),
    )
  })
})

describe('handleList', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.hasActiveSession.mockReturnValue(
      Result.ok({ userId: 'resolved-user-id', hasSession: true }),
    )
  })
  afterEach(() => vi.restoreAllMocks())

  it('lista standups sem filtro e exibe embeds', async () => {
    mocks.repoList.mockResolvedValue(
      Result.ok({
        items: [standupRecord],
        page: 1,
        pageSize: 10,
        total: 1,
        totalPages: 1,
        summary: { total: 1, approved: 0, pending: 1, rejected: 0 },
      }),
    )
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
    mocks.repoList.mockResolvedValue(
      Result.ok({
        items: [standupRecord],
        page: 2,
        pageSize: 10,
        total: 11,
        totalPages: 2,
        summary: { total: 11, approved: 0, pending: 11, rejected: 0 },
      }),
    )
    const interaction = makeInteraction({
      statusOption: 'pending_review',
      pageOption: 2,
    })

    await handleList(interaction, { databaseUrl: DATABASE_URL })

    expect(mocks.repoList).toHaveBeenCalledWith({
      status: 'pending_review',
      userId: 'resolved-user-id',
      search: undefined,
      page: 2,
      pageSize: 10,
    })
  })

  it('lista standups com busca textual', async () => {
    mocks.repoList.mockResolvedValue(
      Result.ok({
        items: [standupRecord],
        page: 1,
        pageSize: 10,
        total: 1,
        totalPages: 1,
        summary: { total: 1, approved: 0, pending: 1, rejected: 0 },
      }),
    )
    const interaction = makeInteraction({ searchOption: 'retry' })

    await handleList(interaction, { databaseUrl: DATABASE_URL })

    expect(mocks.repoList).toHaveBeenCalledWith({
      userId: 'resolved-user-id',
      search: 'retry',
      page: 1,
      pageSize: 10,
    })
    expect(mocks.interactionEditReply).toHaveBeenCalledWith(
      expect.objectContaining({ embeds: expect.any(Array) }),
    )
  })

  it('responde com mensagem de lista vazia quando não há standups', async () => {
    mocks.repoList.mockResolvedValue(
      Result.ok({
        items: [],
        page: 1,
        pageSize: 10,
        total: 0,
        totalPages: 0,
        summary: { total: 0, approved: 0, pending: 0, rejected: 0 },
      }),
    )
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

describe('handleServices', () => {
  beforeEach(() => vi.clearAllMocks())
  afterEach(() => vi.restoreAllMocks())

  it('retorna status de api, worker e bot quando filtro não é informado', async () => {
    mocks.checkRemoteServiceHealth
      .mockResolvedValueOnce({
        service: 'api',
        ok: true,
        latencyMs: 20,
        statusCode: 200,
        uptimeSeconds: 120,
      })
      .mockResolvedValueOnce({
        service: 'worker',
        ok: true,
        latencyMs: 31,
        statusCode: 200,
        uptimeSeconds: 450,
      })

    const interaction = makeInteraction()

    await handleServices(interaction, {
      apiBaseUrl: API_BASE_URL,
      workerInternalUrl: WORKER_INTERNAL_URL,
      client: fakeClient,
    })

    expect(mocks.interactionDeferReply).toHaveBeenCalledWith({
      flags: MessageFlags.Ephemeral,
    })
    expect(mocks.checkRemoteServiceHealth).toHaveBeenCalledTimes(2)
    expect(mocks.checkRemoteServiceHealth).toHaveBeenNthCalledWith(
      1,
      'api',
      API_BASE_URL,
    )
    expect(mocks.checkRemoteServiceHealth).toHaveBeenNthCalledWith(
      2,
      'worker',
      WORKER_INTERNAL_URL,
    )
    expect(mocks.interactionEditReply).toHaveBeenCalledWith(
      expect.objectContaining({ embeds: expect.any(Array) }),
    )
  })

  it('filtra por worker quando service=worker', async () => {
    mocks.checkRemoteServiceHealth.mockResolvedValue({
      service: 'worker',
      ok: false,
      latencyMs: 3001,
      statusCode: 503,
      error: 'HTTP 503',
    })

    const interaction = makeInteraction({ serviceOption: 'worker' })

    await handleServices(interaction, {
      apiBaseUrl: API_BASE_URL,
      workerInternalUrl: WORKER_INTERNAL_URL,
      client: fakeClient,
    })

    expect(mocks.checkRemoteServiceHealth).toHaveBeenCalledTimes(1)
    expect(mocks.checkRemoteServiceHealth).toHaveBeenCalledWith(
      'worker',
      WORKER_INTERNAL_URL,
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
      {
        actorDiscordId: 'user-abc',
        databaseUrl: DATABASE_URL,
        discordChannelId: CHANNEL_ID,
      },
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
