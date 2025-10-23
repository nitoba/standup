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
		executeCommand('git fetch origin', repositoryPath)
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

// console.log(
// 	await getDetailsFromBranches({
// 		branches: [
// 			'origin/fix/soft-delete-form-pergunta-item-lista',
// 			'origin/refactor/registro-feat',
// 			'origin/refactor/vertical-tabs-cadastro-propriedade',
// 		],
// 		repositoryPath: '/home/bruno-alves/Documents/projects/ibs/agrotrace-v3',
// 	})
// )
