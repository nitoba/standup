import { z } from 'zod'
import { executeCommand } from '../utils/command'

const input = z.object({
	repositoryPath: z.string().optional().describe('The path from repository'),
	authorName: z.string().optional().describe('The git author name to filter'),
	authorEmail: z.string().optional().describe('The git author email to filter'),
})

const result = z.object({
	branches: z.array(z.string()),
	error: z.string().optional(),
})

export async function getWorkedBranches({
	authorEmail,
	authorName,
	repositoryPath,
}: z.infer<typeof input>): Promise<z.infer<typeof result>> {
	let authorFilter = ''
	if (authorEmail) {
		authorFilter = `--author="${authorEmail}"`
	} else if (authorName) {
		authorFilter = `--author="${authorName}"`
	}

	executeCommand('git fetch origin', repositoryPath)

	const command = `git log --all ${authorFilter} --since="16 hours ago" --format="%D" \
    | sed 's/,.*//; s/HEAD -> //' \
    | grep -vE '^(master|dev|sprint)$' \
    | grep -v '^$' \
    | sort -u`

	const proc = executeCommand(command, repositoryPath)
	const output = await proc.stdout.text()
	const error = await proc.stderr.text()

	const allBranches = output
		.split('\n')
		.filter(Boolean)
		.filter((b) => !b.includes('master'))

	// Remove duplicatas: se existir origin/branch e branch, mantém apenas branch (local)
	const branchSet = new Set<string>()
	const localBranches = new Set<string>()

	// Primeiro, identifica todas as branches locais
	for (const branch of allBranches) {
		if (!branch.startsWith('origin/')) {
			localBranches.add(branch)
			branchSet.add(branch)
		}
	}

	// Depois, adiciona branches remotas apenas se não existir a versão local
	for (const branch of allBranches) {
		if (branch.startsWith('origin/')) {
			const localName = branch.replace('origin/', '')
			if (!localBranches.has(localName)) {
				branchSet.add(branch)
			}
		}
	}

	return {
		branches: Array.from(branchSet).sort(),
		error: error.trim() || undefined,
	}
}
