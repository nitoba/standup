import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { env } from '@/lib/env'

export const google = createGoogleGenerativeAI({
	apiKey: env.GOOGLE_GENERATIVE_AI_API_KEY,
})
