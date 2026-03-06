import { ExternalServiceError, Result } from '@standup/domain'
import { createServiceLogger } from '@standup/logger'
import type { ButtonInteraction } from 'discord.js'

const logger = createServiceLogger({
  service: 'discord-bot',
  component: 'reminder-handler',
})

export type ReminderAction = 'run-now' | 'snooze' | 'cancel-today'

export interface ReminderHandlerDeps {
  workerInternalUrl: string
  apiBaseUrl: string
  internalSecret: string
  discordUserId: string
}

// ---------------------------------------------------------------------------
// Internal HTTP helpers
// ---------------------------------------------------------------------------

async function postWorker(
  url: string,
  secret: string,
): Promise<Result<void, ExternalServiceError>> {
  return Result.tryPromise({
    try: async () => {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-internal-secret': secret,
        },
        body: JSON.stringify({}),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
    },
    catch: (err) =>
      new ExternalServiceError({
        service: 'worker',
        message: `Worker call failed: ${err instanceof Error ? err.message : String(err)}`,
      }),
  })
}

async function postApi(
  url: string,
  secret: string,
  discordUserId: string,
): Promise<Result<void, ExternalServiceError>> {
  return Result.tryPromise({
    try: async () => {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-internal-secret': secret,
        },
        body: JSON.stringify({ discordUserId }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
    },
    catch: (err) =>
      new ExternalServiceError({
        service: 'api',
        message: `API call failed: ${err instanceof Error ? err.message : String(err)}`,
      }),
  })
}

// ---------------------------------------------------------------------------
// Action handlers
// ---------------------------------------------------------------------------

const ACTION_EMOJI: Record<ReminderAction, string> = {
  'run-now': '\u{25B6}', // ▶
  snooze: '\u{23F0}', // ⏰
  'cancel-today': '\u{274C}', // ❌
}

const ACTION_MESSAGE: Record<ReminderAction, string> = {
  'run-now': 'Standup sendo gerado agora...',
  snooze: 'Standup adiado por 15 minutos.',
  'cancel-today': 'Standup cancelado para hoje.',
}

/**
 * Processa um botão de lembrete de standup (run-now / snooze / cancel-today).
 * Difere o update para evitar timeout do Discord (3s).
 * Cada ação chama o serviço HTTP correspondente e edita a reply com feedback visual.
 */
export async function handleReminderInteraction(
  interaction: ButtonInteraction,
  action: ReminderAction,
  deps: ReminderHandlerDeps,
): Promise<void> {
  const interactionLogger = logger

  await interaction.deferUpdate()

  let result: Result<void, ExternalServiceError>

  if (action === 'run-now') {
    result = await postApi(
      `${deps.apiBaseUrl}/standups/trigger`,
      deps.internalSecret,
      deps.discordUserId,
    )
  } else if (action === 'snooze') {
    result = await postWorker(
      `${deps.workerInternalUrl}/internal/reminder/snooze`,
      deps.internalSecret,
    )
  } else {
    result = await postWorker(
      `${deps.workerInternalUrl}/internal/reminder/cancel`,
      deps.internalSecret,
    )
  }

  const emoji = ACTION_EMOJI[action]
  const message = ACTION_MESSAGE[action]

  if (result.isOk()) {
    interactionLogger.info('Reminder action handled', { action })
    await interaction.editReply({
      content: `${emoji} ${message}`,
      components: [], // remove botões após ação
    })
  } else {
    interactionLogger.error('Reminder action failed', {
      action,
      error: result.error.message,
    })
    await interaction.editReply({
      content: `\u{274C} Erro ao processar ação: ${result.error.message}`,
      components: [],
    })
  }
}
