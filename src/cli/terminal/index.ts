import type { WorkflowStreamEvent } from '@/ai/lib/workflow-stream-event.type'
import { standupReportWorkflow } from '@/ai/workflows/standup-report/workflow'

// Função para formatar timestamps de forma elegante
const formatTime = (timestamp: string) => {
	const date = new Date(timestamp)
	return date.toLocaleTimeString('pt-BR', {
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit',
	})
}

// Função para criar separadores visuais
const createSeparator = (title: string) => {
	const length = 60
	const padding = Math.max(0, length - title.length - 4)
	const leftPad = Math.floor(padding / 2)
	const rightPad = padding - leftPad
	return `${'─'.repeat(leftPad)} ${title} ${'─'.repeat(rightPad)}`
}

// Função para exibir eventos de forma elegante
const displayEvent = (event: WorkflowStreamEvent) => {
	const time = formatTime(event.timestamp)

	switch (event.type) {
		case 'workflow-start':
			console.log(`\n🚀 ${createSeparator('WORKFLOW INICIADO')}`)
			console.log(`⏰ ${time} | Iniciando execução do workflow`)
			console.log(`🆔 ID: ${event.executionId}`)
			break

		case 'step-start':
			console.log(`\n🔄 ${createSeparator(`PASSO: ${event.from}`)}`)
			console.log(`⏰ ${time} | Executando passo: ${event.from}`)
			if (event.stepType) {
				console.log(`📋 Tipo: ${event.stepType}`)
			}
			break

		case 'step-complete':
			console.log(`\n✅ ${createSeparator('PASSO CONCLUÍDO')}`)
			console.log(`⏰ ${time} | Passo concluído: ${event.from}`)
			if (event.output) {
				console.log(`📤 Saída: ${JSON.stringify(event.output, null, 2)}`)
			}
			break

		case 'workflow-complete':
			console.log(`\n🎉 ${createSeparator('WORKFLOW CONCLUÍDO')}`)
			console.log(`⏰ ${time} | Workflow finalizado com sucesso`)
			break

		case 'workflow-error':
			console.log(`\n💥 ${createSeparator('ERRO NO WORKFLOW')}`)
			console.log(`⏰ ${time} | Workflow falhou`)
			if (event.output) {
				console.log(`🔍 Detalhes: ${event.output}`)
			}
			break

		default:
			console.log(`\n📝 ${createSeparator(`EVENTO: ${event.type}`)}`)
			console.log(`⏰ ${time} | ${event.from}`)
			if (event.metadata) {
				console.log(`📋 Metadados: ${JSON.stringify(event.metadata, null, 2)}`)
			}
			if (event.output) {
				console.log(`📤 Saída: ${JSON.stringify(event.output, null, 2)}`)
			}
	}

	console.log('─'.repeat(60))
}

;(async () => {
	console.log('\n🎯 Iniciando geração do relatório de standup...\n')

	const stream = standupReportWorkflow.stream({
		repositoriesFolder: Bun.env.REPOSITORIES_FOLDER,
		user: {
			azureDevOpsEmail: Bun.env.AZURE_DEVOPS_USER_EMAIL,
			gitAuthorEmail: Bun.env.GIT_AUTHOR_EMAIL,
			gitAuthorName: Bun.env.GIT_AUTHOR_NAME,
		},
	})

	// Processar eventos em tempo real
	for await (const event of stream) {
		displayEvent(event)
	}

	// Obter resultado final
	const result = await stream.result

	if (result) {
		const fileName = `./standups/standup-${new Date().toLocaleDateString('pt-BR').replace(/\//g, '-')}.txt`
		await Bun.write(fileName, result?.report)

		console.log(`\n🎊 ${createSeparator('RELATÓRIO GERADO')}`)
		console.log(`📄 Arquivo salvo em: ${fileName}`)
		console.log(`📊 Tamanho: ${result.report.length} caracteres`)
		console.log('─'.repeat(60))
	} else {
		console.log(`\n💔 ${createSeparator('FALHA NA GERAÇÃO')}`)
		console.log('❌ Nenhum relatório foi gerado')
		console.log('─'.repeat(60))
	}
})()
