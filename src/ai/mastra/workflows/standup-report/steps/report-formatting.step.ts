import { createStep } from '@mastra/core/workflows'
import z from 'zod'
import { logger } from '@/lib/logger'
import { reportFormatterAgent } from '@/mastra/agents/report-formatter.agent'
import { gitAnalysisStep } from './git-analysis.step'
import { statusDeterminationSchema } from './status-determination.step'

type ProjectData = {
	projectName: string
	tasks?: z.infer<typeof statusDeterminationSchema>['tasks']
	commitSummaries?: string[]
}

type ConsolidateData = {
	currentDate: string
	dayOfWeek: string
	projects: ProjectData[]
}
// with-results-workflow
// Step 5: Format the final report
export const reportFormattingStep = createStep({
	id: 'report-formatting',
	description:
		'Format the final standup report based on available data (tasks or commits)',
	inputSchema: z.union([
		z.object({ 'with-results-workflow': statusDeterminationSchema }),
		z.object({ 'no-results-handler': z.object({ report: z.string() }) }),
	]),
	outputSchema: z.object({
		report: z.string(),
	}),
	execute: async ({ inputData, getStepResult }) => {
		// Se a entrada já é um relatório formatado (do noResultsHandlerStep), retorne diretamente.
		if ('no-results-handler' in inputData) {
			if (inputData['no-results-handler'].report) {
				return { report: inputData['no-results-handler'].report }
			}

			return { report: '' }
		}

		// Caso contrário, vamos formatar o relatório com base nos dados disponíveis.
		const gitData = getStepResult(gitAnalysisStep)
		const statusData = inputData['with-results-workflow'] // Vem do statusDeterminationStep

		const currentDate = new Date()
		const dayOfWeek = currentDate.toLocaleDateString('pt-BR', {
			weekday: 'long',
		})
		const formattedDate = currentDate.toLocaleDateString('pt-BR')

		let consolidatedData: ConsolidateData
		let agentInstruction = ''

		// **LÓGICA PRINCIPAL: Decide a fonte de dados para o relatório**
		const hasTasks = statusData.tasks && statusData.tasks.length > 0

		if (hasTasks) {
			// Cenário 1: Temos tarefas estruturadas do Azure DevOps. Esta é a fonte primária.
			const projectsData: ProjectData[] = gitData.repositories.map((repo) => ({
				projectName: repo.projectName,
				tasks: statusData.tasks, // A lista de tarefas com status, PRs, etc.
			}))

			consolidatedData = {
				currentDate: formattedDate,
				dayOfWeek,
				projects: projectsData,
			}
			agentInstruction =
				"Use a seção 'tasks' de cada projeto como fonte principal para descrever o andamento do trabalho. Detalhe o status de cada item e seus Pull Requests associados, organizando por projeto."
		} else {
			// Cenário 2: Não temos tarefas, mas podemos ter commits. Usaremos os commits.
			const projectsData: ProjectData[] = gitData.repositories
				.map((repo) => {
					const allCommits = repo.branches.flatMap((branch) =>
						branch.commitMessages.map((commit) => commit)
					)
					const uniqueCommitMessages = [...new Set(allCommits)]

					return {
						projectName: repo.projectName,
						commitSummaries: uniqueCommitMessages,
					}
				})
				.filter(
					(project) =>
						project.commitSummaries && project.commitSummaries.length > 0
				)

			if (projectsData.length > 0) {
				consolidatedData = {
					currentDate: formattedDate,
					dayOfWeek,
					projects: projectsData,
				}
				agentInstruction =
					"Não foram encontradas tarefas formais. Sua tarefa é analisar a lista 'commitSummaries' de cada projeto e gerar um resumo das atividades realizadas, inferindo o trabalho a partir das mensagens de commit, organizando por projeto."
			} else {
				// Cenário 3: Não há tarefas nem commits. Isso significa que não houve atividade detectável.
				// Podemos retornar um relatório padrão sem chamar o agente.
				return {
					report: `**Relatório de Stand-up - ${formattedDate} (${dayOfWeek})**\n\nNenhuma atividade de commit ou tarefa foi detectada nos repositórios analisados.`,
				}
			}
		}

		// **PROMPT APRIMORADO PARA O AGENTE**
		const requestMessage = `
Formate um relatório de stand-up para ser enviado no Discord com base nos dados JSON abaixo.
O relatório deve ser claro, conciso e usar markdown (negrito, listas).

**Instrução Específica:** ${agentInstruction}

**Dados:**
\`\`\`json
${JSON.stringify(consolidatedData, null, 2)}
\`\`\`
`.trim()

		logger.info(requestMessage)

		const response = await reportFormatterAgent.generate(requestMessage)

		return {
			report: response.text,
		}
	},
})
