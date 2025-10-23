import { createStep } from '@mastra/core/workflows'
import z from 'zod'
import { reportFormatterAgent } from '@/mastra/agents/report-formatter.agent'
import { gitAnalysisStep } from './git-analysis.step'
import { statusDeterminationSchema } from './status-determination.step'

// Step 5: Format the final report

// Create a step to merge the reports from different paths
export const reportFormattingStep = createStep({
	id: 'report-formatting',
	description: 'Format the final standup report',
	inputSchema: z.union([
		statusDeterminationSchema,
		z.object({ report: z.string() }),
	]),
	outputSchema: z.object({
		report: z.string(),
	}),
	execute: async ({ inputData, getStepResult }) => {
		// If the input already has a report (from noResultsHandlerStep), return it directly
		if ('report' in inputData) {
			return { report: inputData.report }
		}

		// Otherwise, format the report using the status determination data
		const gitData = getStepResult(gitAnalysisStep)
		const statusData = inputData

		const currentDate = new Date()
		const dayOfWeek = currentDate.toLocaleDateString('pt-BR', {
			weekday: 'long',
		})
		const formattedDate = currentDate.toLocaleDateString('pt-BR')

		// Use gitCheckData.repositories to handle both cases (with and without results)
		const projectNames = gitData.repositories
			.map((repo) => repo.projectName)
			.filter((name, index, self) => self.indexOf(name) === index)
			.join(', ')

		const consolidatedData = JSON.stringify(
			{
				projects: projectNames || 'Nenhum projeto',
				currentDate: formattedDate,
				dayOfWeek,
				tasks: statusData.tasks,
			},
			null,
			2
		)

		const response = await reportFormatterAgent.generate(
			`Formate o seguinte relatório de standup para Discord:

${consolidatedData}

Use o formato especificado nas suas instruções.`.trim()
		)

		return {
			report: response.text,
		}
	},
})
