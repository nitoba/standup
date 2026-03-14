import type * as z from 'zod'
import type { environmentVariablesSchema } from './env.schema'

export type EnvironmentVariables = z.output<typeof environmentVariablesSchema>
