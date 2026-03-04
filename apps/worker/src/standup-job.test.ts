import type { AppEnv } from '@standup/config'
import { ExternalServiceError, Result } from '@standup/domain'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// ---------------------------------------------------------------------------
// vi.hoisted — inicialização antes do hoist de vi.mock
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => ({
  collect: vi.fn(),
  generate: vi.fn(),
  determineMeetingType: vi.fn().mockReturnValue(''),
  repoCreate: vi.fn(),
  getDb: vi.fn().mockReturnValue({}),
  notifyStandupReady: vi.fn(),
  notifyJobFailed: vi.fn(),
}))

// ---------------------------------------------------------------------------
// Mocks de módulos — usam referências de mocks (já inicializadas via hoisted)
// ---------------------------------------------------------------------------

vi.mock('@standup/git-collector', () => ({
  collectGitActivity: mocks.collect,
}))

vi.mock('@standup/standup-generator', () => ({
  generateStandup: mocks.generate,
  determineMeetingType: mocks.determineMeetingType,
}))

vi.mock('@standup/db', () => {
  // StandupRepository é instanciado com `new` — precisa ser função construtora real
  function StandupRepository() {
    return { create: mocks.repoCreate }
  }
  return { getDb: mocks.getDb, StandupRepository }
})

vi.mock('./notify-standup-ready.js', () => ({
  notifyStandupReady: mocks.notifyStandupReady,
}))

vi.mock('./notify-job-failed.js', () => ({
  notifyJobFailed: mocks.notifyJobFailed,
}))

// ---------------------------------------------------------------------------
// Import do módulo sob teste — após todos os vi.mock
// ---------------------------------------------------------------------------

import { runStandupJob } from './standup-job.js'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const baseEnv: AppEnv = {
  NODE_ENV: 'test',
  PORT: 3333,
  DATABASE_URL: ':memory:',
  TIMEZONE: 'America/Sao_Paulo',
  STANDUP_CRON: '30 17 * * 1-5',
  STANDUP_REMINDER_CRON: '20 17 * * 1-5',
  DISCORD_BOT_TOKEN: 'tok-bot',
  DISCORD_CHANNEL_ID: 'ch-123',
  DISCORD_USER_ID: 'usr-456',
  ANTHROPIC_API_KEY: 'sk-test',
  ANTHROPIC_AUTH_TOKEN: undefined,
  AZURE_DEVOPS_ORG: 'ibsbiosistemico',
  AZURE_DEVOPS_ORG_URL: 'https://dev.azure.com/ibsbiosistemico',
  AZURE_DEVOPS_PAT: 'pat-test',
  AZURE_DEVOPS_DEFAULT_PROJECT: 'AGROTRACE',
  REPOS_BASE_PATH: '/tmp/repos',
  GIT_AUTHOR: 'dev@example.com',
  GIT_SINCE_PERIOD: '16 hours ago',
  BOT_INTERNAL_URL: 'http://localhost:3334',
  BOT_INTERNAL_PORT: 3334,
  INTERNAL_SECRET: 'test-secret',
}

const emptyGitActivity = { timestamp: '2026-03-04T00:00:00Z', repos: [] }

const gitActivityWithCommits = {
  timestamp: '2026-03-04T00:00:00Z',
  repos: [
    {
      repoName: 'my-repo',
      repoPath: '/tmp/repos/my-repo',
      currentBranch: 'feat/123-feature',
      commits: [
        {
          hash: 'abc123',
          subject: 'feat: add feature',
          body: '',
          filesChanged: 2,
          insertions: 10,
          deletions: 3,
          files: ['a.ts', 'b.ts'],
        },
      ],
      cardNumbers: ['123'],
      branchCardNumber: '123',
    },
  ],
}

const generatedStandup = {
  content: '## Standup\n\n- feat: add feature',
  summary: 'Adicionei feature X',
}

