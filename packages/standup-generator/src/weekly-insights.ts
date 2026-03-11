// ---------------------------------------------------------------------------
// Weekly Insights Generator
//
// Takes a list of approved standup records for the week and uses the LLM to
// generate a structured insights digest in Markdown (Portuguese).
//
// Output is intentionally concise — the email template wraps it in context.
// ---------------------------------------------------------------------------

import { createGoogleGenerativeAI } from '@ai-sdk/google'
import type { StandupRecord } from '@standup/domain'
import { ExternalServiceError, Result } from '@standup/domain'
import { createServiceLogger } from '@standup/logger'
import { generateText } from 'ai'
import type { GeneratorConfig } from './types.js'

const logger = createServiceLogger({
  service: 'standup-generator',
  component: 'weekly-insights',
})

const SYSTEM_PROMPT = `Você é um assistente técnico que analisa standups de desenvolvedores.
Sua tarefa é gerar um resumo executivo semanal em Markdown (português).

Diretrizes:
- Seja objetivo e técnico — sem frases vazias ou elogios
- Use bullet points (- item) para listas
- Organize em seções com ## (nível 2 apenas)
- Limite: 800 palavras no total
- Idioma: português do Brasil

Seções obrigatórias:
## Destaques da Semana
(principais entregas e conquistas técnicas)

## Padrões Identificados
(repetições, bloqueios, ou tendências nos commits)

## Itens para Atenção
(pendências, débitos técnicos, ou riscos observados)

## Próximos Passos Sugeridos
(baseado no que foi feito esta semana)`

function buildUserMessage(standups: StandupRecord[]): string {
  const lines: string[] = [
    `Analise os ${standups.length} standups aprovados da semana abaixo e gere o resumo executivo:`,
    '',
  ]

  for (const standup of standups) {
    lines.push(`### ${standup.date} — ${standup.meetingType}`)
    lines.push(standup.content)
    lines.push('')
  }

  return lines.join('\n')
}

/**
 * Generates a weekly insights summary from approved standup records.
 *
 * Returns Result<markdown string, ExternalServiceError>.
 * Never retries internally — caller can retry if needed.
 */
export async function generateWeeklyInsights(
  standups: StandupRecord[],
  config: GeneratorConfig,
): Promise<Result<string, ExternalServiceError>> {
  if (standups.length === 0) {
    return Result.err(
      new ExternalServiceError({
        service: 'ai-provider',
        message: 'No standups provided for weekly insights generation',
      }),
    )
  }

  const apiKey = config.aiProviderApiKey
  if (!apiKey) {
    return Result.err(
      new ExternalServiceError({
        service: 'ai-provider',
        message: 'No authentication configured: set AI_PROVIDER_API_KEY',
      }),
    )
  }

  logger.info('Generating weekly insights', { standupCount: standups.length })

  return Result.tryPromise({
    try: async () => {
      const provider = createGoogleGenerativeAI({ apiKey })

      const { text } = await generateText({
        model: provider('gemini-3.1-flash-lite-preview'),
        system: SYSTEM_PROMPT,
        prompt: buildUserMessage(standups),
      })

      logger.info('Weekly insights generated', {
        standupCount: standups.length,
        outputLength: text.length,
      })

      return text
    },
    catch: (err) =>
      new ExternalServiceError({
        service: 'ai-provider',
        message: `Weekly insights generation failed: ${err instanceof Error ? err.message : String(err)}`,
      }),
  })
}
