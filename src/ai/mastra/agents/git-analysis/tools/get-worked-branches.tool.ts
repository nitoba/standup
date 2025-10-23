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
  | grep -E '^(origin/|master|dev|sprint)' \
  | sort -u`

	console.log(command)
	const proc = executeCommand(command, repositoryPath)

	const output = await proc.stdout.text()
	const error = await proc.stderr.text()

	// console.log({ output, error })

	return {
		branches: output
			.split('\n')
			.filter(Boolean)
			.filter((b) => !b.includes('master')),
		error: error.trim() || undefined,
	}
}
