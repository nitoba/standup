import { Result } from '@standup/domain'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  handleStandupInteraction: vi.fn(),
  handleReminderInteraction: vi.fn(),
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

    // Inspect the ModalBuilder's internal data to verify structure.
    // LabelBuilder stores: data.label (string), data.component (TextInputBuilder instance).
    // TextInputBuilder stores: data.custom_id (string).
    const modalBuilder = showModal.mock.calls[0]?.[0] as {
      data: { custom_id: string; title: string }
      components: Array<{
        data: {
          label?: string
          component?: { data?: { custom_id?: string } }
        }
      }>
    }
    expect(modalBuilder.data.custom_id).toBe(
      'standup-regenerate-modal:standup-1',
    )
    expect(modalBuilder.data.title).toBe('Regenerar Standup')
    expect(modalBuilder.components).toHaveLength(1)
    // LabelBuilder wraps a TextInputBuilder. In the Node/Vitest env,
    // the internal structure is: LabelBuilder.data.data = { label, type, component }.
    // We verify the modal customId/title from the top-level data,
    // and the label + input customId from the nested label builder data.
    const comp0 = modalBuilder.components[0] as unknown as {
      data: {
        data?: { label?: string }
      }
    }
    expect(modalBuilder.components).toHaveLength(1)
    expect(comp0?.data?.data?.label).toBe('O que deseja alterar?')
  })
})
