import type { AppEnv } from '@standup/config'
import {
  ExternalServiceError,
  JobAlreadyCompletedError,
  LlmTemporaryError,
  LockAlreadyHeldError,
  Result,
} from '@standup/domain'
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
  acquireLock: vi.fn(),
  releaseLock: vi.fn(), // valor configurado no beforeEach (Result nao disponivel aqui)
  notifyStandupReady: vi.fn(),
  notifyJobFailed: vi.fn(),
  sleep: vi.fn().mockResolvedValue(undefined),
}))

// ---------------------------------------------------------------------------
// Mocks de módulos
// ---------------------------------------------------------------------------

vi.mock('@standup/git-collector', () => ({
  collectGitActivity: mocks.collect,
}))

vi.mock('@standup/standup-generator', () => ({
  generateStandup: mocks.generate,
  determineMeetingType: mocks.determineMeetingType,
}))

vi.mock('@standup/db', () => {
  // StandupRepository e JobRunRepository são instanciados com `new`
  function StandupRepository() {
    return { create: mocks.repoCreate }
  }
  function JobRunRepository() {
    return { acquireLock: mocks.acquireLock, releaseLock: mocks.releaseLock }
  }
  return { getDb: mocks.getDb, StandupRepository, JobRunRepository }
})

vi.mock('../notifications/notify-standup-ready.js', () => ({
  notifyStandupReady: mocks.notifyStandupReady,
}))

vi.mock('../notifications/notify-job-failed.js', () => ({
  notifyJobFailed: mocks.notifyJobFailed,
}))

// Mock Bun.sleep para evitar delays reais nos testes de retry
vi.stubGlobal('Bun', {
  randomUUIDv7: () => 'uuid-test',
  sleep: mocks.sleep,
})

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
  STANDUP_RECOVERY_CRON: '0 18 * * 1-5',
  DISCORD_BOT_TOKEN: 'tok-bot',
  DISCORD_CHANNEL_ID: 'ch-123',
  DISCORD_USER_ID: 'usr-456',
  ANTHROPIC_AUTH_TOKEN: 'sk-test',
  AZURE_DEVOPS_ORG: 'ibsbiosistemico',
  AZURE_DEVOPS_PAT: 'pat-test',
  AZURE_DEVOPS_DEFAULT_PROJECT: 'AGROTRACE',
  REPOS_BASE_PATH: '/tmp/repos',
  GIT_AUTHOR: 'dev@example.com',
  GIT_SINCE_PERIOD: '16 hours ago',
  BOT_INTERNAL_URL: 'http://localhost:3334',
  BOT_INTERNAL_PORT: 3334,
  WORKER_INTERNAL_URL: 'http://localhost:3335',
  WORKER_INTERNAL_PORT: 3335,
  API_BASE_URL: 'http://localhost:3333',
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

