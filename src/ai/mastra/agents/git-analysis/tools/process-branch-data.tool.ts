interface ProcessedBranchInput {
	branchName: string
	cardNumber: string
	commitMessages: string[]
}

function extractCardNumber(branchName: string): string {
	const match = branchName.match(/(\d+)/)
	return match ? String(match?.[1]) : ''
}

function parseCommitDetails(commitsOutput: string): string[] {
	const lines = commitsOutput.split('\n')
	const commitMessages: string[] = []
	let currentMessage = ''
	let inCommit = false
	let skipNextLine = false

	for (const line of lines) {
		if (line.startsWith('---')) {
			// Finaliza o commit anterior se existir
			if (currentMessage.trim()) {
				commitMessages.push(currentMessage.trim())
			}
			// Inicia novo commit
			currentMessage = ''
			inCommit = true
			skipNextLine = true // Pular a próxima linha que é [branch-name]
			continue
		}

		// Pular a linha com o nome da branch
		if (skipNextLine) {
			skipNextLine = false
			continue
		}

		// Adiciona linhas ao commit atual
		if (inCommit && line.trim()) {
			currentMessage += (currentMessage ? '\n' : '') + line
		}
	}

	// Adiciona o último commit se existir
	if (currentMessage.trim()) {
		commitMessages.push(currentMessage.trim())
	}

	return commitMessages
}

export function processBranchData(
	branches: string[],
	// key: branch name - value: commits
	branchesDetailsMap: Map<string, string>
): ProcessedBranchInput[] {
	const irrelevantBranches = ['main', 'master', 'dev']

	return branches
		.filter((branch) => {
			const branchName = branch.toLowerCase()
			return (
				!irrelevantBranches.includes(branchName) &&
				!branchName.startsWith('sprint/') &&
				!branchName.startsWith('release/') &&
				!branchName.startsWith('hotfix/')
			)
		})
		.map((branch) => {
			const commitsOutput = branchesDetailsMap.get(branch)
			const commitMessages = commitsOutput
				? parseCommitDetails(commitsOutput)
				: []
			const cardNumber = extractCardNumber(branch)

			return {
				branchName: branch,
				cardNumber,
				commitMessages,
			}
		})
		.filter((branch) => branch.commitMessages.length > 0)
}
