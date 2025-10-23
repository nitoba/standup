import { createStep } from '@mastra/core'
import z from 'zod'
import { azureDevOpsAgent } from '@/mastra/agents/azure-devops.agent'
import { aggregatedGitAnalysisSchema } from './git-analysis.step'
import { repositoryDiscoveryStep } from './repository-discovery.step'

// Schema for Azure DevOps output
export const azureDevOpsSchema = z.object({
	workItems: z.array(
		z.object({
			cardNumber: z.string(),
			title: z.string().nullable(),
			status: z.string().nullable(),
			type: z.string().nullable(),
		})
	),
	pullRequests: z.array(
		z.object({
			branchName: z.string(),
			cardNumber: z.string(),
			prStatus: z.enum(['Open', 'Completed', 'Abandoned', 'None']),
			isMerged: z.boolean(),
		})
	),
})

// Step 3: Azure DevOps Query
export const azureDevOpsStep = createStep({
	id: 'azure-devops-query',
	description: 'Query Azure DevOps for work items and pull requests',
	inputSchema: aggregatedGitAnalysisSchema,
	outputSchema: azureDevOpsSchema,
	execute: async ({ inputData, getStepResult }) => {
		const { repositories } = inputData
		const discoveryData = getStepResult(repositoryDiscoveryStep)
		const user = discoveryData.user

		const projectNames = repositories.map((r) => r.projectName).join(', ')
		const allBranches = repositories.flatMap((repo) => repo.branches)
		const cardNumbers = allBranches.map((b) => b.cardNumber).join(', ')
		const branchNames = allBranches
			.map((b) => `refs/heads/${b.branchName}`)
			.join(', ')

		let userContext = ''
		if (user.azureDevOpsEmail) {
			userContext = `\nFiltre apenas work items atribuídos ao usuário: ${user.azureDevOpsEmail}`
		} else if (user.azureDevOpsDisplayName) {
			userContext = `\nFiltre apenas work items atribuídos ao usuário: ${user.azureDevOpsDisplayName}`
		} else if (user.azureDevOpsId) {
			userContext = `\nFiltre apenas work items atribuídos ao usuário com ID: ${user.azureDevOpsId}`
		}

		const requestMessage = `Consulte a Azure DevOps para os seguintes cards: ${cardNumbers}.${userContext}
			
			Também verifique se existem Pull Requests para as branches: ${branchNames} nos repositórios: ${projectNames}
			Retorne os detalhes dos work items e o status dos Pull Requests.`

		const response = await azureDevOpsAgent.generate(requestMessage, {
			output: azureDevOpsSchema,
			maxSteps: 1000,
		})

		return response.object
	},
})
