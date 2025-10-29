import 'dotenv/config'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { z } from 'zod'
import { envSchema } from './env/schema'

// Type for the parsed environment variables
export type EnvVars = z.infer<typeof envSchema>

// Required environment variables for the app to function
const requiredEnvVars = [
	'AZURE_DEVOPS_PAT',
	'GOOGLE_GENERATIVE_AI_API_KEY',
	'REPOSITORIES_FOLDER',
	'GIT_AUTHOR_NAME',
	'GIT_AUTHOR_EMAIL',
	'AZURE_DEVOPS_USER_EMAIL',
] as const

// Function to validate environment variables
export function validateEnv(): {
	success: boolean
	data?: EnvVars
	missing?: string[]
} {
	try {
		const result = envSchema.safeParse(Bun.env)

		if (!result.success) {
			return { success: false, missing: Array.from(requiredEnvVars) }
		}
		const missing = requiredEnvVars.filter((key) => !result.data[key])

		if (missing.length > 0) {
			return { success: false, missing }
		}

		return { success: true, data: result.data }
	} catch (error) {
		return { success: false }
	}
}

// Function to save environment variables to .env file
export function saveEnvFile(vars: Partial<EnvVars>): void {
	const envPath = join(process.cwd(), '.env')
	let existingContent = ''

	// Read existing .env file if it exists
	if (existsSync(envPath)) {
		existingContent = readFileSync(envPath, 'utf-8')
	}

	// Parse existing content into lines
	const lines = existingContent.split('\n')
	const updatedLines = [...lines]

	// Update or add each variable
	Object.entries(vars).forEach(([key, value]) => {
		if (value === undefined || value === '') return

		const envLine = `${key}=${value}`
		const keyIndex = updatedLines.findIndex((line) =>
			line.startsWith(`${key}=`)
		)

		if (keyIndex >= 0) {
			updatedLines[keyIndex] = envLine
		} else {
			updatedLines.push(envLine)
		}
	})

	// Write back to file
	writeFileSync(envPath, updatedLines.join('\n'))
}

// Function to get environment variable descriptions
export function getEnvDescriptions() {
	return {
		GIT_AUTHOR_NAME:
			'Your name for git commits (optional - auto-detected from git config)',
		GIT_AUTHOR_EMAIL:
			'Your email for git commits (optional - auto-detected from git config)',
		AZURE_DEVOPS_USER_EMAIL: 'Your Azure DevOps user email',
		AZURE_DEVOPS_USER_DISPLAY_NAME: 'Your display name in Azure DevOps',
		AZURE_DEVOPS_PAT: 'Your Azure DevOps Personal Access Token',
		REPOSITORIES_FOLDER: 'Path to your repositories folder',
		GOOGLE_GENERATIVE_AI_API_KEY: 'Your Google Generative AI API key',
		STANDUP_GENERATED_FOLDER: 'Path where standup reports will be generated',
	} as const
}
