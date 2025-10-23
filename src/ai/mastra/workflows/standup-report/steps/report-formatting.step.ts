import { createStep } from '@mastra/core/workflows'
import z from 'zod'
import { reportFormatterAgent } from '@/mastra/agents/report-formatter.agent'
import { gitAnalysisStep } from './git-analysis.step'
import {
	statusDeterminationSchema,
	statusDeterminationStep,
} from './status-determination.step'

// Step 5: Format the final report
export const reportFormattingStep = createStep({
	id: 'report-formatting',
	description: 'Format the final standup report',
	inputSchema: statusDeterminationSchema,
	outputSchema: z.object({
		report: z.string(),
	}),
	execute: async ({ getStepResult }) => {
		const gitData = getStepResult(gitAnalysisStep)
		const statusData = getStepResult(statusDeterminationStep)

		const currentDate = new Date()
		const dayOfWeek = currentDate.toLocaleDateString('pt-BR', {
			weekday: 'long',
		})
		const formattedDate = currentDate.toLocaleDateString('pt-BR')

		const projectNames = gitData.repositories
			.map((repo) => repo.projectName)
			.filter((name, index, self) => self.indexOf(name) === index)
			.join(', ')

		const consolidatedData = JSON.stringify(
			{
				projects: projectNames,
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

Use o formato especificado nas suas instruções.`
		)

		return {
			report: response.text,
		}
	},
})
