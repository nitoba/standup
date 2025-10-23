import { createStep } from '@mastra/core/workflows'
import z from 'zod'
import { reportFormatterAgent } from '@/mastra/agents/report-formatter.agent'
import { gitAnalysisStep } from './git-analysis.step'
import { statusDeterminationSchema } from './status-determination.step'

type ConsolidateData = {
	projects: string
	currentDate: string
	dayOfWeek: string
	tasks?: z.infer<typeof statusDeterminationSchema>['tasks']
	commitSummaries?: string[]
}
// Step 5: Format the final report
export const reportFormattingStep = createStep({
	id: 'report-formatting',
	description:
		'Format the final standup report based on available data (tasks or commits)',
	inputSchema: z.union([
		statusDeterminationSchema,
		z.object({ report: z.string() }),
	]),
	outputSchema: z.object({
		report: z.string(),
	}),
	execute: async ({ inputData, getStepResult }) => {
		// Se a entrada já é um relatório formatado (do noResultsHandlerStep), retorne diretamente.
		if ('report' in inputData) {
			return { report: inputData.report }
		}

		// Caso contrário, vamos formatar o relatório com base nos dados disponíveis.
		const gitData = getStepResult(gitAnalysisStep)
		const statusData = inputData // Vem do statusDeterminationStep

		const currentDate = new Date()
		const dayOfWeek = currentDate.toLocaleDateString('pt-BR', {
			weekday: 'long',
		})
		const formattedDate = currentDate.toLocaleDateString('pt-BR')

		// Consolida os nomes dos projetos, removendo duplicatas.
		const projectNames = [
			...new Set(gitData.repositories.map((repo) => repo.projectName)),
		].join(', ')

		let consolidatedData: ConsolidateData
		let agentInstruction = ''

		// **LÓGICA PRINCIPAL: Decide a fonte de dados para o relatório**
		const hasTasks = statusData.tasks && statusData.tasks.length > 0

		if (hasTasks) {
			// Cenário 1: Temos tarefas estruturadas do Azure DevOps. Esta é a fonte primária.
			consolidatedData = {
				projects: projectNames || 'Nenhum projeto',
				currentDate: formattedDate,
				dayOfWeek,
				tasks: statusData.tasks, // A lista de tarefas com status, PRs, etc.
			}
			agentInstruction =
				"Use a seção 'tasks' como fonte principal para descrever o andamento do trabalho. Detalhe o status de cada item e seus Pull Requests associados."
		} else {
			// Cenário 2: Não temos tarefas, mas podemos ter commits. Usaremos os commits.
			const allCommits = gitData.repositories.flatMap((repo) =>
				repo.branches.flatMap((branch) =>
					branch.commitMessages.map((commit) => commit)
				)
			)
			const uniqueCommitMessages = [...new Set(allCommits)]

			if (uniqueCommitMessages.length > 0) {
				consolidatedData = {
					projects: projectNames || 'Nenhum projeto',
					currentDate: formattedDate,
					dayOfWeek,
					// Em vez de 'tasks', enviamos um resumo dos commits.
					commitSummaries: uniqueCommitMessages,
				}
				agentInstruction =
					"Não foram encontradas tarefas formais. Sua tarefa é analisar a lista 'commitSummaries' e gerar um resumo das atividades realizadas, inferindo o trabalho a partir das mensagens de commit."
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

		const response = await reportFormatterAgent.generate(requestMessage)

		return {
			report: response.text,
		}
	},
})
