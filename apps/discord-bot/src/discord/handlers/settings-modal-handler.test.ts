import { Result } from '@standup/domain'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getDb: vi.fn().mockReturnValue({}),
  hasActiveSession: vi.fn(),
  upsert: vi.fn(),
  loggerInfo: vi.fn(),
  loggerError: vi.fn(),
  withContextInfo: vi.fn(),
  withContextError: vi.fn(),
  buildSettingsEmbed: vi.fn().mockReturnValue({ title: 'settings-embed' }),
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

vi.mock('@standup/db', () => {
  function UserRepository() {
    return {
      hasActiveSession: mocks.hasActiveSession,
    }
  }

  function UserSettingsRepository() {
    return {
      upsert: mocks.upsert,
    }
  }

  return { getDb: mocks.getDb, UserRepository, UserSettingsRepository }
})

vi.mock('../commands/settings.js', () => ({
  buildSettingsEmbed: mocks.buildSettingsEmbed,
}))

import type { ModalSubmitInteraction } from 'discord.js'
import { handleSettingsModal } from './settings-modal-handler.js'

function makeModalInteraction(
  textFields: Record<string, string>,
  selectFields: Record<string, string[]> = {},
): {
  interaction: ModalSubmitInteraction
  deferReply: ReturnType<typeof vi.fn>
  editReply: ReturnType<typeof vi.fn>
} {
  const deferReply = vi.fn().mockResolvedValue(undefined)
  const editReply = vi.fn().mockResolvedValue(undefined)

  return {
    interaction: {
      customId: 'settings-modal:edit',
      user: { id: 'discord-user-123' },
      fields: {
        getTextInputValue: vi.fn((key: string) => textFields[key] ?? ''),
        getStringSelectValues: vi.fn((key: string) => selectFields[key] ?? []),
      },
      deferReply,
      editReply,
    } as unknown as ModalSubmitInteraction,
    deferReply,
    editReply,
  }
}

const deps = {
  databaseUrl: ':memory:',
}

const savedSettings = {
  userId: 'user-123',
  standupCron: '30 17 * * 1-5',
  reminderCron: '20 17 * * 1-5',
  recoveryCron: '0 18 * * 1-5',
  timezone: 'America/Sao_Paulo',
  selectedRepos: '["repo-a","repo-b"]',
  gitAuthor: 'dev@example.com',
  active: true,
  snoozedUntil: null,
  cancelledDate: null,
}

describe('handleSettingsModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.hasActiveSession.mockReturnValue(
      Result.ok({ userId: 'user-123', hasSession: true }),
    )
    mocks.upsert.mockReturnValue(Result.ok(savedSettings))
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('persiste os tres crons e os repos selecionados', async () => {
    const { interaction, editReply } = makeModalInteraction(
      {
        'cron-config': '30 17 * * 1-5\n20 17 * * 1-5\n0 18 * * 1-5',
        timezone: 'America/Sao_Paulo',
        'git-author': 'dev@example.com',
      },
      { 'selected-repos': ['repo-a', 'repo-b'] },
    )

    await handleSettingsModal(interaction, deps)

    expect(mocks.upsert).toHaveBeenCalledWith({
      userId: 'user-123',
      standupCron: '30 17 * * 1-5',
      reminderCron: '20 17 * * 1-5',
      recoveryCron: '0 18 * * 1-5',
      timezone: 'America/Sao_Paulo',
      selectedRepos: '["repo-a","repo-b"]',
      gitAuthor: 'dev@example.com',
    })
    expect(mocks.buildSettingsEmbed).toHaveBeenCalledWith(savedSettings)
    expect(editReply).toHaveBeenCalledWith({
      content: '✅ Configurações salvas com sucesso!',
      embeds: [{ title: 'settings-embed' }],
    })
  })

  it('aceita selecao vazia de repos e persiste array vazio', async () => {
    const { interaction } = makeModalInteraction(
      {
        'cron-config': '30 17 * * 1-5\n20 17 * * 1-5\n0 18 * * 1-5',
        timezone: 'America/Sao_Paulo',
        'git-author': 'dev@example.com',
      },
      { 'selected-repos': [] },
    )

    await handleSettingsModal(interaction, deps)

    expect(mocks.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        selectedRepos: '[]',
      }),
    )
  })

  it('retorna erro quando o campo de cron não tem exatamente 3 linhas', async () => {
    const { interaction, editReply } = makeModalInteraction({
      'cron-config': '30 17 * * 1-5\n20 17 * * 1-5',
      timezone: 'America/Sao_Paulo',
      'git-author': 'dev@example.com',
    })

    await handleSettingsModal(interaction, deps)

    expect(mocks.upsert).not.toHaveBeenCalled()
    expect(editReply).toHaveBeenCalledWith({
      content:
        '❌ Informe exatamente 3 linhas de cron: standup, reminder e recovery.',
    })
  })

  it('retorna erro quando git-author esta vazio', async () => {
    const { interaction, editReply } = makeModalInteraction({
      'cron-config': '30 17 * * 1-5\n20 17 * * 1-5\n0 18 * * 1-5',
      timezone: 'America/Sao_Paulo',
      'git-author': '',
    })

    await handleSettingsModal(interaction, deps)

    expect(mocks.upsert).not.toHaveBeenCalled()
    expect(editReply).toHaveBeenCalledWith({
      content: '❌ O campo "Email do autor git" é obrigatório.',
    })
  })
})
