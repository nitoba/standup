import { Result } from '@standup/domain'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getDb: vi.fn().mockReturnValue({}),
  findByDiscordId: vi.fn(),
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
      findByDiscordId: mocks.findByDiscordId,
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

function makeModalInteraction(fields: Record<string, string>): {
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
        getTextInputValue: vi.fn((key: string) => fields[key] ?? ''),
      },
      deferReply,
      editReply,
    } as unknown as ModalSubmitInteraction,
    deferReply,
    editReply,
  }
}

const env = {
  DATABASE_URL: ':memory:',
  REPOS_ROOT_PATH: '/repos',
}

const savedSettings = {
  userId: 'user-123',
  standupCron: '30 17 * * 1-5',
  reminderCron: '20 17 * * 1-5',
  recoveryCron: '0 18 * * 1-5',
  timezone: 'America/Sao_Paulo',
  reposBasePath: 'team-a',
  gitAuthor: 'dev@example.com',
  gitSincePeriod: '16 hours ago',
  active: true,
  snoozedUntil: null,
  cancelledDate: null,
}

describe('handleSettingsModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.findByDiscordId.mockReturnValue(Result.ok({ id: 'user-123' }))
    mocks.upsert.mockReturnValue(Result.ok(savedSettings))
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('persiste os tres crons e normaliza o repos subpath', async () => {
    const { interaction, editReply } = makeModalInteraction({
      'cron-config': '30 17 * * 1-5\n20 17 * * 1-5\n0 18 * * 1-5',
      timezone: 'America/Sao_Paulo',
      'repos-path': '/team-a',
      'git-author': 'dev@example.com',
      'git-since-period': '16 hours ago',
    })

    await handleSettingsModal(interaction, env)

    expect(mocks.upsert).toHaveBeenCalledWith({
      userId: 'user-123',
      standupCron: '30 17 * * 1-5',
      reminderCron: '20 17 * * 1-5',
      recoveryCron: '0 18 * * 1-5',
      timezone: 'America/Sao_Paulo',
      reposBasePath: 'team-a',
      gitAuthor: 'dev@example.com',
      gitSincePeriod: '16 hours ago',
    })
    expect(mocks.buildSettingsEmbed).toHaveBeenCalledWith(
      savedSettings,
      '/repos',
    )
    expect(editReply).toHaveBeenCalledWith({
      content: '✅ Configurações salvas com sucesso!',
      embeds: [{ title: 'settings-embed' }],
    })
  })

  it('aceita repos subpath vazio e usa o root inteiro', async () => {
    const { interaction } = makeModalInteraction({
      'cron-config': '30 17 * * 1-5\n20 17 * * 1-5\n0 18 * * 1-5',
      timezone: 'America/Sao_Paulo',
      'repos-path': '',
      'git-author': 'dev@example.com',
      'git-since-period': '16 hours ago',
    })

    await handleSettingsModal(interaction, env)

    expect(mocks.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        reposBasePath: '',
      }),
    )
  })

  it('retorna erro quando o campo de cron nao tem exatamente 3 linhas', async () => {
    const { interaction, editReply } = makeModalInteraction({
      'cron-config': '30 17 * * 1-5\n20 17 * * 1-5',
      timezone: 'America/Sao_Paulo',
      'repos-path': 'team-a',
      'git-author': 'dev@example.com',
      'git-since-period': '16 hours ago',
    })

    await handleSettingsModal(interaction, env)

    expect(mocks.upsert).not.toHaveBeenCalled()
    expect(editReply).toHaveBeenCalledWith({
      content:
        '❌ Informe exatamente 3 linhas de cron: standup, reminder e recovery.',
    })
  })

  it('retorna erro quando o repos subpath tenta escapar do root', async () => {
    const { interaction, editReply } = makeModalInteraction({
      'cron-config': '30 17 * * 1-5\n20 17 * * 1-5\n0 18 * * 1-5',
      timezone: 'America/Sao_Paulo',
      'repos-path': 'team-a/../secret',
      'git-author': 'dev@example.com',
      'git-since-period': '16 hours ago',
    })

    await handleSettingsModal(interaction, env)

    expect(mocks.upsert).not.toHaveBeenCalled()
    expect(editReply).toHaveBeenCalledWith({
      content: '❌ reposBasePath must not contain parent directory segments',
    })
  })
})