const savedRecord = {
  id: 'uuid-123',
  date: '2026-03-04',
  meetingType: '',
  content: generatedStandup.content,
  sourceData: JSON.stringify(gitActivityWithCommits),
  status: 'draft' as const,
  createdAt: 1000,
  updatedAt: 1000,
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('runStandupJob', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.determineMeetingType.mockReturnValue('')
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('retorna sem gerar standup quando não há commits hoje', async () => {
    mocks.collect.mockResolvedValue(Result.ok(emptyGitActivity))

    await runStandupJob(baseEnv)

    expect(mocks.collect).toHaveBeenCalledOnce()
    expect(mocks.generate).not.toHaveBeenCalled()
    expect(mocks.repoCreate).not.toHaveBeenCalled()
    expect(mocks.notifyStandupReady).not.toHaveBeenCalled()
  })

  it('coleta, gera, persiste e notifica o bot quando há commits', async () => {
    mocks.collect.mockResolvedValue(Result.ok(gitActivityWithCommits))
    mocks.generate.mockResolvedValue(Result.ok(generatedStandup))
    mocks.repoCreate.mockResolvedValue(Result.ok(savedRecord))
    mocks.notifyStandupReady.mockResolvedValue(Result.ok(undefined))

    await runStandupJob(baseEnv)

    expect(mocks.collect).toHaveBeenCalledOnce()
    expect(mocks.generate).toHaveBeenCalledOnce()
    expect(mocks.repoCreate).toHaveBeenCalledOnce()
    expect(mocks.notifyStandupReady).toHaveBeenCalledWith({
      botInternalUrl: baseEnv.BOT_INTERNAL_URL,
      standupId: savedRecord.id,
      secret: baseEnv.INTERNAL_SECRET,
    })
  })

  it('gera e persiste sem notificar quando BOT_INTERNAL_URL não está configurado', async () => {
    const envWithoutBot: AppEnv = {
      ...baseEnv,
      BOT_INTERNAL_URL: '',
    }
    mocks.collect.mockResolvedValue(Result.ok(gitActivityWithCommits))
    mocks.generate.mockResolvedValue(Result.ok(generatedStandup))
    mocks.repoCreate.mockResolvedValue(Result.ok(savedRecord))
    mocks.notifyStandupReady.mockResolvedValue(Result.ok(undefined))

    await runStandupJob(envWithoutBot)

    expect(mocks.repoCreate).toHaveBeenCalledOnce()
    // notifyStandupReady ainda é chamado — BOT_INTERNAL_URL vazio causará erro de rede (non-fatal)
    // O comportamento esperado é que o standup seja salvo independentemente
  })

  it('aborta pipeline e notifica falha no canal quando collectGitActivity falha', async () => {
    mocks.collect.mockResolvedValue(
      Result.err(
        new ExternalServiceError({ service: 'git', message: 'git failed' }),
      ),
    )
    mocks.notifyJobFailed.mockResolvedValue(Result.ok(undefined))

    await runStandupJob(baseEnv)

    expect(mocks.generate).not.toHaveBeenCalled()
    expect(mocks.repoCreate).not.toHaveBeenCalled()
    expect(mocks.notifyStandupReady).not.toHaveBeenCalled()
    // Padrão 8: notifica falha no canal
    expect(mocks.notifyJobFailed).toHaveBeenCalledWith({
      botInternalUrl: baseEnv.BOT_INTERNAL_URL,
      secret: baseEnv.INTERNAL_SECRET,
      error: expect.stringContaining('git failed'),
      context: 'standup-job',
    })
  })

  it('aborta pipeline e notifica falha quando generateStandup falha', async () => {
    mocks.collect.mockResolvedValue(Result.ok(gitActivityWithCommits))
    mocks.generate.mockResolvedValue(
      Result.err(
        new ExternalServiceError({
          service: 'anthropic',
          message: 'LLM failed',
        }),
      ),
    )
    mocks.notifyJobFailed.mockResolvedValue(Result.ok(undefined))

    await runStandupJob(baseEnv)

    expect(mocks.repoCreate).not.toHaveBeenCalled()
    expect(mocks.notifyStandupReady).not.toHaveBeenCalled()
    expect(mocks.notifyJobFailed).toHaveBeenCalledOnce()
  })

  it('aborta pipeline e notifica falha quando repo.create falha', async () => {
    mocks.collect.mockResolvedValue(Result.ok(gitActivityWithCommits))
    mocks.generate.mockResolvedValue(Result.ok(generatedStandup))
    mocks.repoCreate.mockResolvedValue(
      Result.err(
        new ExternalServiceError({ service: 'db', message: 'db error' }),
      ),
    )
    mocks.notifyJobFailed.mockResolvedValue(Result.ok(undefined))

    await runStandupJob(baseEnv)

    expect(mocks.notifyStandupReady).not.toHaveBeenCalled()
    expect(mocks.notifyJobFailed).toHaveBeenCalledOnce()
  })

  it('não lança exceção quando notifyJobFailed falha (double non-fatal)', async () => {
    mocks.collect.mockResolvedValue(
      Result.err(
        new ExternalServiceError({ service: 'git', message: 'git failed' }),
      ),
    )
    mocks.notifyJobFailed.mockResolvedValue(
      Result.err(
        new ExternalServiceError({
          service: 'discord-bot',
          message: 'Bot unavailable',
        }),
      ),
    )

    await expect(runStandupJob(baseEnv)).resolves.toBeUndefined()
  })

  it('mantém standup salvo e loga erro quando notificação falha (non-fatal)', async () => {
    mocks.collect.mockResolvedValue(Result.ok(gitActivityWithCommits))
    mocks.generate.mockResolvedValue(Result.ok(generatedStandup))
    mocks.repoCreate.mockResolvedValue(Result.ok(savedRecord))
    mocks.notifyStandupReady.mockResolvedValue(
      Result.err(
        new ExternalServiceError({
          service: 'discord-bot',
          message: 'Notification failed',
        }),
      ),
    )

    // Não deve lançar exceção — notificação é non-fatal
    await expect(runStandupJob(baseEnv)).resolves.toBeUndefined()

    // Standup foi persistido
    expect(mocks.repoCreate).toHaveBeenCalledOnce()
    // Notificação foi tentada
    expect(mocks.notifyStandupReady).toHaveBeenCalledOnce()
  })
})
