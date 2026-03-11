import { Result } from '@standup/domain'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  handleStandupInteraction: vi.fn(),
  notifyStandupStatusEvent: vi.fn().mockResolvedValue(undefined),
  handleReminderInteraction: vi.fn(),
  handleTriggerButtonInteraction: vi.fn(),
  handleCopyButtonInteraction: vi.fn(),
  handleSettingsButton: vi.fn(),
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

vi.mock('../../http/notify/standup-status-event.js', () => ({
  notifyStandupStatusEvent: mocks.notifyStandupStatusEvent,
}))

vi.mock('./reminder-handler.js', () => ({
  handleReminderInteraction: mocks.handleReminderInteraction,
}))

vi.mock('./trigger-handler.js', () => ({
  handleTriggerButtonInteraction: mocks.handleTriggerButtonInteraction,
}))

vi.mock('./copy-handler.js', () => ({
  handleCopyButtonInteraction: mocks.handleCopyButtonInteraction,
}))

vi.mock('./settings-button-handler.js', () => ({
  handleSettingsButton: mocks.handleSettingsButton,
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
  WORKER_INTERNAL_URL: 'http://localhost:3335',
  API_BASE_URL: 'http://localhost:3333',
  API_INTERNAL_URL: 'http://localhost:3333',
  REPOS_ROOT_PATH: '/repos',
}

describe('handleButtonInteraction', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('ignora botão fora do namespace standup', async () => {
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
      {
        apiBaseUrl: 'http://localhost:3333',
        internalSecret: 'test-secret',
        databaseUrl: ':memory:',
      },
    )
    expect(deferUpdate).not.toHaveBeenCalled()
    expect(editReply).not.toHaveBeenCalled()
    expect(mocks.handleStandupInteraction).not.toHaveBeenCalled()
  })

  it('delega standup-copy:* para copy-handler', async () => {
    const { interaction, deferUpdate, editReply } = makeInteraction(
      'standup-copy:content:standup-1',
    )

    await handleButtonInteraction(interaction, fakeClient, env)

    expect(mocks.handleCopyButtonInteraction).toHaveBeenCalledWith(
      interaction,
      'content',
      'standup-1',
      { databaseUrl: ':memory:' },
    )
    expect(deferUpdate).not.toHaveBeenCalled()
    expect(editReply).not.toHaveBeenCalled()
  })

  it('mostra modal de approve com campos de custom entries', async () => {
    const { interaction, deferUpdate, showModal } = makeInteraction(
      'standup:approve:standup-1',
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

    expect(json.custom_id).toBe('standup-approve-modal:standup-1')
    expect(json.title).toBe('Aprovar Standup')
    expect(json.components).toHaveLength(2)
    expect(json.components[0]?.components[0]?.custom_id).toBe(
      'scheduled-meetings',
    )
    expect(json.components[1]?.components[0]?.custom_id).toBe('direct-calls')
  })

  it('deferUpdate, delega reject e responde com emoji de sucesso', async () => {
    mocks.handleStandupInteraction.mockResolvedValue(
      Result.ok({
        action: 'reject',
        standupId: 'standup-1',
        userId: 'user-123',
        newStatus: 'rejected',
        message: 'Standup rejeitado',
      }),
    )
    const { interaction, deferUpdate, editReply } = makeInteraction(
      'standup:reject:standup-1',
    )

    await handleButtonInteraction(interaction, fakeClient, env)

    expect(deferUpdate).toHaveBeenCalledTimes(1)
    expect(mocks.handleStandupInteraction).toHaveBeenCalledWith(
      'reject',
      'standup-1',
      {
        actorDiscordId: 'user-123',
        databaseUrl: ':memory:',
        discordChannelId: 'channel-123',
      },
      fakeClient,
    )
    expect(editReply).toHaveBeenCalledWith({
      content: '\u{274C} Standup rejeitado',
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
      content: '\u{274C} Erro ao processar ação: database unavailable',
      components: [],
    })
  })

  it('mostra modal de regeneração em vez de processar imediatamente', async () => {
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
      'Contexto adicional (opcional)',
    )
  })

  it('mostra modal de ajuste em cima do texto atual', async () => {
    const { interaction, deferUpdate, showModal } = makeInteraction(
      'standup:adjust:standup-1',
    )

    await handleButtonInteraction(interaction, fakeClient, env)

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

    expect(json.custom_id).toBe('standup-adjust-modal:standup-1')
    expect(json.title).toBe('Ajustar Standup Atual')
    expect(json.components[0]?.components[0]?.custom_id).toBe(
      'adjust-instruction',
    )
    expect(json.components[0]?.components[0]?.label).toBe(
      'Quais alterações você quer no texto?',
    )
  })
})
