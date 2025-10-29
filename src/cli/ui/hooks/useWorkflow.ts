import { $ } from 'bun'
import { useCallback, useRef } from 'react'
import { mcpClient } from '@/ai/lib/mcp'
import type { WorkflowStreamEvent } from '@/ai/lib/workflow-stream-event.type'
import { standupReportWorkflow } from '@/ai/workflows/standup-report/workflow'
import { useWorkflowStore } from '../store'

export function useWorkflow() {
	const {
		events,
		addEvent,
		setCurrentEvent,
		setIsRunning,
		setFinalResult,
		setSavedFilePath,
		reset,
	} = useWorkflowStore()

	const streamRef =
		useRef<ReturnType<typeof standupReportWorkflow.stream>>(null)

	const executeWorkflow = useCallback(async () => {
		try {
			reset()
			setIsRunning(true)

			streamRef.current = standupReportWorkflow.stream({
				repositoriesFolder: Bun.env.REPOSITORIES_FOLDER,
				user: {
					azureDevOpsEmail: Bun.env.AZURE_DEVOPS_USER_EMAIL,
					gitAuthorEmail: Bun.env.GIT_AUTHOR_EMAIL,
					gitAuthorName: Bun.env.GIT_AUTHOR_NAME,
				},
			})

			const stream = streamRef.current

			// Process events in real-time
			for await (const event of stream) {
				addEvent(event)
				setCurrentEvent(event)

				// Stop running if workflow completes or errors
				if (
					event.type === 'workflow-complete' ||
					event.type === 'workflow-error'
				) {
					setIsRunning(false)

					if (event.type === 'workflow-complete') {
						// Get final result
						const result = await stream.result
						if (result?.report) {
							setFinalResult(result.report)

							// Save report to file
							try {
								// Create standups directory if it doesn't exist
								await $`mkdir -p ./standups`

								// Generate filename with current date
								const fileName = `./standups/standup-${new Date()
									.toLocaleDateString('pt-BR')
									.replace(/\//g, '-')}.txt`

								// Write the report file
								await Bun.write(fileName, result.report)
								setSavedFilePath(fileName)
							} catch (writeError) {
								console.error('Failed to save report:', writeError)
							}
						}
					}
					break
				}
			}
		} catch (error) {
			console.error('Workflow execution failed:', error)
			setIsRunning(false)

			// Add error event
			const errorEvent: WorkflowStreamEvent = {
				type: 'workflow-error',
				executionId: 'error',
				from: 'workflow-execution',
				status: 'error',
				timestamp: new Date().toISOString(),
				error: String(error),
			}
			addEvent(errorEvent)
			setCurrentEvent(errorEvent)
		}
	}, [
		addEvent,
		setCurrentEvent,
		setIsRunning,
		setFinalResult,
		setSavedFilePath,
		reset,
	])

	const abortWorkflow = useCallback(async () => {
		if (streamRef.current) {
			try {
				streamRef.current.abort()
				await mcpClient.disconnect()
			} catch (error) {
				console.error('Failed to abort workflow:', error)
			}
		}
	}, [])

	return {
		executeWorkflow,
		abortWorkflow,
		events,
	}
}
