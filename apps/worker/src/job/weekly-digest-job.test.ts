import { Result } from '@standup/domain'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { WeeklyDigestJobOptions } from './weekly-digest-job.js'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => ({
  // DB
  getDb: vi.fn(),
  findByUserAndWeek: vi.fn(),
  create: vi.fn(),
  claimForSending: vi.fn(),
  saveContent: vi.fn(),
  markSent: vi.fn(),
  markFailed: vi.fn(),
  markSkipped: vi.fn(),
  markUnknown: vi.fn(),
  findApprovedByUserAndDateRange: vi.fn(),
  findById: vi.fn(),
  findByUserId: vi.fn(),
  // Email
  sendEmail: vi.fn(),
  renderWeeklyDigest: vi.fn(() => '<html>digest</html>'),
  renderWeeklyDigestText: vi.fn(() => 'plain text digest'),
  markdownToEmailHtml: vi.fn(async (md: string) => `<p>${md}</p>`),
  getTheme: vi.fn(() => ({
    bg: '#fff',
    cardBg: '#fff',
    headerBg: '#000',
    insightBg: '#eee',
    footerBg: '#f5f5f5',
    headerText: '#fff',
    text: '#000',
    textSecondary: '#666',
    textMuted: '#999',
    accent: '#0f0',
    insightBorder: '#00f',
    divider: '#ddd',
    cardHeaderBg: '#f0f0f0',
    cardHeaderText: '#333',
    tagBg: '#e0e',
    tagText: '#00f',
  })),
  // Generator
  generateWeeklyInsights: vi.fn(),
}))

vi.mock('@standup/db', () => {
  function WeeklyDigestRepository() {
    return {
      findByUserAndWeek: mocks.findByUserAndWeek,
      create: mocks.create,
      claimForSending: mocks.claimForSending,
      saveContent: mocks.saveContent,
      markSent: mocks.markSent,
      markFailed: mocks.markFailed,
      markSkipped: mocks.markSkipped,
      markUnknown: mocks.markUnknown,
    }
  }
  function StandupRepository() {
    return {
      findApprovedByUserAndDateRange: mocks.findApprovedByUserAndDateRange,
    }
  }
  function UserRepository() {
    return {
      findById: mocks.findById,
    }
  }
  function UserSettingsRepository() {
    return {
      findByUserId: mocks.findByUserId,
    }
  }
  return {
    getDb: mocks.getDb,
    WeeklyDigestRepository,
    StandupRepository,
    UserRepository,
    UserSettingsRepository,
  }
})

vi.mock('@standup/email', () => ({
  sendEmail: mocks.sendEmail,
  renderWeeklyDigest: mocks.renderWeeklyDigest,
  renderWeeklyDigestText: mocks.renderWeeklyDigestText,
  markdownToEmailHtml: mocks.markdownToEmailHtml,
  getTheme: mocks.getTheme,
}))

vi.mock('@standup/standup-generator', () => ({
  generateWeeklyInsights: mocks.generateWeeklyInsights,
}))

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

const { runWeeklyDigestJob } = await import('./weekly-digest-job.js')

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const baseEnv = {
  DATABASE_URL: ':memory:',
  NODE_ENV: 'test' as const,
  PORT: 3335,
  INTERNAL_SECRET: 'secret',
  REPOS_ROOT_PATH: '/repos',
  AI_PROVIDER_API_KEY: 'key',
  AZURE_DEVOPS_ORG: 'myorg',
  AZURE_DEVOPS_PAT: 'pat',
  AZURE_DEVOPS_DEFAULT_PROJECT: 'AGROTRACE',
  BOT_INTERNAL_URL: 'http://bot:3334',
  API_INTERNAL_URL: 'http://api:3333',
  WORKER_INTERNAL_PORT: 3335,
  APP_URL: 'http://localhost:4200',
  SMTP_HOST: 'smtp.example.com',
  SMTP_PORT: 587,
  SMTP_USER: 'user@example.com',
  SMTP_PASS: 'pass',
  SMTP_FROM: 'bot@example.com',
  SMTP_SECURE: false,
}

const options: WeeklyDigestJobOptions = {
  userId: 'user-123',
}

