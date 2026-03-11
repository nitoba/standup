// ---------------------------------------------------------------------------
// Weekly Digest Job
//
// Runs every Monday at 09:00 (user's timezone).
// Compiles the previous week's approved standups, generates AI insights,
// renders an HTML email, and sends it via SMTP.
//
// Reliability patterns (Akita):
//   Padrão 1 — One record per recipient:
//     Record created with status='pending' before any work begins.
//     Unique constraint on (user_id, week_start) prevents duplicates.
//
//   Padrão 2 — Atomic claiming:
//     claimForSending() issues UPDATE WHERE status IN ('pending','failed').
//     If another process already claimed it, UPDATE matches 0 rows → null
//     returned → job exits without sending.
//
//   Padrão 3 — smtp_accepted flag:
//     smtpAccepted is set to true immediately after sendEmail() returns Ok.
//     Any error AFTER that point → markUnknown() (not markFailed()).
//     The digest may have been delivered; do NOT auto-retry.
//
//   Padrão 4 — Immutable terminal states:
//     'sent', 'unknown', 'skipped' are terminal.
//     Idempotency check skips ALL of them (not just 'sent').
//     claimForSending() only transitions 'pending' | 'failed' → 'sending'.
//
//   Padrão 10 — List-Unsubscribe:
//     Per-user unsubscribe URL built from APP_URL env var.
//     Passed as header by sendEmail() (already implemented in email-client).
//
// Graceful degradation:
//   - SMTP not configured → job skips with a log warning (non-fatal)
//   - No approved standups → digest saved as 'skipped'
//   - User has no email → digest saved as 'skipped'
//   - Insights LLM failure → digest saved as 'failed'
//   - SMTP rejected (error before smtp_accepted) → digest saved as 'failed'
//   - SMTP accepted but subsequent error → digest saved as 'unknown'
// ---------------------------------------------------------------------------

import type { WorkerEnv } from '@standup/config'
import {
  getDb,
  StandupRepository,
  UserRepository,
  UserSettingsRepository,
  WeeklyDigestRepository,
} from '@standup/db'
import type { SmtpConfig } from '@standup/email'
import {
  getTheme,
  markdownToEmailHtml,
  renderWeeklyDigest,
  renderWeeklyDigestText,
  sendEmail,
} from '@standup/email'
import { createServiceLogger, withContext } from '@standup/logger'
import { withSpan } from '@standup/observability'
import { generateWeeklyInsights } from '@standup/standup-generator'

const logger = createServiceLogger({
  service: 'worker',
  component: 'weekly-digest-job',
})

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

/** Formats a YYYY-MM-DD date as "DD/MM" */
function formatShortDate(date: string): string {
  const [, mm, dd] = date.split('-')
  return `${dd}/${mm}`
}

/** Formats weekStart + weekEnd as "10/03 a 14/03/2026" */
function formatWeekLabel(weekStart: string, weekEnd: string): string {
  const endYear = weekEnd.split('-')[0] ?? ''
  return `${formatShortDate(weekStart)} a ${formatShortDate(weekEnd)}/${endYear}`
}

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

/**
 * Returns the ISO date (YYYY-MM-DD) of the Monday of the previous week,
 * relative to `now`.
 */
function getPreviousWeekStart(now: Date): string {
  const day = now.getDay() // 0=Sun, 1=Mon, ..., 6=Sat
  // How many days to subtract to reach last Monday
  const daysToLastMonday = day === 0 ? 13 : day + 6
  const monday = new Date(now)
  monday.setDate(now.getDate() - daysToLastMonday)
  return monday.toISOString().slice(0, 10)
}

/**
 * Returns the ISO date (YYYY-MM-DD) of the Friday of the previous week,
 * relative to `now`.
 */
function getPreviousWeekEnd(weekStart: string): string {
  const monday = new Date(`${weekStart}T00:00:00Z`)
  const friday = new Date(monday)
  friday.setDate(monday.getDate() + 4)
  return friday.toISOString().slice(0, 10)
}

// ---------------------------------------------------------------------------
// SMTP config builder
// ---------------------------------------------------------------------------

