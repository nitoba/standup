import { useKeyboard } from '@opentui/react'
import { useEffect, useState } from 'react'
import { mastra } from '../ai/mastra/index.js'
import { DetailPanel } from './components/details-panel.js'
import { Footer } from './components/footer.js'
import { Header } from './components/header.js'
import { ResultDisplay } from './components/result-display.js'
import { StepsList } from './components/steps/list.js'
import { colors, type WorkflowState } from './utils/types.js'

export function App() {
	const [workflowState, setWorkflowState] = useState<WorkflowState>({
		status: 'idle',
		steps: [],
		selectedStepIndex: 0,
	})

	// Enhanced keyboard navigation
	useKeyboard((key) => {
		if (key.name === 'up' || key.name === 'k') {
			setWorkflowState((prev) => ({
				...prev,
				selectedStepIndex: Math.max(0, prev.selectedStepIndex - 1),
			}))
		} else if (key.name === 'down' || key.name === 'j') {
			setWorkflowState((prev) => ({
				...prev,
				selectedStepIndex: Math.min(
					prev.steps.length - 1,
					prev.selectedStepIndex + 1
				),
			}))
		} else if (key.name === 'home') {
			setWorkflowState((prev) => ({
				...prev,
				selectedStepIndex: 0,
			}))
		} else if (key.name === 'end') {
			setWorkflowState((prev) => ({
				...prev,
				selectedStepIndex: Math.max(0, prev.steps.length - 1),
			}))
		} else if (key.name === 'q' || key.name === 'escape') {
			process.exit(0)
		}
	})

	useEffect(() => {
		const runWorkflow = async () => {
			const startTime = Date.now()
			const stepTimings = new Map<string, number>()

			try {
				setWorkflowState({
					status: 'running',
					steps: [],
					startTime: Date.now(),
					selectedStepIndex: 0,
				})

				const standupReportWorkflow = mastra.getWorkflow(
					'standupReportWorkflow'
				)
				const run = await standupReportWorkflow.createRunAsync()
				const stream = run.streamVNext({ inputData: {} })

				for await (const chunk of stream) {
					switch (chunk.type) {
						case 'workflow-start':
							setWorkflowState((prev) => ({
								...prev,
								status: 'running',
								startTime: Date.now(),
							}))
							break

						case 'workflow-step-start':
							if (chunk.payload?.id) {
								const stepId = chunk.payload.id
								stepTimings.set(stepId, Date.now())

								setWorkflowState((prev) => {
									const newSteps = [...prev.steps]
									newSteps.push({
										id: stepId,
										status: 'running',
										startTime: Date.now(),
									})
									return {
										...prev,
										steps: newSteps,
										selectedStepIndex: newSteps.length - 1,
									}
								})
							}
							break

						case 'workflow-step-result':
							if (chunk.payload?.id) {
								const stepId = chunk.payload.id
								const stepStartTime = stepTimings.get(stepId)
								const duration = stepStartTime
									? Date.now() - stepStartTime
									: undefined
								const status =
									chunk.payload.status === 'success' ? 'success' : 'error'

								// Capture error details if status is error
								const error =
									status === 'error'
										? (chunk.payload as any).error?.message ||
											(chunk.payload as any).error ||
											chunk.payload.output?.error ||
											JSON.stringify(chunk.payload, null, 2)
										: undefined

								setWorkflowState((prev) => {
									const newSteps = [...prev.steps]
									const stepIndex = newSteps.findIndex((s) => s.id === stepId)

									if (stepIndex !== -1 && newSteps[stepIndex]) {
										newSteps[stepIndex] = {
											id: newSteps[stepIndex].id,
											status,
											duration,
											startTime: newSteps[stepIndex].startTime,
											error,
										}
									}

									return { ...prev, steps: newSteps }
								})
							}
							break

						case 'workflow-finish': {
							const totalDuration = Date.now() - startTime
							const status =
								chunk.payload?.workflowStatus === 'success'
									? 'completed'
									: 'error'

							setWorkflowState((prev) => ({
								...prev,
								status,
								totalDuration,
							}))

							// Get the final result and save it
							const [streamStatus, workflowResult] = await Promise.all([
								stream.status,
								stream.result,
							])

							if (
								streamStatus === 'success' &&
								workflowResult &&
								workflowResult.status === 'success'
							) {
								const report = (workflowResult.result as { report?: string })
									?.report

								if (report) {
									// Create standups directory if it doesn't exist
									const fs = await import('node:fs/promises')
									try {
										await fs.mkdir('./standups', { recursive: true })
									} catch (error) {
										// Directory might already exist, ignore error
									}

									const fileName = `./standups/standup-${new Date().toLocaleDateString('pt-BR').replace(/\//g, '-')}.txt`
									await Bun.write(fileName, report)

									setWorkflowState((prev) => ({
										...prev,
										workflowResult: report,
										resultSaved: true,
										resultPath: fileName,
									}))
								} else {
									setWorkflowState((prev) => ({
										...prev,
										workflowResult: 'No report generated',
									}))
								}
							} else {
								setWorkflowState((prev) => ({
									...prev,
									workflowResult: `Workflow failed with status: ${streamStatus}`,
								}))
							}

							await new Promise((resolve) => setTimeout(resolve, 3000))
							break
						}
					}
				}
			} catch (error) {
				console.error('Error running workflow:', error)
				setWorkflowState((prev) => ({
					...prev,
					status: 'error',
					workflowResult: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
				}))
			}
		}

		runWorkflow()
	}, [])

	return (
		<box
			style={{
				flexDirection: 'column',
				flexGrow: 1,
				backgroundColor: colors.background,
			}}
		>
			<Header workflowState={workflowState} />
			{workflowState.workflowResult && workflowState.status === 'completed' ? (
				<ResultDisplay workflowState={workflowState} />
			) : (
				<>
					<StepsList workflowState={workflowState} />
					<DetailPanel workflowState={workflowState} />
				</>
			)}
			<Footer workflowState={workflowState} />
		</box>
	)
}
