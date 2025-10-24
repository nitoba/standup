import { mastra } from '../../ai/index.js'
import { renderWorkflowStream } from './workflow-console-renderer.js'

async function main() {
	try {
		const standupReportWorkflow = mastra.getWorkflow('standupReportWorkflow')

		const run = await standupReportWorkflow.createRunAsync()

		// Use streamVNext for real-time feedback
		const stream = run.streamVNext({ inputData: {} })

		// Render the workflow execution with visual feedback using React OpenTUI
		await renderWorkflowStream(stream as unknown as ReadableStream)

		// Get the final result from the stream properties
		const [status, workflowResult] = await Promise.all([
			stream.status,
			stream.result,
		])

		if (
			status === 'success' &&
			workflowResult &&
			workflowResult.status === 'success'
		) {
			const report = (workflowResult.result as { report?: string })?.report

			if (report) {
				const fileName = `./standups/standup-${new Date().toLocaleDateString('pt-BR').replace(/\//g, '-')}.txt`
				await Bun.write(fileName, report)

				console.log(`\n📄 Report saved to: ${fileName}`)
			} else {
				console.error('\n❌ No report generated')
			}
		} else {
			console.error(`\n❌ Workflow failed with status: ${status}`)
		}
	} catch (error) {
		console.error('\n❌ Error executing workflow:', error)
		throw error
	}
}

main()
