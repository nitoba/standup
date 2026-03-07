import { Result } from '@standup/domain'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  handleStandupInteraction: vi.fn(),
  getDb: vi.fn().mockReturnValue({}),
  repoUpdateCustomEntries: vi.fn(),
  repoUpdateContent: vi.fn(),
  findUserIdByDiscordId: vi.fn(),
  loggerInfo: vi.fn(),
  loggerError: vi.fn(),
  loggerWarn: vi.fn(),
  withContextInfo: vi.fn(),
  withContextError: vi.fn(),
  withContextWarn: vi.fn(),
}))

vi.mock('@standup/logger', () => ({
  createServiceLogger: vi.fn().mockReturnValue({
    info: mocks.loggerInfo,
    error: mocks.loggerError,
    warn: mocks.loggerWarn,
  }),
  withContext: vi.fn().mockReturnValue({
    info: mocks.withContextInfo,
    error: mocks.withContextError,
    warn: mocks.withContextWarn,
  }),
}))

vi.mock('./interaction-handler.js', () => ({
  handleStandupInteraction: mocks.handleStandupInteraction,
}))

vi.mock('@standup/db', () => {
  function StandupRepository() {
    return {
      updateCustomEntriesForUser: mocks.repoUpdateCustomEntries,
      updateContentForUser: mocks.repoUpdateContent,
    }
  }
  function UserRepository() {
    return {
      findUserIdByDiscordId: mocks.findUserIdByDiscordId,
    }
  }
  return { getDb: mocks.getDb, StandupRepository, UserRepository }
})

import type { Client, ModalSubmitInteraction } from 'discord.js'
import { handleApproveModal } from './approve-modal-handler.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeModalInteraction(
  customId: string,
  fields: Record<string, string> = {},
): {
  interaction: ModalSubmitInteraction
  deferUpdate: ReturnType<typeof vi.fn>
  editReply: ReturnType<typeof vi.fn>
} {
  const deferUpdate = vi.fn().mockResolvedValue(undefined)
  const editReply = vi.fn().mockResolvedValue(undefined)

  return {
    interaction: {
      customId,
      user: { id: 'user-123' },
      fields: {
        getTextInputValue: vi.fn().mockImplementation((key: string) => {
          return fields[key] ?? ''
        }),
      },
      deferUpdate,
      editReply,
    } as unknown as ModalSubmitInteraction,
    deferUpdate,
    editReply,
  }
}

const fakeClient = {} as unknown as Client
const env = {
  DATABASE_URL: ':memory:',
  DISCORD_CHANNEL_ID: 'channel-123',
}