const sampleStandups = [
  {
    id: 'standup-1',
    date: '2026-03-10',
    meetingType: 'daily',
    content: '## Done\n- Implemented feature',
    sourceData: '{}',
    customEntries: null,
    status: 'approved' as const,
    userId: 'user-123',
    dmMessageId: null,
    createdAt: 1000,
    updatedAt: 1000,
  },
]

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('runWeeklyDigestJob', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getDb.mockReturnValue({})
    mocks.findByUserAndWeek.mockReturnValue(Result.ok(null))
    mocks.create.mockReturnValue(
      Result.ok({ id: 'digest-1', status: 'pending' }),
    )
    mocks.claimForSending.mockReturnValue(
      Result.ok({ id: 'digest-1', status: 'sending' }),
    )
    mocks.markSent.mockReturnValue(
      Result.ok({ id: 'digest-1', status: 'sent' }),
    )
    mocks.markFailed.mockReturnValue(
      Result.ok({ id: 'digest-1', status: 'failed' }),
    )
    mocks.markSkipped.mockReturnValue(
      Result.ok({ id: 'digest-1', status: 'skipped' }),
    )
    mocks.markUnknown.mockReturnValue(
      Result.ok({ id: 'digest-1', status: 'unknown' }),
    )
    mocks.findApprovedByUserAndDateRange.mockResolvedValue(
      Result.ok(sampleStandups),
    )
    mocks.findById.mockReturnValue(
      Result.ok({ id: 'user-123', name: 'João', email: 'joao@example.com' }),
    )
    mocks.findByUserId.mockReturnValue(Result.ok({ emailTheme: 'light' }))
    mocks.generateWeeklyInsights.mockResolvedValue(
      Result.ok('## Insights\n- Productive week'),
    )
    mocks.saveContent.mockReturnValue(
      Result.ok({ id: 'digest-1', status: 'sending' }),
    )
    mocks.sendEmail.mockResolvedValue(Result.ok({ messageId: 'msg-123' }))
  })

  it('skips gracefully when SMTP is not configured', async () => {
    const envWithoutSmtp = { ...baseEnv, SMTP_HOST: undefined }
    await runWeeklyDigestJob(envWithoutSmtp as never, options)
    expect(mocks.create).not.toHaveBeenCalled()
    expect(mocks.sendEmail).not.toHaveBeenCalled()
  })

  it('skips (idempotent) when digest already sent for the week', async () => {
    mocks.findByUserAndWeek.mockReturnValue(
      Result.ok({ id: 'digest-old', status: 'sent' }),
    )
    await runWeeklyDigestJob(baseEnv, options)
    expect(mocks.create).not.toHaveBeenCalled()
    expect(mocks.sendEmail).not.toHaveBeenCalled()
  })

  it('skips (idempotent) when digest is in unknown terminal state', async () => {
    mocks.findByUserAndWeek.mockReturnValue(
      Result.ok({ id: 'digest-old', status: 'unknown' }),
    )
    await runWeeklyDigestJob(baseEnv, options)
    expect(mocks.create).not.toHaveBeenCalled()
    expect(mocks.sendEmail).not.toHaveBeenCalled()
  })

  it('skips (idempotent) when digest is in skipped terminal state', async () => {
    mocks.findByUserAndWeek.mockReturnValue(
      Result.ok({ id: 'digest-old', status: 'skipped' }),
    )
    await runWeeklyDigestJob(baseEnv, options)
    expect(mocks.create).not.toHaveBeenCalled()
    expect(mocks.sendEmail).not.toHaveBeenCalled()
  })

  it('exits without sending when claimForSending returns null (race condition)', async () => {
    // Simulate a record already in 'sending' state from another process
    mocks.findByUserAndWeek.mockReturnValue(
      Result.ok({ id: 'digest-1', status: 'pending' }),
    )
    mocks.claimForSending.mockReturnValue(Result.ok(null))
    await runWeeklyDigestJob(baseEnv, options)
    expect(mocks.sendEmail).not.toHaveBeenCalled()
    expect(mocks.markFailed).not.toHaveBeenCalled()
  })

  it('marks digest as skipped when no approved standups found', async () => {
    mocks.findApprovedByUserAndDateRange.mockResolvedValue(Result.ok([]))
    await runWeeklyDigestJob(baseEnv, options)
    expect(mocks.markSkipped).toHaveBeenCalled()
    expect(mocks.sendEmail).not.toHaveBeenCalled()
  })

  it('marks digest as skipped when user has no email', async () => {
    mocks.findById.mockReturnValue(
      Result.ok({ id: 'user-123', name: 'João', email: '' }),
    )
    await runWeeklyDigestJob(baseEnv, options)
    expect(mocks.markSkipped).toHaveBeenCalled()
    expect(mocks.sendEmail).not.toHaveBeenCalled()
  })

  it('marks digest as failed when insights generation fails', async () => {
    mocks.generateWeeklyInsights.mockResolvedValue(
      Result.err({
        _tag: 'ExternalServiceError',
        service: 'ai',
        message: 'LLM down',
      }),
    )
    await runWeeklyDigestJob(baseEnv, options)
    expect(mocks.markFailed).toHaveBeenCalledWith(
      expect.any(String),
      expect.stringContaining('LLM down'),
    )
    expect(mocks.sendEmail).not.toHaveBeenCalled()
  })

  it('marks digest as failed when SMTP rejects the message (smtp_accepted=false)', async () => {
    mocks.sendEmail.mockResolvedValue(
      Result.err({
        _tag: 'ExternalServiceError',
        service: 'smtp',
        message: 'Connection refused',
      }),
    )
    await runWeeklyDigestJob(baseEnv, options)
    expect(mocks.markFailed).toHaveBeenCalledWith(
      expect.any(String),
      expect.stringContaining('Connection refused'),
    )
    expect(mocks.markUnknown).not.toHaveBeenCalled()
  })

  it('marks digest as unknown when SMTP accepted but markSent DB write fails', async () => {
    mocks.sendEmail.mockResolvedValue(Result.ok({ messageId: 'msg-999' }))
    mocks.markSent.mockReturnValue(
      Result.err({
        _tag: 'DbError',
        operation: 'markSent',
        message: 'DB locked',
      }),
    )
    await runWeeklyDigestJob(baseEnv, options)
    expect(mocks.markUnknown).toHaveBeenCalledWith(
      expect.any(String),
      expect.stringContaining('DB locked'),
    )
    expect(mocks.markFailed).not.toHaveBeenCalled()
  })

  it('marks digest as sent on success', async () => {
    await runWeeklyDigestJob(baseEnv, options)
    expect(mocks.sendEmail).toHaveBeenCalledOnce()
    expect(mocks.markSent).toHaveBeenCalled()
    expect(mocks.markFailed).not.toHaveBeenCalled()
    expect(mocks.markUnknown).not.toHaveBeenCalled()
  })

  it('sends email with subject containing the week dates', async () => {
    await runWeeklyDigestJob(baseEnv, options)
    const callArgs = mocks.sendEmail.mock.calls[0]
    expect(callArgs).toBeDefined()
    const emailInput = callArgs?.[1]
    expect(emailInput?.subject).toMatch(/Resumo da semana/)
    expect(emailInput?.to).toBe('joao@example.com')
  })

  it('passes unsubscribeUrl built from APP_URL to sendEmail', async () => {
    await runWeeklyDigestJob(baseEnv, options)
    const callArgs = mocks.sendEmail.mock.calls[0]
    expect(callArgs).toBeDefined()
    const emailInput = callArgs?.[1]
    expect(emailInput?.unsubscribeUrl).toBe(
      'http://localhost:4200/settings?unsubscribe=digest',
    )
  })

  it('does not create a new record when one already exists in pending state', async () => {
    mocks.findByUserAndWeek.mockReturnValue(
      Result.ok({ id: 'digest-existing', status: 'pending' }),
    )
    await runWeeklyDigestJob(baseEnv, options)
    expect(mocks.create).not.toHaveBeenCalled()
    // But claimForSending and sendEmail should still proceed
    expect(mocks.claimForSending).toHaveBeenCalled()
    expect(mocks.sendEmail).toHaveBeenCalledOnce()
  })

  it('saves standup IDs and insights to the digest record before sending', async () => {
    await runWeeklyDigestJob(baseEnv, options)
    expect(mocks.saveContent).toHaveBeenCalledWith(
      'digest-1',
      ['standup-1'],
      '## Insights\n- Productive week',
    )
    // Email must still be sent after saveContent succeeds
    expect(mocks.sendEmail).toHaveBeenCalledOnce()
  })

  it('marks digest as failed when saveContent fails (email not sent yet — retry is safe)', async () => {
    mocks.saveContent.mockReturnValue(
      Result.err({
        _tag: 'DbError',
        operation: 'saveContent',
        message: 'disk full',
      }),
    )
    await runWeeklyDigestJob(baseEnv, options)
    expect(mocks.markFailed).toHaveBeenCalledWith(
      expect.any(String),
      expect.stringContaining('disk full'),
    )
    expect(mocks.sendEmail).not.toHaveBeenCalled()
    expect(mocks.markUnknown).not.toHaveBeenCalled()
  })
})
