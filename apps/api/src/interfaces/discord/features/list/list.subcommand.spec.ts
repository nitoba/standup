// apps/api/src/interfaces/discord/features/list/list.subcommand.spec.ts
import { MessageFlags } from 'discord.js'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { StandupRecord } from '../../../../shared/domain'
import { asSlashContext } from '../../../../test/discord/make-context'
import { makeChatInputInteraction } from '../../../../test/discord/mock-interaction'
import { buildListEmbeds } from './list.embed'
import { ListSubcommand } from './list.subcommand'

function makeRecord(overrides: Partial<StandupRecord> = {}): StandupRecord {
  return {
    id: 'std-1',
    userId: 'user-1',
    date: '2026-04-30',
    content: 'Conteúdo do standup',
    status: 'approved',
    meetingType: 'daily',
    sourceData: '{}',
    customEntries: null,
    dmMessageId: null,
    sentToDiscordAt: null,
    createdAt: 1746000000000,
    updatedAt: 1746000000000,
    ...overrides,
  }
}

function okResult<T>(value: T) {
  return {
    isErr: () => false,
    isOk: () => true,
    value,
    error: undefined,
  }
}

function errResult(message: string) {
  return {
    isErr: () => true,
    isOk: () => false,
    value: undefined,
    error: { message },
  }
}

