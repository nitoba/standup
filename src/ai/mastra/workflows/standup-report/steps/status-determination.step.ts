import { createStep } from '@mastra/core/workflows'
import z from 'zod'
import { logger } from '@/lib/logger'
import { statusDeterminationAgent } from '@/mastra/agents/status-determination.agent'
import { azureDevOpsSchema } from './azure-devops.step'
import { gitAnalysisStep } from './git-analysis.step'

// Schema for Status Determination output
export const statusDeterminationSchema = z.object({
	tasks: z.array(
		z.object({
			cardNumber: z.string(),
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
	description: 'Determine final status of each task',
	inputSchema: azureDevOpsSchema,
	outputSchema: statusDeterminationSchema,
	execute: async ({ getStepResult, inputData }) => {
		const gitData = getStepResult(gitAnalysisStep)
		const azureData = inputData

		azureData.workItems = azureData.workItems.filter((d) => d.title)

		const consolidatedData = JSON.stringify(
			{
				gitData,
				azureData,
			},
			null,
			2
		)

		const message =
			`Com base nos seguintes dados consolidados, determine o status final de cada tarefa:

${consolidatedData}

Aplique as regras de prioridade para determinar se cada tarefa está "Done" ou "In Progress".`.trim()

		logger.debug(message)

		const response = await statusDeterminationAgent.generate(message, {
			structuredOutput: { schema: statusDeterminationSchema },
		})

		if (!response.object) {
			throw new Error(
				'Status Determination Agent did not return structured output'
			)
		}

		return response.object
	},
})