function buildSmtpConfig(env: WorkerEnv): SmtpConfig | null {
  if (!env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASS || !env.SMTP_FROM) {
    return null
  }
  return {
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    user: env.SMTP_USER,
    pass: env.SMTP_PASS,
    fromAddress: env.SMTP_FROM,
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface WeeklyDigestJobOptions {
  userId: string
}

export async function runWeeklyDigestJob(
  env: WorkerEnv,
  options: WeeklyDigestJobOptions,
): Promise<void> {
  const runId = crypto.randomUUID()
  const now = new Date()
  const weekStart = getPreviousWeekStart(now)
  const weekEnd = getPreviousWeekEnd(weekStart)

  const jobLogger = withContext(logger, {
    job: 'weekly-digest',
    run: runId,
    userId: options.userId,
    weekStart,
    weekEnd,
  })

  jobLogger.info('Weekly digest job started')

  // ---------------------------------------------------------------------------
  // Guard: SMTP must be configured
  // ---------------------------------------------------------------------------

  const smtpConfig = buildSmtpConfig(env)
  if (!smtpConfig) {
    jobLogger.warn(
      'SMTP not configured (SMTP_HOST/USER/PASS/FROM missing) — skipping weekly digest',
    )
    return
  }

  const db = getDb(env.DATABASE_URL)
  const digestRepo = new WeeklyDigestRepository(db)
  const standupRepo = new StandupRepository(db)
  const userRepo = new UserRepository(db)
  const settingsRepo = new UserSettingsRepository(db)

  // ---------------------------------------------------------------------------
  // Idempotency: skip if a terminal state already exists for this week
  // (Padrão 4 — terminal states: sent, unknown, skipped are never re-run)
  // ---------------------------------------------------------------------------

  const existingResult = digestRepo.findByUserAndWeek(options.userId, weekStart)
  if (existingResult.isErr()) {
    jobLogger.error('Failed to check existing digest', {
      error: existingResult.error.message,
    })
    return
  }

  const existingStatus = existingResult.value?.status
  if (
    existingStatus === 'sent' ||
    existingStatus === 'unknown' ||
    existingStatus === 'skipped'
  ) {
    jobLogger.info(
      `Digest already in terminal state '${existingStatus}' for this week — skipping (idempotent)`,
    )
    return
  }

  // ---------------------------------------------------------------------------
  // Create initial record with status='pending'
  // (Padrão 1 — create record before any work; unique constraint prevents dups)
  // If record already exists in 'pending' or 'failed' we proceed to claim it.
  // ---------------------------------------------------------------------------

  if (!existingResult.value) {
    const digestId = crypto.randomUUID()
    const createResult = digestRepo.create({
      id: digestId,
      userId: options.userId,
      weekStart,
      weekEnd,
      standupIds: [],
      insights: '',
      status: 'pending',
    })

    if (createResult.isErr()) {
      jobLogger.error('Failed to create digest record', {
        error: createResult.error.message,
      })
      return
    }
  }

  // ---------------------------------------------------------------------------
  // Atomic claim: transition pending/failed → sending
  // (Padrão 2 — UPDATE WHERE status IN ('pending','failed'))
  // Returns null if another process already claimed it.
  // ---------------------------------------------------------------------------

  const claimResult = digestRepo.claimForSending(options.userId, weekStart)
  if (claimResult.isErr()) {
    jobLogger.error('Failed to claim digest for sending', {
      error: claimResult.error.message,
    })
    return
  }

  const claimed = claimResult.value
  if (!claimed) {
    jobLogger.info(
      'Digest already claimed by another process — skipping (race condition guard)',
    )
    return
  }

  const digestId = claimed.id
  jobLogger.info('Digest claimed for sending', { digestId })

  // ---------------------------------------------------------------------------
  // Fetch approved standups for the week
  // ---------------------------------------------------------------------------

  const standupsResult = await withSpan(
    'digest.db.find_standups',
    {
      'digest.user_id': options.userId,
      'digest.week_start': weekStart,
      'digest.week_end': weekEnd,
    },
    () =>
      standupRepo.findApprovedByUserAndDateRange(
        options.userId,
        weekStart,
        weekEnd,
      ),
  )

  if (standupsResult.isErr()) {
    jobLogger.error('Failed to fetch approved standups', {
      error: standupsResult.error.message,
    })
    digestRepo.markFailed(digestId, standupsResult.error.message)
    return
  }

  const approvedStandups = standupsResult.value

  if (approvedStandups.length === 0) {
    jobLogger.info('No approved standups found for the week — skipping digest')
    digestRepo.markSkipped(digestId)
    return
  }

  jobLogger.info('Approved standups collected', {
    count: approvedStandups.length,
  })

  // ---------------------------------------------------------------------------
  // Fetch user email
  // ---------------------------------------------------------------------------

  const userResult = userRepo.findById(options.userId)
  if (userResult.isErr()) {
    const errMsg = userResult.error.message
    jobLogger.error('Failed to fetch user', { error: errMsg })
    digestRepo.markFailed(digestId, errMsg)
    return
  }

  const userEmail = userResult.value?.email
  if (!userEmail) {
    jobLogger.warn('User has no email address — skipping digest')
    digestRepo.markSkipped(digestId)
    return
  }

  // ---------------------------------------------------------------------------
  // Fetch user email theme preference
  // ---------------------------------------------------------------------------

  const settingsResult = settingsRepo.findByUserId(options.userId)
  const emailTheme = settingsResult.isOk()
    ? (settingsResult.value?.emailTheme ?? 'dark')
    : 'dark'
  const theme = getTheme(emailTheme as 'light' | 'dark')

  // ---------------------------------------------------------------------------
  // Generate AI insights
  // ---------------------------------------------------------------------------

  const generatorConfig = {
    aiProviderApiKey: env.AI_PROVIDER_API_KEY,
  }

  const insightsResult = await withSpan(
    'digest.llm.generate',
    {
      'digest.standup_count': approvedStandups.length,
      'digest.week_start': weekStart,
      'digest.week_end': weekEnd,
    },
    () => generateWeeklyInsights(approvedStandups, generatorConfig),
  )

  if (insightsResult.isErr()) {
    jobLogger.error('Failed to generate weekly insights', {
      error: insightsResult.error.message,
    })
    digestRepo.markFailed(digestId, insightsResult.error.message)
    return
  }

  const insights = insightsResult.value

  // ---------------------------------------------------------------------------
  // Persist standup IDs and insights before sending
  // This makes the digest record a complete audit trail of what was sent.
  // Failure here marks as failed — the email hasn't been sent yet, so retry is safe.
  // ---------------------------------------------------------------------------

  const saveContentResult = digestRepo.saveContent(
    digestId,
    approvedStandups.map((s) => s.id),
    insights,
  )

  if (saveContentResult.isErr()) {
    const errMsg = saveContentResult.error.message
    jobLogger.error('Failed to save digest content (standup IDs + insights)', {
      error: errMsg,
    })
    digestRepo.markFailed(digestId, errMsg)
    return
  }

  // ---------------------------------------------------------------------------
  // Render email
  // ---------------------------------------------------------------------------

  const weekLabel = formatWeekLabel(weekStart, weekEnd)
  const userName = userResult.value?.name ?? 'Desenvolvedor'

  // Build URLs from env.APP_URL (Padrão 10 — configurable unsubscribe URL)
  const appUrl = env.APP_URL
  const unsubscribeUrl = `${appUrl}/settings?unsubscribe=digest`

  // Convert insights markdown to email-safe HTML
  const insightsHtml = await withSpan(
    'digest.email.render',
    {
      'digest.week_label': weekLabel,
      'digest.standup_count': approvedStandups.length,
    },
    () => markdownToEmailHtml(insights, theme),
  )

  const digestData = {
    recipientName: userName,
    weekLabel,
    weekStart,
    weekEnd,
    standupCount: approvedStandups.length,
    insightsHtml,
    appUrl,
    unsubscribeUrl,
  }

  const html = renderWeeklyDigest(digestData, theme)
  const text = renderWeeklyDigestText(digestData)

  // ---------------------------------------------------------------------------
  // Send email
  //
  // Padrão 3 — smtp_accepted flag:
  //   smtpAccepted is set to true the moment sendEmail() returns Ok.
  //   Any error AFTER this point uses markUnknown(), because the email
  //   may have already been delivered. "When in doubt, do not resend."
  // ---------------------------------------------------------------------------

  const subject = `Resumo da semana ${weekStart} → ${weekEnd}`

  let smtpAccepted = false

  const smtp = smtpConfig
  const sendResult = await withSpan(
    'digest.email.send',
    {
      'email.to': userEmail,
      'email.subject': subject,
      'digest.id': digestId,
    },
    () =>
      sendEmail(smtp, { to: userEmail, subject, html, text, unsubscribeUrl }),
  )

  if (sendResult.isErr()) {
    // SMTP rejected the message — safe to mark failed and retry later
    jobLogger.error('Failed to send weekly digest email (SMTP rejected)', {
      error: sendResult.error.message,
    })
    digestRepo.markFailed(digestId, sendResult.error.message)
    return
  }

  // Transport accepted the message — from this point any error → markUnknown
  smtpAccepted = true
  const { messageId } = sendResult.value

  jobLogger.info('SMTP accepted email', { messageId })

  // ---------------------------------------------------------------------------
  // Persist success
  // ---------------------------------------------------------------------------

  const updateResult = digestRepo.markSent(digestId)
  if (updateResult.isErr()) {
    // SMTP accepted but DB write failed — state is ambiguous (Padrão 3)
    const errMsg = updateResult.error.message
    jobLogger.error(
      'SMTP accepted email but failed to mark digest as sent in DB — marking unknown',
      { error: errMsg, messageId, smtpAccepted },
    )
    digestRepo.markUnknown(digestId, errMsg)
    return
  }

  jobLogger.info('Weekly digest sent successfully', {
    to: userEmail,
    messageId,
    standupCount: approvedStandups.length,
  })
}
