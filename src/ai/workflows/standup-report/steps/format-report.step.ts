import { reportFormatterAgent } from '@/ai/agents/formatter/formatter.agent'
import type { GitAnalysisResult } from '@/ai/agents/git-analysis/utils/schemas/aggregated-git-analysis-schema'
import type { StatusDeterminationAnalysisResult } from '@/ai/agents/status-determination/schemas/status-determination-analysis-result'

type Input = {
	gitResult: GitAnalysisResult
	statusData: StatusDeterminationAnalysisResult
}

type ProjectData = {
	projectName: string
	tasks?: StatusDeterminationAnalysisResult['tasks']
	commitSummaries?: string[]
}

type ConsolidateData = {
	currentDate: string
	dayOfWeek: string
	projects: ProjectData[]
}

export async function executeFormatReport({ gitResult, statusData }: Input) {
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
		const projectsData: ProjectData[] = gitResult.repositories.map((repo) => ({
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
		const projectsData: ProjectData[] = gitResult.repositories
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
			return `**Relatório de Stand-up - ${formattedDate} (${dayOfWeek})**\n\nNenhuma atividade de commit ou tarefa foi detectada nos repositórios analisados.`
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

	const response = await reportFormatterAgent.generateText(requestMessage)

	return response.text
}
