import { Result, ValidationError } from '@standup/domain'
import { z } from 'zod'

const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.coerce.number().int().positive().default(3333),
  DATABASE_URL: z.string().default('./data/standup.db'),
  TIMEZONE: z.string().default('America/Sao_Paulo'),
  STANDUP_CRON: z.string().default('30 17 * * 1-5'),
  STANDUP_REMINDER_CRON: z.string().default('20 17 * * 1-5'),
  DISCORD_BOT_TOKEN: z.string().optional(),
  DISCORD_CHANNEL_ID: z.string().optional(),
  DISCORD_USER_ID: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_AUTH_TOKEN: z.string().optional(),
  AZURE_DEVOPS_ORG: z.string().optional(),
  AZURE_DEVOPS_ORG_URL: z.string().optional(),
  AZURE_DEVOPS_PAT: z.string().optional(),
  AZURE_DEVOPS_DEFAULT_PROJECT: z.string().default('AGROTRACE'),
  REPOS_BASE_PATH: z.string().default('/home/nitoba/Documents/repos/ibs/repos'),
  GIT_AUTHOR: z.string().default('bruno.alves@biosistemico.com.br'),
  GIT_SINCE_PERIOD: z.string().default('16 hours ago'),
})

export type AppEnv = z.infer<typeof envSchema>

export function loadEnv(
  raw: Record<string, string | undefined> = process.env,
): Result<AppEnv, ValidationError> {
  const parsed = envSchema.safeParse(raw)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return Result.err(
      new ValidationError({
        field: issue?.path.join('.') ?? 'env',
        message: issue?.message ?? 'Invalid environment',
      }),
    )
  }

  return Result.ok(parsed.data)
}
