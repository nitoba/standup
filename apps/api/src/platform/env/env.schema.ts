import * as z from 'zod'

/**
 * z.coerce.boolean() uses Boolean(value) internally, which converts any
 * non-empty string to true — including the string "false". This helper
 * correctly parses env-var style booleans: "true"/"1" → true, everything
 * else → false.
 */
const booleanFromEnv = z
  .union([z.boolean(), z.string(), z.undefined()])
  .transform((val) => {
    if (typeof val === 'boolean') return val
    if (val === undefined || val === '') return undefined
    return val === 'true' || val === '1'
  })

export const environmentVariablesSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.coerce.number().int().positive().default(3333),
  CORS_ORIGIN: z.string().default('http://localhost:4200'),
  DATABASE_URL: z.string().default('file:./data/standup.db'),
  DATABASE_AUTH_TOKEN: z.string().optional(),
  REPOS_ROOT_PATH: z.string().default('/repos'),
  BETTER_AUTH_SECRET: z.string().default('change-me-in-production'),
  BETTER_AUTH_URL: z.string().default('http://localhost:3333'),
  DISCORD_CLIENT_ID: z.string().optional(),
  DISCORD_CLIENT_SECRET: z.string().optional(),
  DISCORD_BOT_TOKEN: z.string().optional(),
  DISCORD_CHANNEL_ID: z.string().optional(),
  DISCORD_GUILD_ID: z.string().optional(),
  DISCORD_GATEWAY_ENABLED: booleanFromEnv.default(true),
  SCHEDULER_ENABLED: booleanFromEnv.default(true),
  GOOGLE_API_KEY: z.string().optional(),
  GROQ_API_KEY: z.string().optional(),
  OPENROUTER_API_KEY: z.string().optional(),
  LLM_PROVIDERS_CONFIG: z.string().optional(),
  AZURE_DEVOPS_ORG: z.string().optional(),
  AZURE_DEVOPS_PAT: z.string().optional(),
  AZURE_DEVOPS_DEFAULT_PROJECT: z.string().default('AGROTRACE'),
  AZURE_DEVOPS_PROJECTS: z.string().optional().default('AGROTRACE,CHECKMILK'),
  APP_URL: z.string().default('http://localhost:4200'),
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().optional(),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().optional(),
  SMTP_SECURE: booleanFromEnv.default(false),
  DISCORD_AUTOMATION_URL: z.string().url().optional(),
  DISCORD_AUTOMATION_CHANNEL_URL: z.string().url().optional(),
  DISCORD_AUTOMATION_WEBHOOK_SECRET: z.string().optional(),
  DISCORD_SEND_TIMEOUT_MS: z.coerce.number().default(60000),
})