const baseRecord = {
  id: 'standup-1',
  date: '2026-03-06',
  meetingType: '\u{1F4C6} (Planing Web)',
  content:
    '**Standup (06/03/2026)**\n\u{1F4C6} (Planing Web)\n\n**\u{1F4CC} agrotrace-web**\n\n**\u{2705} Done:**\n\u{27A8} #1234 - Bug fix',
  sourceData: '{}',
  customEntries: null,
  status: 'pending_review' as const,
  createdAt: 1000,
  updatedAt: 1000,
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('handleApproveModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.findUserIdByDiscordId.mockReturnValue(Result.ok('user-123'))
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('ignora modal com namespace invalido', async () => {
    const { interaction, deferUpdate } = makeModalInteraction(
      'other-modal:standup-1',
    )

    await handleApproveModal(interaction, fakeClient, env)

    expect(deferUpdate).not.toHaveBeenCalled()
    expect(mocks.handleStandupInteraction).not.toHaveBeenCalled()
  })

  it('aprova sem custom entries quando campos estao vazios', async () => {
    mocks.handleStandupInteraction.mockResolvedValue(
      Result.ok({
        action: 'approve',
        standupId: 'standup-1',
        message: 'Standup aprovado e publicado no canal!',
      }),
    )

    const { interaction, deferUpdate, editReply } = makeModalInteraction(
      'standup-approve-modal:standup-1',
      { 'scheduled-meetings': '', 'direct-calls': '' },
    )

    await handleApproveModal(interaction, fakeClient, env)

    expect(deferUpdate).toHaveBeenCalledTimes(1)

    // Should NOT save custom entries when both are empty
    expect(mocks.repoUpdateCustomEntries).not.toHaveBeenCalled()
    expect(mocks.repoUpdateContent).not.toHaveBeenCalled()

    // Should proceed with normal approve flow
    expect(mocks.handleStandupInteraction).toHaveBeenCalledWith(
      'approve',
      'standup-1',
      {
        actorDiscordId: 'user-123',
        databaseUrl: ':memory:',
        discordChannelId: 'channel-123',
      },
      fakeClient,
    )

    expect(editReply).toHaveBeenCalledWith({
      content: '\u{2705} Standup aprovado e publicado no canal!',
      components: [],
    })
  })

  it('salva custom entries, faz merge no content e aprova', async () => {
    const recordWithEntries = {
      ...baseRecord,
      customEntries: {
        scheduledMeetings: ['Planning Backend'],
        directCalls: ['Call com Joao'],
      },
    }
    mocks.repoUpdateCustomEntries.mockResolvedValue(
      Result.ok(recordWithEntries),
    )
    mocks.repoUpdateContent.mockResolvedValue(
      Result.ok({ ...recordWithEntries, content: 'merged content' }),
    )
    mocks.handleStandupInteraction.mockResolvedValue(
      Result.ok({
        action: 'approve',
        standupId: 'standup-1',
        message: 'Standup aprovado e publicado no canal!',
      }),
    )

    const { interaction, editReply } = makeModalInteraction(
      'standup-approve-modal:standup-1',
      {
        'scheduled-meetings': 'Planning Backend',
        'direct-calls': 'Call com Joao',
      },
    )

    await handleApproveModal(interaction, fakeClient, env)

    // Should save custom entries
    expect(mocks.repoUpdateCustomEntries).toHaveBeenCalledWith(
      'standup-1',
      'user-123',
      {
        scheduledMeetings: ['Planning Backend'],
        directCalls: ['Call com Joao'],
      },
    )

    // Should merge and update content
    expect(mocks.repoUpdateContent).toHaveBeenCalledWith(
      'standup-1',
      'user-123',
      expect.stringContaining('\u{1F4C6} (Planning Backend)'),
    )

    // Should approve
    expect(mocks.handleStandupInteraction).toHaveBeenCalledWith(
      'approve',
      'standup-1',
      {
        actorDiscordId: 'user-123',
        databaseUrl: ':memory:',
        discordChannelId: 'channel-123',
      },
      fakeClient,
    )

    // Success message should mention entries
    expect(editReply).toHaveBeenCalledWith({
      content: expect.stringContaining('Entradas adicionadas'),
      components: [],
    })
  })

  it('parseia multiplas linhas corretamente e ignora linhas vazias', async () => {
    const recordWithEntries = {
      ...baseRecord,
      customEntries: {
        scheduledMeetings: ['Meeting A', 'Meeting B'],
        directCalls: ['Call X'],
      },
    }
    mocks.repoUpdateCustomEntries.mockResolvedValue(
      Result.ok(recordWithEntries),
    )
    mocks.repoUpdateContent.mockResolvedValue(Result.ok(recordWithEntries))
    mocks.handleStandupInteraction.mockResolvedValue(
      Result.ok({
        action: 'approve',
        standupId: 'standup-1',
        message: 'ok',
      }),
    )

    const { interaction } = makeModalInteraction(
      'standup-approve-modal:standup-1',
      {
        'scheduled-meetings': 'Meeting A\n\nMeeting B\n  ',
        'direct-calls': '\nCall X\n',
      },
    )

    await handleApproveModal(interaction, fakeClient, env)

    expect(mocks.repoUpdateCustomEntries).toHaveBeenCalledWith(
      'standup-1',
      'user-123',
      {
        scheduledMeetings: ['Meeting A', 'Meeting B'],
        directCalls: ['Call X'],
      },
    )
  })

  it('retorna erro quando falha ao salvar custom entries', async () => {
    mocks.repoUpdateCustomEntries.mockResolvedValue(
      Result.err(new Error('DB error')),
    )

    const { interaction, editReply } = makeModalInteraction(
      'standup-approve-modal:standup-1',
      { 'scheduled-meetings': 'Meeting A', 'direct-calls': '' },
    )

    await handleApproveModal(interaction, fakeClient, env)

    expect(editReply).toHaveBeenCalledWith({
      content: expect.stringContaining('Erro ao salvar entradas customizadas'),
      components: [],
    })
    expect(mocks.handleStandupInteraction).not.toHaveBeenCalled()
  })

  it('retorna erro quando falha ao atualizar content', async () => {
    mocks.repoUpdateCustomEntries.mockResolvedValue(Result.ok(baseRecord))
    mocks.repoUpdateContent.mockResolvedValue(
      Result.err(new Error('DB error on content')),
    )

    const { interaction, editReply } = makeModalInteraction(
      'standup-approve-modal:standup-1',
      { 'scheduled-meetings': '', 'direct-calls': 'Call com QA' },
    )

    await handleApproveModal(interaction, fakeClient, env)

    expect(editReply).toHaveBeenCalledWith({
      content: expect.stringContaining('Erro ao atualizar conteudo'),
      components: [],
    })
    expect(mocks.handleStandupInteraction).not.toHaveBeenCalled()
  })

  it('retorna erro quando approve falha apos merge', async () => {
    mocks.repoUpdateCustomEntries.mockResolvedValue(Result.ok(baseRecord))
    mocks.repoUpdateContent.mockResolvedValue(Result.ok(baseRecord))
    mocks.handleStandupInteraction.mockResolvedValue(
      Result.err(new Error('State transition failed')),
    )

    const { interaction, editReply } = makeModalInteraction(
      'standup-approve-modal:standup-1',
      { 'scheduled-meetings': 'Extra', 'direct-calls': '' },
    )

    await handleApproveModal(interaction, fakeClient, env)

    expect(editReply).toHaveBeenCalledWith({
      content: expect.stringContaining('Erro ao aprovar'),
      components: [],
    })
  })

  it('salva apenas calls diretas quando nao ha reunioes extras', async () => {
    mocks.repoUpdateCustomEntries.mockResolvedValue(Result.ok(baseRecord))
    mocks.repoUpdateContent.mockResolvedValue(Result.ok(baseRecord))
    mocks.handleStandupInteraction.mockResolvedValue(
      Result.ok({
        action: 'approve',
        standupId: 'standup-1',
        message: 'ok',
      }),
    )

    const { interaction } = makeModalInteraction(
      'standup-approve-modal:standup-1',
      { 'scheduled-meetings': '', 'direct-calls': 'Sync com QA' },
    )

    await handleApproveModal(interaction, fakeClient, env)

    expect(mocks.repoUpdateCustomEntries).toHaveBeenCalledWith(
      'standup-1',
      'user-123',
      {
        scheduledMeetings: [],
        directCalls: ['Sync com QA'],
      },
    )
  })

  it('retorna erro quando actor não pode ser resolvido', async () => {
    mocks.findUserIdByDiscordId.mockReturnValue(Result.ok(null))

    const { interaction, editReply } = makeModalInteraction(
      'standup-approve-modal:standup-1',
      { 'scheduled-meetings': '', 'direct-calls': '' },
    )

    await handleApproveModal(interaction, fakeClient, env)

    expect(editReply).toHaveBeenCalledWith({
      content: '❌ Usuário não registrado. Use /login primeiro.',
      components: [],
    })
    expect(mocks.handleStandupInteraction).not.toHaveBeenCalled()
  })
})
