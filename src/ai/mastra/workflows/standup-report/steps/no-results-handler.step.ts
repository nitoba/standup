import { createStep } from '@mastra/core/workflows'
import z from 'zod'
import { userIdentifierSchema } from '@/lib/user'
import { reportFormatterAgent } from '@/mastra/agents/report-formatter.agent'
import { aggregatedGitAnalysisSchema } from './git-analysis.step'

// Schema for the no results handler output
export const noResultsHandlerSchema = z.object({
	report: z.string(),
})

// Step to handle the case when no git results are found
export const noResultsHandlerStep = createStep({
	id: 'no-results-handler',
	description:
		'Handle the case when no git results are found and format a report',
	inputSchema: z.object({
		gitResult: aggregatedGitAnalysisSchema,
		user: userIdentifierSchema,
	}),
	outputSchema: noResultsHandlerSchema,
	execute: async ({ inputData }) => {
		const user = inputData.user
		const repositories = inputData.gitResult.repositories

		// Get date information
		const currentDate = new Date()
		const dayOfWeek = currentDate.toLocaleDateString('pt-BR', {
			weekday: 'long',
		})
		const formattedDate = currentDate.toLocaleDateString('pt-BR')

		// Get project names from repositories even if they have no branches
		const projectNames =
			repositories
				.map((repo) => repo.projectName)
				.filter((name, index, self) => self.indexOf(name) === index)
				.join(', ') || 'Nenhum projeto'

		// Create a message for the report formatter agent
		const message =
			`Formate um relatório de standup para Discord com as seguintes informações:
		
Data: ${formattedDate}
Dia da semana: ${dayOfWeek}
Projetos: ${projectNames}
Status: Nenhuma atividade de git encontrada para o usuário: ${user.gitAuthorName || user.gitAuthorEmail || 'usuário'}

Use o formato especificado nas suas instruções, mas inclua uma mensagem informando que não há atividades para relatar no momento.`.trim()

		const response = await reportFormatterAgent.generate(message)

		return {
			report: response.text,
		}
	},
})
