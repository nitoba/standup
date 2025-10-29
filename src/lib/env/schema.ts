import z from 'zod'

export const envSchema = z.object({
	// User Configuration (Optional - auto-detected from git config if not provided)
	GIT_AUTHOR_NAME: z.string(),
	GIT_AUTHOR_EMAIL: z.string().email(),
	AZURE_DEVOPS_USER_EMAIL: z.string().email(),
	AZURE_DEVOPS_PAT: z.string(),

	// Repository Configuration
	REPOSITORIES_FOLDER: z.string(),
	GOOGLE_GENERATIVE_AI_API_KEY: z.string(),

	STANDUP_GENERATED_FOLDER: z.string().optional(),
})
