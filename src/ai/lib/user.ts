import { existsSync } from 'node:fs'
import { readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { z } from 'zod'

export const userIdentifierSchema = z
	.object({
		azureDevOpsId: z.string().optional(),
		azureDevOpsEmail: z.email().optional(),
		azureDevOpsDisplayName: z.string().optional(),
		gitAuthorName: z.string().optional(),
		gitAuthorEmail: z.email().optional(),
	})
	.refine(
		(data) =>
			data.azureDevOpsId ||
			data.azureDevOpsEmail ||
			data.azureDevOpsDisplayName ||
			data.gitAuthorName ||
			data.gitAuthorEmail,
		{
			message: 'At least one user identifier must be provided',
		}
	)

export type UserIdentifier = z.infer<typeof userIdentifierSchema>

export async function detectUserFromGitConfig(
	repositoryPath: string
): Promise<UserIdentifier> {
	try {
		const proc = Bun.spawn(['git', 'config', 'user.name'], {
			cwd: repositoryPath,
			stdout: 'pipe',
		})
		const name = (await proc.stdout.text()).trim()

		const procEmail = Bun.spawn(['git', 'config', 'user.email'], {
			cwd: repositoryPath,
			stdout: 'pipe',
		})
		const email = (await procEmail.stdout.text()).trim()

		return {
			gitAuthorName: name || undefined,
			gitAuthorEmail: email || undefined,
		}
	} catch {
		throw new Error('Failed to detect user from git config')
	}
}

export async function discoverRepositories(
	parentFolder: string
): Promise<string[]> {
	const repositories: string[] = []

	try {
		if (!existsSync(parentFolder)) {
			throw new Error(`Parent folder does not exist: ${parentFolder}`)
		}

		const entries = await readdir(parentFolder)

		for (const entry of entries) {
			const fullPath = join(parentFolder, entry)

			try {
				const stats = await stat(fullPath)

				if (!stats.isDirectory()) {
					continue
				}

				const gitPath = join(fullPath, '.git')
				if (existsSync(gitPath)) {
					repositories.push(fullPath)
				}
			} catch (error) {
				console.warn(`Skipping inaccessible directory: ${fullPath}`, error)
			}
		}

		return repositories
	} catch (error) {
		throw new Error(`Failed to discover repositories: ${error}`)
	}
}

export function validateUserIdentifier(user: unknown): UserIdentifier {
	return userIdentifierSchema.parse(user)
}