const lockRecord = {
  id: 'uuid-test',
  jobName: 'standup',
  date: '2026-03-04',
  status: 'running',
  startedAt: Date.now(),
  finishedAt: null,
  error: null,
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('runStandupJob', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.determineMeetingType.mockReturnValue('')
    mocks.acquireLock.mockResolvedValue(Result.ok(lockRecord))
    mocks.releaseLock.mockResolvedValue(Result.ok(undefined)) // configurado aqui onde Result ja esta disponivel
    mocks.sleep.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // -------------------------------------------------------------------------
  // Padrão 2+3: Lock e Idempotência
  // -------------------------------------------------------------------------

  describe('Padrão 2+3: Lock e Idempotência', () => {
    it('aborta silenciosamente quando o lock já está held (outra instância rodando)', async () => {
      mocks.acquireLock.mockResolvedValue(
        Result.err(
          new LockAlreadyHeldError({ jobName: 'standup', date: '2026-03-04' }),
        ),
      )

      await runStandupJob(baseEnv)

      expect(mocks.collect).not.toHaveBeenCalled()
      expect(mocks.generate).not.toHaveBeenCalled()
      expect(mocks.releaseLock).not.toHaveBeenCalled()
    })

    it('aborta silenciosamente quando job já completou hoje (idempotente)', async () => {
      mocks.acquireLock.mockResolvedValue(
        Result.err(
          new JobAlreadyCompletedError({
            jobName: 'standup',
            date: '2026-03-04',
          }),
        ),
      )

      await runStandupJob(baseEnv)

      expect(mocks.collect).not.toHaveBeenCalled()
      expect(mocks.generate).not.toHaveBeenCalled()
      expect(mocks.releaseLock).not.toHaveBeenCalled()
    })

    it('libera o lock com success ao finalizar com sucesso', async () => {
      mocks.collect.mockResolvedValue(Result.ok(gitActivityWithCommits))
      mocks.generate.mockResolvedValue(Result.ok(generatedStandup))
      mocks.repoCreate.mockResolvedValue(Result.ok(savedRecord))
      mocks.notifyStandupReady.mockResolvedValue(Result.ok(undefined))

      await runStandupJob(baseEnv)

      expect(mocks.releaseLock).toHaveBeenCalledWith('uuid-test', 'success')
    })

    it('libera o lock com failed quando o pipeline falha', async () => {
      mocks.collect.mockResolvedValue(
        Result.err(
          new ExternalServiceError({ service: 'git', message: 'git failed' }),
        ),
      )
      mocks.notifyJobFailed.mockResolvedValue(Result.ok(undefined))

      await runStandupJob(baseEnv)

      expect(mocks.releaseLock).toHaveBeenCalledWith(
        'uuid-test',
        'failed',
        expect.stringContaining('git failed'),
      )
    })

    it('libera lock com success quando não há commits (no-op legítimo)', async () => {
      mocks.collect.mockResolvedValue(Result.ok(emptyGitActivity))

      await runStandupJob(baseEnv)

      expect(mocks.releaseLock).toHaveBeenCalledWith('uuid-test', 'success')
    })
  })

  // -------------------------------------------------------------------------
  // Padrão 1: Retry com backoff para erros transitorios
  // -------------------------------------------------------------------------

  describe('Padrão 1: Retry com backoff', () => {
    it('retenta generateStandup até 3x em LlmTemporaryError e falha no final', async () => {
      mocks.collect.mockResolvedValue(Result.ok(gitActivityWithCommits))
      mocks.generate.mockResolvedValue(
        Result.err(
          new LlmTemporaryError({ message: 'Rate limited', attempt: 1 }),
        ),
      )
      mocks.notifyJobFailed.mockResolvedValue(Result.ok(undefined))

      await runStandupJob(baseEnv)

      // 3 tentativas
      expect(mocks.generate).toHaveBeenCalledTimes(3)
      // Backoff: 2 sleeps entre as 3 tentativas
      expect(mocks.sleep).toHaveBeenCalledTimes(2)
      // Falha notificada
      expect(mocks.notifyJobFailed).toHaveBeenCalledOnce()
      expect(mocks.releaseLock).toHaveBeenCalledWith(
        'uuid-test',
        'failed',
        expect.any(String),
      )
    })

    it('retenta e tem sucesso na segunda tentativa', async () => {
      mocks.collect.mockResolvedValue(Result.ok(gitActivityWithCommits))
      mocks.generate
        .mockResolvedValueOnce(
          Result.err(
            new LlmTemporaryError({ message: 'Rate limited', attempt: 1 }),
          ),
        )
        .mockResolvedValueOnce(Result.ok(generatedStandup))
      mocks.repoCreate.mockResolvedValue(Result.ok(savedRecord))
      mocks.notifyStandupReady.mockResolvedValue(Result.ok(undefined))

      await runStandupJob(baseEnv)

      expect(mocks.generate).toHaveBeenCalledTimes(2)
      expect(mocks.sleep).toHaveBeenCalledTimes(1)
      expect(mocks.repoCreate).toHaveBeenCalledOnce()
      expect(mocks.releaseLock).toHaveBeenCalledWith('uuid-test', 'success')
    })

    it('não retenta erros não-transitorios (ExternalServiceError de git)', async () => {
      mocks.collect.mockResolvedValue(
        Result.err(
          new ExternalServiceError({ service: 'git', message: 'git failed' }),
        ),
      )
      mocks.notifyJobFailed.mockResolvedValue(Result.ok(undefined))

      await runStandupJob(baseEnv)

      expect(mocks.collect).toHaveBeenCalledTimes(1)
      expect(mocks.sleep).not.toHaveBeenCalled()
    })
  })

  // -------------------------------------------------------------------------
  // Pipeline happy path
  // -------------------------------------------------------------------------

  describe('Pipeline happy path', () => {
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
  })

  // -------------------------------------------------------------------------
  // Falhas do pipeline
  // -------------------------------------------------------------------------

  describe('Falhas do pipeline', () => {
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
      expect(mocks.notifyJobFailed).toHaveBeenCalledWith({
        botInternalUrl: baseEnv.BOT_INTERNAL_URL,
        secret: baseEnv.INTERNAL_SECRET,
        error: expect.stringContaining('git failed'),
        context: 'standup-job',
      })
    })

    it('aborta pipeline e notifica falha quando generateStandup falha (non-retryable)', async () => {
      mocks.collect.mockResolvedValue(Result.ok(gitActivityWithCommits))
      mocks.generate.mockResolvedValue(
        Result.err(
          new ExternalServiceError({
            service: 'anthropic',
            message: 'LLM permanent error',
          }),
        ),
      )
      mocks.notifyJobFailed.mockResolvedValue(Result.ok(undefined))

      await runStandupJob(baseEnv)

      expect(mocks.generate).toHaveBeenCalledTimes(1) // sem retry para non-retryable
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

    it('passa extraContext ao generateStandup quando fornecido nas opcoes', async () => {
      mocks.collect.mockResolvedValue(Result.ok(gitActivityWithCommits))
      mocks.generate.mockResolvedValue(Result.ok(generatedStandup))
      mocks.repoCreate.mockResolvedValue(Result.ok(savedRecord))
      mocks.notifyStandupReady.mockResolvedValue(Result.ok(undefined))

      await runStandupJob(baseEnv, {
        extraContext: 'Focar no card #1234',
      })

      // Verifica que generateStandup recebeu extraContext no input
      const generateCall = mocks.generate.mock.calls[0]
      const input = generateCall?.[0] as { extraContext?: string }
      expect(input.extraContext).toBe('Focar no card #1234')
    })

    it('passa forceRegenerate ao acquireLock quando fornecido nas opcoes', async () => {
      mocks.collect.mockResolvedValue(Result.ok(gitActivityWithCommits))
      mocks.generate.mockResolvedValue(Result.ok(generatedStandup))
      mocks.repoCreate.mockResolvedValue(Result.ok(savedRecord))
      mocks.notifyStandupReady.mockResolvedValue(Result.ok(undefined))

      await runStandupJob(baseEnv, { forceRegenerate: true })

      expect(mocks.acquireLock).toHaveBeenCalledWith(
        expect.objectContaining({ forceRegenerate: true }),
      )
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

      // Standup foi persistido e lock liberado com sucesso
      expect(mocks.repoCreate).toHaveBeenCalledOnce()
      expect(mocks.notifyStandupReady).toHaveBeenCalledOnce()
      expect(mocks.releaseLock).toHaveBeenCalledWith('uuid-test', 'success')
    })
  })
})
