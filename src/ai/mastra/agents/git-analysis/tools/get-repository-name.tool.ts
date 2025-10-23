import { executeCommand } from '../utils/command'

/**
 * Extracts the project name from a git remote URL
 * Examples:
 * - https://github.com/user/my-project.git -> my-project
 * - https://dev.azure.com/org/Project/_git/Repository -> Repository
 * - git@github.com:user/my-project.git -> my-project
 */
function extractProjectName(url: string): string {
	if (!url) return 'Unknown Project'

	// Remove .git extension if present
	const cleanUrl = url.replace(/\.git$/, '')

	// Split by / and get the last part
	const parts = cleanUrl.split('/')
	const lastPart = parts[parts.length - 1]

	// If empty, try to get the second to last part (for URLs ending with /)
	if (!lastPart && parts.length > 1) {
		return parts[parts.length - 2] || 'Unknown Project'
	}

	// For SSH URLs like git@github.com:user/repo
	if (lastPart?.includes(':')) {
		const sshParts = lastPart.split(':')
		return sshParts[sshParts.length - 1] || 'Unknown Project'
	}

	return lastPart || 'Unknown Project'
}

export async function getRepositoryName(repositoryPath: string) {
	const command = 'git remote get-url origin'

	const proc = executeCommand(command, repositoryPath)

	const output = await proc.stdout.text()
	const error = await proc.stderr.text()

	const url = output.trim()
	const projectName = extractProjectName(url)

	return {
		projectName,
		error: error.trim() || undefined,
	}
}
