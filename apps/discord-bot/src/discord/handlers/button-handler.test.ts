import { Result } from '@standup/domain'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  handleStandupInteraction: vi.fn(),
  handleReminderInteraction: vi.fn(),
  handleTriggerButtonInteraction: vi.fn(),
  loggerInfo: vi.fn(),
  loggerError: vi.fn(),
  withContextInfo: vi.fn(),
  withContextError: vi.fn(),
}))

vi.mock('@standup/logger', () => ({
  createServiceLogger: vi.fn().mockReturnValue({
    info: mocks.loggerInfo,
    error: mocks.loggerError,
  }),
  withContext: vi.fn().mockReturnValue({
    info: mocks.withContextInfo,
    error: mocks.withContextError,
  }),
}))

vi.mock('./interaction-handler.js', () => ({
  handleStandupInteraction: mocks.handleStandupInteraction,
}))

vi.mock('./reminder-handler.js', () => ({
  handleReminderInteraction: mocks.handleReminderInteraction,
}))

vi.mock('./trigger-handler.js', () => ({
  handleTriggerButtonInteraction: mocks.handleTriggerButtonInteraction,
}))

import type { ButtonInteraction, Client } from 'discord.js'
import { handleButtonInteraction } from './button-handler.js'

function makeInteraction(customId: string): {
  interaction: ButtonInteraction
  deferUpdate: ReturnType<typeof vi.fn>
  editReply: ReturnType<typeof vi.fn>
  showModal: ReturnType<typeof vi.fn>
} {
  const deferUpdate = vi.fn().mockResolvedValue(undefined)
  const editReply = vi.fn().mockResolvedValue(undefined)
  const showModal = vi.fn().mockResolvedValue(undefined)

  return {
    interaction: {
      customId,
      user: { id: 'user-123' },
      deferUpdate,
      editReply,
      showModal,
    } as unknown as ButtonInteraction,
    deferUpdate,
    editReply,
    showModal,
  }
}

const fakeClient = {} as unknown as Client
const env = {
  DATABASE_URL: ':memory:',
  DISCORD_CHANNEL_ID: 'channel-123',
  INTERNAL_SECRET: 'test-secret',
  DISCORD_USER_ID: 'user-123',
  WORKER_INTERNAL_URL: 'http://localhost:3335',
  API_BASE_URL: 'http://localhost:3333',
}

describe('handleButtonInteraction', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('ignora botao fora do namespace standup', async () => {
    const { interaction, deferUpdate, editReply } = makeInteraction(
      'other:approve:standup-1',
    )

    await handleButtonInteraction(interaction, fakeClient, env)

    expect(deferUpdate).not.toHaveBeenCalled()
    expect(mocks.handleStandupInteraction).not.toHaveBeenCalled()
    expect(editReply).not.toHaveBeenCalled()
  })

  it('delega standup-trigger:* para trigger-handler', async () => {
    const { interaction, deferUpdate, editReply } = makeInteraction(
      'standup-trigger:confirm:req-123',
    )

    await handleButtonInteraction(interaction, fakeClient, env)

    expect(mocks.handleTriggerButtonInteraction).toHaveBeenCalledWith(
      interaction,
      'confirm',
      'req-123',
      { apiBaseUrl: 'http://localhost:3333' },
    )
    expect(deferUpdate).not.toHaveBeenCalled()
    expect(editReply).not.toHaveBeenCalled()
    expect(mocks.handleStandupInteraction).not.toHaveBeenCalled()
  })

  it('deferUpdate, delega interacao e responde com emoji de sucesso', async () => {
    mocks.handleStandupInteraction.mockResolvedValue(
      Result.ok({
        action: 'approve',
        standupId: 'standup-1',
        message: 'Standup aprovado',
      }),
    )
    const { interaction, deferUpdate, editReply } = makeInteraction(
      'standup:approve:standup-1',
    )

    await handleButtonInteraction(interaction, fakeClient, env)

    expect(deferUpdate).toHaveBeenCalledTimes(1)
    expect(mocks.handleStandupInteraction).toHaveBeenCalledWith(
      'approve',
      'standup-1',
      {
        databaseUrl: ':memory:',
        discordChannelId: 'channel-123',
      },
      fakeClient,
    )
    expect(editReply).toHaveBeenCalledWith({
      content: '\u{2705} Standup aprovado',
      components: [],
    })
  })

  it('responde erro quando interaction-handler retorna Err', async () => {
    mocks.handleStandupInteraction.mockResolvedValue(
      Result.err(new Error('database unavailable')),
    )
    const { interaction, editReply } = makeInteraction(
      'standup:reject:standup-1',
    )

    await handleButtonInteraction(interaction, fakeClient, env)

    expect(editReply).toHaveBeenCalledWith({
      content: '\u{274C} Erro ao processar acao: database unavailable',
      components: [],
    })
  })

  it('mostra modal de regeneracao em vez de processar imediatamente', async () => {
    const { interaction, deferUpdate, showModal } = makeInteraction(
      'standup:regenerate:standup-1',
    )

    await handleButtonInteraction(interaction, fakeClient, env)

    // Modal must be shown immediately (no deferUpdate before it)
    expect(deferUpdate).not.toHaveBeenCalled()
    expect(mocks.handleStandupInteraction).not.toHaveBeenCalled()
    expect(showModal).toHaveBeenCalledTimes(1)

    const modalBuilder = showModal.mock.calls[0]?.[0] as {
      toJSON: () => {
        custom_id: string
        title: string
        components: Array<{
          components: Array<{
            custom_id: string
            label: string
          }>
        }>
      }
    }
    const json = modalBuilder.toJSON()

    expect(json.custom_id).toBe('standup-regenerate-modal:standup-1')
    expect(json.title).toBe('Regenerar Standup')
    expect(json.components).toHaveLength(1)
    expect(json.components[0]?.components[0]?.custom_id).toBe(
      'regenerate-context',
    )
    expect(json.components[0]?.components[0]?.label).toBe(
      'O que deseja alterar?',
    )
  })
})
