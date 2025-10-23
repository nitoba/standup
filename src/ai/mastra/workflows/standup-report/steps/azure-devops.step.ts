import { createStep } from '@mastra/core'
import z from 'zod'
import { userIdentifierSchema } from '@/lib/user'
import { azureDevOpsAgent } from '@/mastra/agents/azure-devops.agent'
import { aggregatedGitAnalysisSchema } from './git-analysis.step'

// Schema for Azure DevOps output
export const azureDevOpsSchema = z.object({
	workItems: z.array(
		z.object({
			cardNumber: z.string().nullable(),
			title: z.string().nullable(),
			status: z.string().nullable(),
			type: z.string().nullable(),
		})
	),
	pullRequests: z.array(
		z.object({
			branchName: z.string(),
			cardNumber: z.string().nullable(),
			prStatus: z.enum(['Open', 'Completed', 'Abandoned', 'None']),
			isMerged: z.boolean(),
		})
	),
})

// Step 3: Azure DevOps Query
export const azureDevOpsStep = createStep({
	id: 'azure-devops-query',
	description: 'Query Azure DevOps for work items and pull requests',
	inputSchema: z.object({
		gitResult: aggregatedGitAnalysisSchema,
		user: userIdentifierSchema,
	}),
	outputSchema: z.object({
		gitResult: aggregatedGitAnalysisSchema,
		azureData: azureDevOpsSchema,
	}),
	execute: async ({ inputData }) => {
		const { gitResult, user } = inputData

		const allBranches = gitResult.repositories.flatMap((repo) => repo.branches)

		// 1. Prepara a consulta de Work Items (somente se houver números de card)
		const cardNumbers = [
			...new Set(
				// Remove duplicatas
				allBranches
					.map((b) => b.cardNumber)
					.filter((cn) => !!cn && cn.trim() !== '') // Filtra nulos/vazios
			),
		]

		const requestParts = []

		if (cardNumbers.length > 0) {
			requestParts.push(
				`- **Work Items**: Busque os detalhes completos dos seguintes IDs: ${cardNumbers.join(', ')}.`
			)
		}

		// 2. Prepara a consulta de Pull Requests (somente se houver branches)
		if (allBranches.length > 0) {
			const projectNames = [
				...new Set(gitResult.repositories.map((r) => r.projectName)),
			].join(', ')
			const branchNames = allBranches
				.map((b) => `refs/heads/${b.branchName.replace('origin/', '')}`)
				.join(', ')
			requestParts.push(
				`- **Pull Requests**: Verifique a existência e o status de Pull Requests para as branches: ${branchNames} nos projetos: ${projectNames}.`
			)
		}

		// Se não há nada para consultar, retorna.
		if (requestParts.length === 0) {
			// Retorna um objeto vazio que satisfaça o schema de saída
			return { azureData: { workItems: [], pullRequests: [] }, gitResult }
		}

		// 3. Constrói o contexto do usuário para refinar a busca
		let userContext = ''
		const userName =
			user.azureDevOpsEmail || user.azureDevOpsDisplayName || user.azureDevOpsId
		if (userName) {
			userContext = `\n\nPara todas as buscas, aplique o seguinte filtro de usuário: "${userName}". Para Work Items, considere os itens atribuídos a ele. Para Pull Requests, considere os criados por ele.`
		}

		// 4. Monta a mensagem final para o agente
		const requestMessage = `Olá! Por favor, consulte o Azure DevOps para obter as seguintes informações:\n\n${requestParts.join(
			'\n'
		)}${userContext}\n\nRetorne os detalhes dos work items e o status dos Pull Requests encontrados.`

		// logger.info(requestMessage)

		const response = await azureDevOpsAgent.generate(requestMessage, {
			structuredOutput: {
				schema: azureDevOpsSchema,
			},
			maxSteps: 1000,
		})

		if (response.object) {
			return {
				azureData: response.object,
				gitResult: gitResult,
			}
		}

		return {
			azureData: response.text as unknown as z.infer<typeof azureDevOpsSchema>,
			gitResult: gitResult,
		}
	},
})
