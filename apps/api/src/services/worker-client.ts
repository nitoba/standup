import { ExternalServiceError, Result } from '@standup/domain'
import { tracedFetch } from '@standup/observability'

// ---------------------------------------------------------------------------
// Shared deps & HTTP helper
// ---------------------------------------------------------------------------

export interface WorkerClientDeps {
  workerInternalUrl: string
  internalSecret: string
}

async function callWorker<T>(
  deps: WorkerClientDeps,
  path: string,
  init: RequestInit,
  errorPrefix: string,
  expectedStatus?: number,
  parse?: (response: Response) => Promise<T>,
): Promise<Result<T, ExternalServiceError>> {
  return Result.tryPromise({
    try: async () => {
      const response = await tracedFetch(`${deps.workerInternalUrl}${path}`, {
        ...init,
        headers: {
          'x-internal-secret': deps.internalSecret,
          ...(init.headers ?? {}),
        },
      })

      if (expectedStatus !== undefined) {
        if (response.status !== expectedStatus) {
          throw new Error(`HTTP ${response.status}`)
        }
      } else if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      if (parse) {
        return parse(response)
      }

      return undefined as T
    },
    catch: (error) =>
      new ExternalServiceError({
        service: 'worker',
        message: `${errorPrefix}: ${error instanceof Error ? error.message : String(error)}`,
      }),
  })
}

// ---------------------------------------------------------------------------
// Trigger standup job
// ---------------------------------------------------------------------------

export interface TriggerStandupJobOptions {
  userId: string
  discordUserId: string
  reposRootPath: string
  selectedRepos: string[]
  gitAuthor: string
  timezone: string
  gitSincePeriod?: string
  extraContext?: string
  forceRegenerate?: boolean
  rewriteFromStandupId?: string
  rewriteInstruction?: string
  replaceStandupId?: string
  reuseExistingSource?: boolean
}

/**
 * POST /internal/trigger/standup on the worker.
 * The API merely forwards the trigger; execution lives in the worker.
 */
export async function triggerStandupJob(
  deps: WorkerClientDeps,
  options: TriggerStandupJobOptions,
): Promise<Result<void, ExternalServiceError>> {
  return callWorker<void>(
    deps,
    '/internal/trigger/standup',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        userId: options.userId,
        discordUserId: options.discordUserId,
        reposRootPath: options.reposRootPath,
        selectedRepos: options.selectedRepos,
        gitAuthor: options.gitAuthor,
        timezone: options.timezone,
        gitSincePeriod: options.gitSincePeriod,
        extraContext: options.extraContext,
        forceRegenerate: options.forceRegenerate,
        rewriteFromStandupId: options.rewriteFromStandupId,
        rewriteInstruction: options.rewriteInstruction,
        replaceStandupId: options.replaceStandupId,
        reuseExistingSource: options.reuseExistingSource,
      }),
    },
    'Failed to trigger standup job',
    202,
  )
}

// ---------------------------------------------------------------------------
// Trigger weekly digest job
// ---------------------------------------------------------------------------

/**
 * POST /internal/trigger/weekly-digest on the worker.
 */
export async function triggerWeeklyDigestJob(
  deps: WorkerClientDeps,
  userId: string,
): Promise<Result<void, ExternalServiceError>> {
  return callWorker<void>(
    deps,
    '/internal/trigger/weekly-digest',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ userId }),
    },
    'Failed to trigger weekly digest job',
    202,
  )
}

// ---------------------------------------------------------------------------
// List repos
// ---------------------------------------------------------------------------

export interface RepoInfo {
  name: string
  id: string
  project: string
}

export async function listRepos(
  deps: WorkerClientDeps,
): Promise<Result<RepoInfo[], ExternalServiceError>> {
  return callWorker(
    deps,
    '/internal/repos/list',
    { method: 'GET' },
    'Failed to list repos',
    undefined,
    async (response) => {
      const data = (await response.json()) as { repos?: unknown[] }
      const repos = data.repos ?? []

      return repos.filter(
        (repo): repo is RepoInfo =>
          typeof repo === 'object' &&
          repo !== null &&
          typeof (repo as Record<string, unknown>).name === 'string' &&
          typeof (repo as Record<string, unknown>).id === 'string' &&
          typeof (repo as Record<string, unknown>).project === 'string',
      )
    },
  )
}

// ---------------------------------------------------------------------------
// Reminders
// ---------------------------------------------------------------------------

export interface ReminderMutationOptions {
  userId: string
}

export interface SnoozeReminderResponse {
  ok: boolean
  snoozedUntil: string
}

export interface CancelReminderForTodayResponse {
  ok: boolean
  cancelledDate: string
}

export async function snoozeReminder(
  deps: WorkerClientDeps,
  options: ReminderMutationOptions,
): Promise<Result<SnoozeReminderResponse, ExternalServiceError>> {
  return callWorker(
    deps,
    '/internal/reminder/snooze',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ userId: options.userId }),
    },
    'Failed to snooze reminder',
    200,
    async (response) => (await response.json()) as SnoozeReminderResponse,
  )
}

export async function cancelReminderForToday(
  deps: WorkerClientDeps,
  options: ReminderMutationOptions,
): Promise<Result<CancelReminderForTodayResponse, ExternalServiceError>> {
  return callWorker(
    deps,
    '/internal/reminder/cancel',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ userId: options.userId }),
    },
    'Failed to cancel reminder',
    200,
    async (response) =>
      (await response.json()) as CancelReminderForTodayResponse,
  )
}
