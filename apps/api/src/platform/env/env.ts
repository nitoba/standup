import { environmentVariablesSchema } from './env.schema'
import type { EnvironmentVariables } from './env.types'

export function validateEnvironment(
  raw: Record<string, unknown>,
): EnvironmentVariables {
  const parsed = environmentVariablesSchema.safeParse(raw)

  if (!parsed.success) {
    const message = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || 'env'}: ${issue.message}`)
      .join('; ')

    throw new Error(`Invalid environment: ${message}`)
  }

  return parsed.data
}
