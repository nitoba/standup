import { createStep } from '@mastra/core/workflows'
import z from 'zod'
import { statusDeterminationAgent } from '@/ai/agents/status-determination.agent'
import { azureDevOpsSchema } from './azure-devops.step'
import { aggregatedGitAnalysisSchema } from './git-analysis.step'

const consolidatedDataSchema = z.object({
	gitData: aggregatedGitAnalysisSchema.optional(),
	azureData: azureDevOpsSchema.optional(),
	tasksToAnalyze: z.array(z.string()).optional(),
	gitActivity: aggregatedGitAnalysisSchema.optional(),
	pullRequestData: z
		.array(
			z.object({
				branchName: z.string(),
				cardNumber: z.string().nullable(),
				prStatus: z.enum(['Open', 'Completed', 'Abandoned', 'None']),
				isMerged: z.boolean(),
			})
		)
		.optional(),
})

// Schema for Status Determination output (sem alterações)
export const statusDeterminationSchema = z.object({
	tasks: z.array(
		z.object({
			projectName: z.string(),
			cardNumber: z.string().nullable(),
			title: z.string(),
			finalStatus: z.enum(['Done', 'In Progress']),
			reasoning: z.string(),
			progressDetails: z.string().optional(),
		})
	),
})

// Step 4: Consolidate data and determine status
export const statusDeterminationStep = createStep({
	id: 'status-determination',
	description:
		'Determine the final status of each task by correlating Git and Azure DevOps data.',
	inputSchema: z.object({
		gitResult: aggregatedGitAnalysisSchema,
		azureData: azureDevOpsSchema,
	}),
	outputSchema: statusDeterminationSchema,
	execute: async ({ inputData }) => {
		const gitData = inputData.gitResult
		const azureData = inputData.azureData

		const hasWorkItems = azureData.workItems && azureData.workItems.length > 0

		// Extrai todos os cardNumbers unicos do Git para usar como fallback
		const cardNumbersFromGit = [
			...new Set(
				gitData.repositories
					.flatMap((repo) => repo.branches.map((branch) => branch.cardNumber))
					.filter((cn) => !!cn) // Filtra nulos ou vazios
			),
		]

		// Se não temos work items do Azure e nem cards mencionados no Git, não há o que fazer.
		if (!hasWorkItems && cardNumbersFromGit.length === 0) {
			return { tasks: [] }
		}

		let consolidatedData: z.infer<typeof consolidatedDataSchema>
		let agentInstruction = ''

		if (hasWorkItems) {
			// Cenário 1 (Ideal): Temos Work Items do Azure. A tarefa é CORRELACIONAR.
			consolidatedData = { gitData, azureData }
			agentInstruction = `Sua tarefa é determinar o status de cada work item do Azure DevOps (em 'azureData') usando a atividade do Git (em 'gitData') como evidência.

**Regras de Decisão:**
1.  **Correlação:** Associe os branches e commits do 'gitData' aos 'workItems' usando o número do card.
2.  **Status 'In Progress':** Um item está "In Progress" se houver commits recentes em um branch associado a ele. A existência de um Pull Request ativo também indica progresso.
3.  **Status 'Done':** Um item é considerado "Done" se um Pull Request associado a ele foi 'completado' ou 'mesclado'.
4.  **Fundamentação:** Para cada item, forneça um raciocínio claro ('reasoning') para sua decisão.
`
		} else {
			// Cenário 2 (Fallback): Não temos Work Items, mas temos atividade no Git com cardNumbers. A tarefa é INFERIR.
			// Enviamos os dados do Git e PRs, e a lista de cards a serem analisados.
			consolidatedData = {
				tasksToAnalyze: cardNumbersFromGit,
				gitActivity: gitData,
				pullRequestData: azureData.pullRequests, // Os PRs são cruciais aqui
			}
			agentInstruction = `Não foram encontrados work items no Azure DevOps. Sua tarefa é INFERIR o status do trabalho baseado puramente na atividade do Git.

**Instruções:**
1.  **Foco:** Analise cada card listado em 'tasksToAnalyze'.
2.  **Evidência:** Use os dados de 'gitActivity' (branches, commits) e 'pullRequestData' para encontrar evidências de trabalho.
3.  **Status 'In Progress':** Se você encontrar um branch ou commits recentes mencionando o número do card, o status é "In Progress". Um PR ativo também indica isso.
4.  **Status 'Done':** Se você encontrar um Pull Request 'completado' ou 'mesclado' associado ao card, o status é "Done".
5.  **Título:** Como não temos o título do Azure, use o número do card como título (ex: "Card #12345").
6.  **Fundamentação:** Para cada card, explique como você chegou à conclusão do status.
`
		}

		const message = `${agentInstruction.trim()}\n\n**Dados para Análise:**\n\`\`\`json\n${JSON.stringify(
			consolidatedData,
			null,
			2
		)}\n\`\`\``

		const response = await statusDeterminationAgent.generate(message)

		// Try to extract JSON from text response
		const textResponse = response.text || ''
		const jsonMatch = textResponse.match(/```json\s*([\s\S]*?)\s*```/)

		if (jsonMatch?.[1]) {
			try {
				const parsedJson = JSON.parse(jsonMatch[1])
				return parsedJson
			} catch {
				throw new Error(
					'Status Determination Agent did not return valid structured output and JSON parsing failed'
				)
			}
		}

		return {
			tasks: [],
		}
	},
})
