import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// ---------------------------------------------------------------------------
// vi.hoisted
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => ({
  restPut: vi.fn(),
  loggerWarn: vi.fn(),
  loggerInfo: vi.fn(),
  loggerError: vi.fn(),
}))

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@standup/logger', () => ({
  createServiceLogger: vi.fn().mockReturnValue({
    warn: mocks.loggerWarn,
    info: mocks.loggerInfo,
    error: mocks.loggerError,
  }),
}))

vi.mock('discord.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('discord.js')>()

  function REST() {
    return { setToken: () => ({ put: mocks.restPut }) }
  }

  return {
    ...actual,
    REST,
  }
})

// ---------------------------------------------------------------------------
// Import após mocks
// ---------------------------------------------------------------------------

import type { Client } from 'discord.js'
import { buildStandupCommand, registerApplicationCommands } from './register.js'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeClient(userId?: string): Client {
  return {
    user: userId ? { id: userId } : null,
  } as unknown as Client
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('buildStandupCommand', () => {
  it('constrói comando /standup com os 3 subcommands', () => {
    const cmd = buildStandupCommand()
    const json = cmd.toJSON()

    expect(json.name).toBe('standup')
    expect(json.description).toBeTruthy()

    const options = json.options ?? []
    const subNames = options.map((o) => o.name)
    expect(subNames).toContain('trigger')
    expect(subNames).toContain('list')
    expect(subNames).toContain('approve')
  })

  it('subcommand trigger tem opcoes force-regenerate e extra-context', () => {
    const cmd = buildStandupCommand()
    const json = cmd.toJSON()
    const options = json.options ?? []

    const triggerSub = options.find((o) => o.name === 'trigger')
    expect(triggerSub).toBeDefined()

    // @ts-expect-error — toJSON() retorna estrutura genérica
    const triggerOptions: unknown[] = triggerSub?.options ?? []
    const names = (triggerOptions as Array<{ name: string }>).map((o) => o.name)
    expect(names).toContain('force-regenerate')
    expect(names).toContain('extra-context')
  })

  it('subcommand list tem opção status com choices de status', () => {
    const cmd = buildStandupCommand()
    const json = cmd.toJSON()
    const options = json.options ?? []

    const listSub = options.find((o) => o.name === 'list')
    expect(listSub).toBeDefined()

    // @ts-expect-error — toJSON() retorna estrutura genérica
    const listOptions: unknown[] = listSub?.options ?? []
    const statusOption = (
      listOptions as Array<{ name: string; choices?: unknown[] }>
    ).find((o) => o.name === 'status')
    expect(statusOption).toBeDefined()
    expect(statusOption?.choices?.length).toBeGreaterThan(0)
  })

  it('subcommand approve tem opção id obrigatória', () => {
    const cmd = buildStandupCommand()
    const json = cmd.toJSON()
    const options = json.options ?? []

    const approveSub = options.find((o) => o.name === 'approve')
    // @ts-expect-error — toJSON() retorna estrutura genérica
    const approveOptions: unknown[] = approveSub?.options ?? []
    const idOption = (
      approveOptions as Array<{ name: string; required?: boolean }>
    ).find((o) => o.name === 'id')
    expect(idOption).toBeDefined()
    expect(idOption?.required).toBe(true)
  })
})

describe('registerApplicationCommands', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('avisa e retorna sem registrar quando client.user.id não está disponível', async () => {
    const client = makeClient(undefined)

    await registerApplicationCommands(client, 'token-abc')

    expect(mocks.loggerWarn).toHaveBeenCalledWith(
      expect.stringContaining('client.user.id'),
    )
    expect(mocks.restPut).not.toHaveBeenCalled()
  })

  it('registra guild commands quando guildId é fornecido', async () => {
    const client = makeClient('client-id-123')
    mocks.restPut.mockResolvedValue([])

    await registerApplicationCommands(client, 'token-abc', 'guild-id-456')

    expect(mocks.restPut).toHaveBeenCalledTimes(1)
    const [route] = mocks.restPut.mock.calls[0] as [string, unknown]
    expect(route).toContain('client-id-123')
    expect(route).toContain('guild-id-456')
    expect(mocks.loggerInfo).toHaveBeenCalledWith(
      expect.stringContaining('guild'),
      expect.objectContaining({ guildId: 'guild-id-456' }),
    )
  })

  it('registra global commands quando guildId não é fornecido', async () => {
    const client = makeClient('client-id-123')
    mocks.restPut.mockResolvedValue([])

    await registerApplicationCommands(client, 'token-abc')

    expect(mocks.restPut).toHaveBeenCalledTimes(1)
    const [route] = mocks.restPut.mock.calls[0] as [string, unknown]
    expect(route).toContain('client-id-123')
    // Rota global não contém guilds/
    expect(route).not.toContain('guilds')
    expect(mocks.loggerInfo).toHaveBeenCalledWith(
      expect.stringContaining('global'),
      expect.any(Object),
    )
  })

  it('loga erro e não propaga exceção (non-fatal) quando REST falha', async () => {
    const client = makeClient('client-id-123')
    mocks.restPut.mockRejectedValue(new Error('Discord API error'))

    // Não deve lançar
    await expect(
      registerApplicationCommands(client, 'token-abc'),
    ).resolves.toBeUndefined()

    expect(mocks.loggerError).toHaveBeenCalledWith(
      expect.stringContaining('Failed to register'),
      expect.objectContaining({ error: 'Discord API error' }),
    )
  })
})
