import { createStep } from '@mastra/core/workflows'
import z from 'zod'
import { logger } from '@/lib/logger'
import { userIdentifierSchema } from '@/lib/user'
import { getDetailsFromBranches } from '@/mastra/agents/git-analysis/tools/get-details-from-branches.tool'
import { getRepositoryName } from '@/mastra/agents/git-analysis/tools/get-repository-name.tool'
import { getWorkedBranches } from '@/mastra/agents/git-analysis/tools/get-worked-branches.tool'
import { processBranchData } from '@/mastra/agents/git-analysis/tools/process-branch-data.tool'

// Schema for Git Analysis output (single repository)
export const gitAnalysisSchema = z.object({
	projectName: z.string(),
	branches: z.array(
		z.object({
			branchName: z.string(),
			cardNumber: z.string(),
			commitMessages: z.array(z.string()),
		})
	),
})

// Schema for aggregated multi-repository Git Analysis output
export const aggregatedGitAnalysisSchema = z.object({
	repositories: z.array(
		z.object({
			repositoryPath: z.string(),
			projectName: z.string(),
			branches: z.array(
				z.object({
					branchName: z.string(),
					cardNumber: z.string(),
					commitMessages: z.array(z.string()),
				})
			),
		})
	),
})

// Step 2: Multi-Repository Git Analysis
export const gitAnalysisStep = createStep({
	id: 'git-analysis',
	description: 'Analyze Git repositories to identify branches and changes',
	inputSchema: z.object({
		repositories: z.array(z.string()),
		user: userIdentifierSchema,
	}),
	outputSchema: aggregatedGitAnalysisSchema,
	execute: async ({ inputData, bail }) => {
		const { repositories, user } = inputData

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
			const repositoryUrlResponse = await getRepositoryName(repositoryPath)

			if (repositoryUrlResponse.error) {
				logger.error(
					`Failed to get repository URL for ${repositoryPath}: ${repositoryUrlResponse.error}`
				)
				continue
			}

			const projectName = repositoryUrlResponse.projectName

			// Get worked branches
			const { branches, error: branchesError } = await getWorkedBranches({
				authorEmail,
				authorName,
				repositoryPath,
			})

			logger.info(JSON.stringify(branches, null, 2))

			if (branchesError) {
				logger.error(
					`Failed to get worked branches for ${repositoryPath}: ${branchesError}`
				)
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
				const detail = branchesDetailsResults[i]
				const branchName = branches[i]

				if (detail?.error) {
					logger.warn(
						`Error getting details for branch ${branchName}: ${detail.error}`
					)
					continue
				}

				if (detail?.output.trim()) {
					// biome-ignore lint/style/noNonNullAssertion: Branch name exists
					branchesDetailsMap.set(branchName!, detail.output)
				}
			}

			if (branchesDetailsMap.size === 0) {
				logger.warn(`No valid branch details found for ${repositoryPath}`)
				continue
			}

			// Process branch data using functions
			const processedBranches = processBranchData(branches, branchesDetailsMap)

			if (processedBranches.length === 0) {
				logger.warn(`No valid processed branches found for ${repositoryPath}`)
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
		}
	},
})
