import { getDetailsFromBranches } from '@/ai/agents/git-analysis/tools/get-details-from-branches.tool'
import { getRepositoryName } from '@/ai/agents/git-analysis/tools/get-repository-name.tool'
import { getWorkedBranches } from '@/ai/agents/git-analysis/tools/get-worked-branches.tool'
import { processBranchData } from '@/ai/agents/git-analysis/tools/process-branch-data.tool'
import type { UserIdentifier } from '@/ai/lib/user'

type Input = {
	repositories: string[]
	user: UserIdentifier
}

export async function executeGitAnalysis({ repositories, user }: Input) {
	const allResults: Array<{
		repositoryPath: string
		projectName: string
		branches: Array<{
			branchName: string
			cardNumber: string
			commitMessages: string[]
		}>
	}> = []

	// Process repositories in batches
	for (const repositoryPath of repositories) {
		// logger.info(`Analyzing repository: ${repositoryPath}`)

		const authorName = user.gitAuthorName
		const authorEmail = user.gitAuthorEmail

		// Get project name from repository URL
		const { projectName, error: projectNameError } =
			await getRepositoryName(repositoryPath)

		if (projectNameError) {
			// logger.error(
			// 	`Failed to get repository URL for ${repositoryPath}: ${projectNameError}`
			// )
			continue
		}

		// Get worked branches
		const { branches, error: branchesError } = await getWorkedBranches({
			authorEmail,
			authorName,
			repositoryPath,
		})

		if (branchesError) {
			// logger.error(
			// 	`Failed to get worked branches for ${repositoryPath}: ${branchesError}`
			// )
			continue
		}

		if (branches.length === 0) {
			// logger.info(`No branches found for ${repositoryPath}`)
			continue
		}

		// Get detailed information for each branch
		const branchesDetailsResults = await getDetailsFromBranches({
			branches,
			repositoryPath,
		})

		// Filter out branches with errors and parse the details into a map
		const branchesDetailsMap = new Map<string, string>() // key: branch name - value: commits

		for (let i = 0; i < branchesDetailsResults.length; i++) {
			const detailResponse = branchesDetailsResults[i]
			const branchName = branches[i]

			if (detailResponse?.error) {
				// logger.warn(
				// 	`Error getting details for branch ${branchName}: ${detailResponse.error}`
				// )
				continue
			}

			if (detailResponse?.detail) {
				// biome-ignore lint/style/noNonNullAssertion: Branch name exists
				branchesDetailsMap.set(branchName!, detailResponse.detail.trim())
			}
		}

		if (branchesDetailsMap.size === 0) {
			// logger.warn(`No valid branch details found for ${repositoryPath}`)
			continue
		}

		// Process branch data using functions
		const processedBranches = processBranchData(branches, branchesDetailsMap)

		if (processedBranches.length === 0) {
			// logger.warn(`No valid processed branches found for ${repositoryPath}`)
			continue
		}

		const result = {
			repositoryPath,
			projectName,
			branches: processedBranches,
		}

		allResults.push(result)
	}

	return {
		repositories: allResults,
		user,
	}
}