describe('ListSubcommand', () => {
  let auth: { resolveActiveSession: ReturnType<typeof vi.fn> }
  let repo: { list: ReturnType<typeof vi.fn> }
  let cmd: ListSubcommand

  beforeEach(() => {
    auth = { resolveActiveSession: vi.fn() }
    repo = { list: vi.fn() }
    cmd = new ListSubcommand(auth as never, repo as never)
  })

  it('defers reply as Ephemeral before calling the repository', async () => {
    const interaction = makeChatInputInteraction({ userId: 'user-1' })
    auth.resolveActiveSession.mockResolvedValue(null)
    repo.list.mockResolvedValue(
      okResult({ items: [], page: 1, totalPages: 0, total: 0 }),
    )

    await cmd.onList(asSlashContext(interaction), {})

    const deferCallIndex =
      interaction.deferReply.mock.invocationCallOrder[0] ?? 0
    const listCallIndex = repo.list.mock.invocationCallOrder[0] ?? 0
    expect(deferCallIndex).toBeLessThan(listCallIndex)
    expect(interaction.deferReply).toHaveBeenCalledWith({
      flags: MessageFlags.Ephemeral,
    })
  })

  describe('error path', () => {
    it('replies with error message when repository fails', async () => {
      const interaction = makeChatInputInteraction({ userId: 'user-1' })
      auth.resolveActiveSession.mockResolvedValue(null)
      repo.list.mockResolvedValue(errResult('falha na base de dados'))

      await cmd.onList(asSlashContext(interaction), {})

      expect(interaction.editReply).toHaveBeenCalledWith(
        '❌ Erro ao buscar standups: falha na base de dados',
      )
    })
  })

  describe('empty path', () => {
    it('replies with empty message when no standups found', async () => {
      const interaction = makeChatInputInteraction({ userId: 'user-1' })
      auth.resolveActiveSession.mockResolvedValue(null)
      repo.list.mockResolvedValue(
        okResult({ items: [], page: 1, totalPages: 0, total: 0 }),
      )

      await cmd.onList(asSlashContext(interaction), {})

      expect(interaction.editReply).toHaveBeenCalledWith(
        '📭 Nenhum standup encontrado.',
      )
    })
  })

  describe('happy path', () => {
    it('replies with embeds built from list result', async () => {
      const interaction = makeChatInputInteraction({ userId: 'user-1' })
      auth.resolveActiveSession.mockResolvedValue(null)
      const items = [makeRecord()]
      const payload = { items, page: 1, totalPages: 1, total: 1 }
      repo.list.mockResolvedValue(okResult(payload))

      await cmd.onList(asSlashContext(interaction), {})

      expect(interaction.editReply).toHaveBeenCalledWith({
        embeds: buildListEmbeds(payload),
      })
    })

    it('includes pagination info in footer', async () => {
      const interaction = makeChatInputInteraction({ userId: 'user-1' })
      auth.resolveActiveSession.mockResolvedValue(null)
      const items = [makeRecord()]
      const payload = { items, page: 2, totalPages: 5, total: 42 }
      repo.list.mockResolvedValue(okResult(payload))

      await cmd.onList(asSlashContext(interaction), {})

      const call = interaction.editReply.mock.calls[0]?.[0] as
        | { embeds: Array<{ footer: { text: string } }> }
        | undefined
      expect(call?.embeds[0]?.footer.text).toBe(
        'standup-bot | página 2/5 | 42 standup(s)',
      )
    })
  })

  describe('status filter', () => {
    it('passes status value to repository when provided', async () => {
      const interaction = makeChatInputInteraction({ userId: 'user-1' })
      auth.resolveActiveSession.mockResolvedValue(null)
      repo.list.mockResolvedValue(
        okResult({ items: [], page: 1, totalPages: 0, total: 0 }),
      )

      await cmd.onList(asSlashContext(interaction), {
        status: 'pending_review',
      })

      expect(repo.list).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'pending_review' }),
      )
    })

    it('passes undefined to repository when no status provided', async () => {
      const interaction = makeChatInputInteraction({ userId: 'user-1' })
      auth.resolveActiveSession.mockResolvedValue(null)
      repo.list.mockResolvedValue(
        okResult({ items: [], page: 1, totalPages: 0, total: 0 }),
      )

      await cmd.onList(asSlashContext(interaction), {})

      expect(repo.list).toHaveBeenCalledWith(
        expect.objectContaining({ status: undefined }),
      )
    })
  })

  describe('auth integration', () => {
    it('passes userId to repository when session is active', async () => {
      const interaction = makeChatInputInteraction({ userId: 'discord-1' })
      auth.resolveActiveSession.mockResolvedValue({
        userId: 'db-user-1',
        hasSession: true,
      })
      repo.list.mockResolvedValue(
        okResult({ items: [], page: 1, totalPages: 0, total: 0 }),
      )

      await cmd.onList(asSlashContext(interaction), {})

      expect(auth.resolveActiveSession).toHaveBeenCalledWith('discord-1')
      expect(repo.list).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'db-user-1' }),
      )
    })

    it('passes undefined userId when session is inactive', async () => {
      const interaction = makeChatInputInteraction({ userId: 'discord-1' })
      auth.resolveActiveSession.mockResolvedValue({
        userId: 'db-user-1',
        hasSession: false,
      })
      repo.list.mockResolvedValue(
        okResult({ items: [], page: 1, totalPages: 0, total: 0 }),
      )

      await cmd.onList(asSlashContext(interaction), {})

      expect(repo.list).toHaveBeenCalledWith(
        expect.objectContaining({ userId: undefined }),
      )
    })

    it('passes undefined userId when resolveActiveSession returns null', async () => {
      const interaction = makeChatInputInteraction({ userId: 'discord-1' })
      auth.resolveActiveSession.mockResolvedValue(null)
      repo.list.mockResolvedValue(
        okResult({ items: [], page: 1, totalPages: 0, total: 0 }),
      )

      await cmd.onList(asSlashContext(interaction), {})

      expect(repo.list).toHaveBeenCalledWith(
        expect.objectContaining({ userId: undefined }),
      )
    })
  })

  describe('options handling', () => {
    it('uses page 1 by default when not provided', async () => {
      const interaction = makeChatInputInteraction({ userId: 'user-1' })
      auth.resolveActiveSession.mockResolvedValue(null)
      repo.list.mockResolvedValue(
        okResult({ items: [], page: 1, totalPages: 0, total: 0 }),
      )

      await cmd.onList(asSlashContext(interaction), {})

      expect(repo.list).toHaveBeenCalledWith(
        expect.objectContaining({ page: 1, pageSize: 10 }),
      )
    })

    it('trims whitespace from search term', async () => {
      const interaction = makeChatInputInteraction({ userId: 'user-1' })
      auth.resolveActiveSession.mockResolvedValue(null)
      repo.list.mockResolvedValue(
        okResult({ items: [], page: 1, totalPages: 0, total: 0 }),
      )

      await cmd.onList(asSlashContext(interaction), {
        search: '  meu standup  ',
      })

      expect(repo.list).toHaveBeenCalledWith(
        expect.objectContaining({ search: 'meu standup' }),
      )
    })

    it('passes undefined search when search is empty string', async () => {
      const interaction = makeChatInputInteraction({ userId: 'user-1' })
      auth.resolveActiveSession.mockResolvedValue(null)
      repo.list.mockResolvedValue(
        okResult({ items: [], page: 1, totalPages: 0, total: 0 }),
      )

      await cmd.onList(asSlashContext(interaction), { search: '   ' })

      expect(repo.list).toHaveBeenCalledWith(
        expect.objectContaining({ search: undefined }),
      )
    })
  })
})
