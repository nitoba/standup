import { createWorkflowChain } from '@voltagent/core'
import z from 'zod'
import { reportFormatterAgent } from '@/ai/agents/formatter/formatter.agent'
import { hasGitResults } from '@/ai/agents/git-analysis/utils/git-results-check'
import type { GitAnalysisResult } from '@/ai/agents/git-analysis/utils/schemas/aggregated-git-analysis-schema'
import { userIdentifierSchema } from '../../lib/user'
import { executeAzureDevopsAnalysis } from './steps/azure-devops.step'
import { discoverRepositoriesStep } from './steps/discovery-repositories.step'
import { executeFormatReport } from './steps/format-report.step'
import { executeGitAnalysis } from './steps/git-analysis.step'
import { executeStatusDetermination } from './steps/status-determination.step'

export const standupReportWorkflow = createWorkflowChain({
	id: 'standup-report',
	name: 'Standup Report Workflow',
	purpose:
		'Generates a complete standup report by analyzing Git repositories, querying Azure DevOps, determining status, and formatting the output',
	input: z.object({
		user: userIdentifierSchema.optional(),
		repositoriesFolder: z.string().optional(),
	}),
	result: z.object({
		report: z.string(),
	}),
})

	.andThen({
		id: 'repository-discovery',
		purpose: 'Discover Git repositories from folder or use single repository',
		inputSchema: z.object({
			repositoriesFolder: z.string().optional(),
			user: userIdentifierSchema.optional(),
		}),
		outputSchema: z.object({
			repositories: z.array(z.string()),
			user: userIdentifierSchema,
		}),
		execute: async ({ data }) => {
			return discoverRepositoriesStep(data)
		},
	})
	.andThen({
		id: 'git-analysis',
		purpose: 'Analyze Git repositories to identify branches and changes',
		execute: async ({ data }) => {
			const { repositories, user } = data
			return executeGitAnalysis({ repositories, user })
		},
	})
	.andThen({
		id: 'if-there-are-git-results',
		execute: async ({ data }) => {
			const { repositories } = data
			const hasResults = hasGitResults({ repositories })

			return {
				hasResults,
				...data,
			}
		},
	})
	.andThen({
		id: 'execute-analysis',
		execute: async ({ data }) => {
			const { hasResults, repositories, user } = data

			if (hasResults) {
				const azureDataAnalysis = await executeAzureDevopsAnalysis({
					gitResult: { repositories },
					user,
				})

				const statusDetermination = await executeStatusDetermination({
					azureData: azureDataAnalysis.azureData,
					gitResult: { repositories },
				})

				return { statusData: statusDetermination }
			}

			// Get date information
			const currentDate = new Date()
			const dayOfWeek = currentDate.toLocaleDateString('pt-BR', {
				weekday: 'long',
			})
			const formattedDate = currentDate.toLocaleDateString('pt-BR')

			// Create a message for the report formatter agent
			const message =
				`Formate um relatório de standup para Discord com as seguintes informações:
		
Data: ${formattedDate}
Dia da semana: ${dayOfWeek}
Status: Nenhuma atividade de git encontrada para o usuário: ${user.gitAuthorName || user.gitAuthorEmail || 'usuário'}

Use o formato especificado nas suas instruções, mas inclua uma mensagem informando que não há atividades para relatar no momento.`.trim()

			const response = await reportFormatterAgent.generateText(message)

			return {
				report: response.text,
			}
		},
	})
	.andThen({
		id: 'report-formatting',
		purpose:
			'Format the final standup report based on available data (tasks or commits)',
		execute: async ({ data, getStepData }) => {
			if ('report' in data) {
				return { report: data.report }
			}

			const gitResult = getStepData('git-analysis')?.output as GitAnalysisResult

			const report = await executeFormatReport({
				gitResult,
				statusData: data.statusData,
			})

			return { report }
		},
	})
