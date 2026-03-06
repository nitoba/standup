import { Result, ValidationError } from '@standup/domain'
import * as z from 'zod'

const baseEnvSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.coerce.number().int().positive().default(3333),
  DATABASE_URL: z.string().default('./data/standup.db'),
  INTERNAL_SECRET: z.string().default('change-me-in-production'),
})

const apiEnvSchema = baseEnvSchema.extend({
  DISCORD_USER_ID: z.string().min(1),
  WORKER_INTERNAL_URL: z.string().default('http://localhost:3335'),
})

const botEnvSchema = baseEnvSchema.extend({
  BOT_INTERNAL_PORT: z.coerce.number().int().positive().default(3334),
  API_BASE_URL: z.string().default('http://localhost:3333'),
  DISCORD_BOT_TOKEN: z.string().min(1),
  DISCORD_CHANNEL_ID: z.string().min(1),
  DISCORD_USER_ID: z.string().min(1),
  DISCORD_GUILD_ID: z.string().optional(), // Guild commands (dev) vs global (prod)
})

const workerEnvSchema = baseEnvSchema.extend({
  TIMEZONE: z.string().default('America/Sao_Paulo'),
  STANDUP_CRON: z.string().default('30 17 * * 1-5'),
  STANDUP_REMINDER_CRON: z.string().default('20 17 * * 1-5'),
  // Recovery cron — roda X minutos após o principal como safety net (Padrão 5 do Akita)
  // Default: 18:00 nos dias úteis (30 min após o cron principal das 17:30)
  STANDUP_RECOVERY_CRON: z.string().default('0 18 * * 1-5'),
  ANTHROPIC_AUTH_TOKEN: z.string().min(1),
  AZURE_DEVOPS_ORG: z.string().min(1),
  AZURE_DEVOPS_PAT: z.string().min(1),
  AZURE_DEVOPS_DEFAULT_PROJECT: z.string().default('AGROTRACE'),
  REPOS_BASE_PATH: z.string().default('/home/nitoba/Documents/repos/ibs/repos'),
  GIT_AUTHOR: z.string().default('bruno.alves@biosistemico.com.br'),
  GIT_SINCE_PERIOD: z.string().default('16 hours ago'),
  BOT_INTERNAL_URL: z.string().default('http://localhost:3334'),
  WORKER_INTERNAL_PORT: z.coerce.number().int().positive().default(3335),
})

function parseEnv<TSchema extends z.ZodTypeAny>(
  schema: TSchema,
  raw: Record<string, string | undefined> = process.env,
): Result<z.infer<TSchema>, ValidationError> {
  const parsed = schema.safeParse(raw)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    const field = issue?.path.join('.') ?? 'env'
    const detail = issue?.message ?? 'Invalid environment'
    return Result.err(
      new ValidationError({
        field,
        message: `${field}: ${detail}`,
      }),
    )
  }

  return Result.ok(parsed.data)
}

export type BaseEnv = z.infer<typeof baseEnvSchema>
export type ApiEnv = z.infer<typeof apiEnvSchema>
export type BotEnv = z.infer<typeof botEnvSchema>
export type WorkerEnv = z.infer<typeof workerEnvSchema>

export function loadApiEnv(
  raw: Record<string, string | undefined> = process.env,
): Result<ApiEnv, ValidationError> {
  return parseEnv(apiEnvSchema, raw)
}

export function loadBotEnv(
  raw: Record<string, string | undefined> = process.env,
): Result<BotEnv, ValidationError> {
  return parseEnv(botEnvSchema, raw)
}

export function loadWorkerEnv(
  raw: Record<string, string | undefined> = process.env,
): Result<WorkerEnv, ValidationError> {
  return parseEnv(workerEnvSchema, raw)
}
