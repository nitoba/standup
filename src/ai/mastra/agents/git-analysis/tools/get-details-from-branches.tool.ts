import { z } from 'zod'
import { executeCommand } from '../utils/command'

const input = z.object({
	repositoryPath: z.string().optional().describe('The path from repository'),
	branches: z.array(z.string()).describe('The branches to get details'),
})

export async function getDetailsFromBranches({
	branches,
	repositoryPath,
}: z.infer<typeof input>) {
	const operations = branches.map(async (b) => {
		const command = `git log ${b} --since="16 hours ago" --pretty=format:"---%n[${b}]%n%s%n%b%n"`

		const proc = executeCommand(command, repositoryPath)

		const output = await proc.stdout.text()
		const error = await proc.stderr.text()

		return {
			output,
			error,
		}
	})

	const result = await Promise.all(operations)

	return result
}
