import { createStep } from '@mastra/core'
import z from 'zod'
import { azureDevOpsAgent } from '@/ai/agents/azure-devops.agent'
import { userIdentifierSchema } from '@/ai/lib/user'
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
				`- **Pull Requests**: Verifique a existência e o status de Pull Requests para as branches: ${branchNames} nos repositórios: ${projectNames}.`
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
			userContext = `\n\nPara Work Items, considere os itens atribuídos a "${userName}". Para Pull Requests, considere os criados por "${userName}".`
		}

		// 4. Monta a mensagem final para o agente
		const requestMessage = `Olá! Por favor, consulte o Azure DevOps para obter as seguintes informações:\n\n${requestParts.join(
			'\n'
		)}${userContext}\n\nRetorne os detalhes dos work items e o status dos Pull Requests encontrados.`

		const response = await azureDevOpsAgent.generate(requestMessage, {
			maxSteps: 1000,
		})

		// Try to extract JSON from text response
		const textResponse = response.text || ''

		const jsonMatch = textResponse.match(/```json\s*([\s\S]*?)\s*```/)

		if (jsonMatch?.[1]) {
			try {
				const parsedJson = JSON.parse(jsonMatch[1])
				return {
					azureData: parsedJson,
					gitResult,
				}
			} catch {
				throw new Error(
					'Status Determination Agent did not return valid structured output and JSON parsing failed'
				)
			}
		}

		return {
			azureData: response.text as unknown as z.infer<typeof azureDevOpsSchema>,
			gitResult,
		}
	},
})
