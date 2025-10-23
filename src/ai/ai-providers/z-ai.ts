import { createOpenAICompatible } from '@ai-sdk/openai-compatible'

export type ModelIds = 'GLM-4.6' | 'GLM-4.5' | 'GLM-4.5-Air' | (string & {})

export const zAi = createOpenAICompatible<ModelIds, ModelIds, string, string>({
	name: 'z.ai',
	apiKey: process.env.ZAI_API_KEY,
	baseURL: 'https://api.z.ai/api/coding/paas/v4',
	includeUsage: true,
})
