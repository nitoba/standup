import 'dotenv/config'
import { render, useKeyboard, useTerminalDimensions } from '@opentui/react'
import { useEffect, useState } from 'react'
import { mastra } from '../ai/mastra/index.js'

interface WorkflowStep {
	id: string
	status: 'pending' | 'running' | 'success' | 'error'
	startTime?: number
	duration?: number
}

interface WorkflowState {
	status: 'idle' | 'running' | 'completed' | 'error'
	steps: WorkflowStep[]
	startTime?: number
	totalDuration?: number
	selectedStepIndex: number
	workflowResult?: string
	resultSaved?: boolean
	resultPath?: string
}

// Modern color palette
const colors = {
	background: '#0A0E1A',
	secondary: '#1A1F2E',
	accent: '#00D9FF',
	success: '#10B981',
	warning: '#F59E0B',
	error: '#EF4444',
	text: {
		primary: '#FFFFFF',
		secondary: '#E5E7EB',
		muted: '#9CA3AF',
		inverse: '#000000',
	},
	border: '#374151',
	highlight: '#1E293B',
}

function formatStepName(stepName: string): string {
	return stepName
		.split('-')
		.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
		.join(' ')
}

function formatDuration(ms: number): string {
	if (ms < 1000) return `${ms}ms`
	return `${(ms / 1000).toFixed(2)}s`
}

function Spinner({ size = 'medium' }: { size?: 'small' | 'medium' | 'large' }) {
	const [frame, setFrame] = useState(0)
	const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']

	useEffect(() => {
		const interval = setInterval(() => {
			setFrame((prev) => (prev + 1) % frames.length)
		}, 80)
		return () => clearInterval(interval)
	}, [])

	return <text fg={colors.accent}>{frames[frame]}</text>
}

function StatusBadge({ status }: { status: string }) {
	const statusConfig: Record<
		string,
		{ color: string; icon: string; bg: string }
	> = {
		idle: { color: colors.text.muted, icon: '○', bg: colors.secondary },
		running: { color: colors.accent, icon: '◉', bg: colors.secondary },
		completed: { color: colors.success, icon: '✓', bg: colors.secondary },
		error: { color: colors.error, icon: '✗', bg: colors.secondary },
	}

	const config = statusConfig[status] ?? statusConfig.idle

	return (
		<box
			style={{
				flexDirection: 'row',
				backgroundColor: config!.bg,
				borderColor: config!.color,
				borderStyle: 'rounded',
				paddingLeft: 1,
				paddingRight: 1,
			}}
		>
			<text fg={config!.color}>
				{config!.icon} {status.toUpperCase()}
			</text>
		</box>
	)
}

function ProgressBar({ current, total }: { current: number; total: number }) {
	const { width } = useTerminalDimensions()
	const barWidth = Math.min(50, Math.floor(width * 0.6))
	const progress = total > 0 ? current / total : 0
	const filled = Math.floor(progress * barWidth)
	const percentage = Math.floor(progress * 100)

	return (
		<box style={{ flexDirection: 'column', marginTop: 1, marginBottom: 1 }}>
			<box
				style={{
					flexDirection: 'row',
					marginBottom: 1,
					justifyContent: 'space-between',
				}}
			>
				<text fg={colors.text.muted}>Progress</text>
				<text fg={colors.accent}>
					{current}/{total} ({percentage}%)
				</text>
			</box>
			<box
				style={{
					flexDirection: 'row',
					backgroundColor: colors.secondary,
					height: 1,
					borderStyle: 'single',
					borderColor: colors.border,
				}}
			>
				<text fg={colors.accent}>{'█'.repeat(filled)}</text>
				<text fg={colors.text.muted}>{'░'.repeat(barWidth - filled)}</text>
			</box>
		</box>
	)
}

function StepListItem({
	step,
	index,
	isSelected,
}: {
	step: WorkflowStep
	index: number
	isSelected: boolean
}) {
	const statusConfig: Record<string, { color: string; icon: string }> = {
		pending: { color: colors.text.muted, icon: '○' },
		running: { color: colors.accent, icon: '◉' },
		success: { color: colors.success, icon: '✓' },
		error: { color: colors.error, icon: '✗' },
	}

	const config = statusConfig[step.status] ?? statusConfig.pending
	const bgColor = isSelected ? colors.highlight : 'transparent'
	const borderChar = isSelected ? '▶' : ' '

	return (
		<box
			style={{
				flexDirection: 'row',
				backgroundColor: bgColor,
				paddingTop: 1,
				paddingBottom: 1,
				paddingLeft: isSelected ? 2 : 1,
			}}
		>
			<text fg={colors.accent}>{borderChar}</text>
			<box
				style={{
					flexDirection: 'row',
					marginLeft: 1,
					flexGrow: 1,
				}}
			>
				<text fg={colors.text.muted} style={{ width: 3 }}>
					{(index + 1).toString().padStart(2, '0')}
				</text>
				<text fg={config!.color} style={{ width: 3, marginLeft: 1 }}>
					{config!.icon}
				</text>
				{step.status === 'running' ? (
					<box style={{ flexDirection: 'row', marginLeft: 1 }}>
						<Spinner size="small" />
						<text fg={colors.text.primary} style={{ marginLeft: 1 }}>
							{formatStepName(step.id)}
						</text>
					</box>
				) : (
					<text fg={colors.text.secondary} style={{ marginLeft: 1 }}>
						{formatStepName(step.id)}
					</text>
				)}
				{step.duration ? (
					<text fg={colors.text.muted} style={{ marginLeft: 'auto' }}>
						{formatDuration(step.duration)}
					</text>
				) : null}
			</box>
		</box>
	)
}

function Header({ workflowState }: { workflowState: WorkflowState }) {
	const completedSteps = workflowState.steps.filter(
		(s) => s.status === 'success'
	).length

	return (
		<box
			style={{
				flexDirection: 'column',
				paddingLeft: 2,
				paddingRight: 2,
				paddingTop: 1,
				paddingBottom: 1,
				backgroundColor: colors.secondary,
				borderStyle: 'single',
				borderColor: colors.border,
			}}
		>
			{/* Title with modern design */}
			<box
				style={{
					flexDirection: 'row',
					justifyContent: 'center',
					marginBottom: 1,
				}}
			>
				<ascii-font text={'STANDUP WORKFLOW RUNNER'} font={'tiny'} />
			</box>

			{/* Status and timing row */}
			<box
				style={{
					flexDirection: 'row',
					justifyContent: 'space-between',
					alignItems: 'center',
				}}
			>
				<StatusBadge status={workflowState.status} />
				{workflowState.totalDuration ? (
					<box style={{ flexDirection: 'row' }}>
						<text fg={colors.warning}>⏱ </text>
						<text fg={colors.text.secondary}>
							{formatDuration(workflowState.totalDuration)}
						</text>
					</box>
				) : (
					<text fg={colors.text.muted}>Initializing...</text>
				)}
			</box>

			{/* Progress bar */}
			{workflowState.steps.length > 0 ? (
				<ProgressBar
					current={completedSteps}
					total={workflowState.steps.length}
				/>
			) : null}
		</box>
	)
}

function StepsList({ workflowState }: { workflowState: WorkflowState }) {
	const { height } = useTerminalDimensions()

	// Calculate appropriate height for scrollbox (about 40% of terminal height)
	const scrollboxHeight = Math.max(8, Math.floor(height * 0.4))

	// Build step items manually to avoid key issues with OpenTUI
	const stepItems = []
	for (let i = 0; i < workflowState.steps.length; i++) {
		const step = workflowState.steps[i]
		if (step) {
			stepItems.push(
				<StepListItem
					step={step}
					index={i}
					isSelected={i === workflowState.selectedStepIndex}
				/>
			)
		}
	}

	return (
		<box
			style={{
				flexDirection: 'column',
				paddingLeft: 2,
				paddingRight: 2,
				height: scrollboxHeight + 6, // Account for header and separator
			}}
		>
			{/* Section header */}
			<box style={{ flexDirection: 'row', marginBottom: 1, marginTop: 1 }}>
				<text fg={colors.accent}>▸ </text>
				<text fg={colors.text.primary}>WORKFLOW STEPS</text>
				<text style={{ marginLeft: 'auto' }} fg={colors.text.muted}>
					{workflowState.steps.length} total
				</text>
			</box>

			{/* Separator */}
			<box style={{ marginBottom: 1 }}>
				<text fg={colors.border}>{'─'.repeat(60)}</text>
			</box>

			{/* Scrollable steps list with fixed height */}
			<scrollbox
				style={{
					rootOptions: {
						backgroundColor: colors.background,
						height: scrollboxHeight,
					},
					wrapperOptions: {
						backgroundColor: colors.background,
					},
					viewportOptions: {
						backgroundColor: colors.background,
					},
					contentOptions: {
						backgroundColor: colors.background,
					},
					scrollbarOptions: {
						showArrows: true,
						trackOptions: {
							foregroundColor: colors.accent,
							backgroundColor: colors.secondary,
						},
					},
				}}
				focused={true}
			>
				{workflowState.steps.length === 0 ? (
					<box
						style={{
							flexDirection: 'row',
							paddingTop: 3,
							paddingBottom: 3,
							justifyContent: 'center',
							width: '100%',
						}}
					>
						<Spinner />
						<text fg={colors.text.muted} style={{ marginLeft: 2 }}>
							Initializing workflow...
						</text>
					</box>
				) : (
					<box style={{ flexDirection: 'column', width: '100%' }}>
						{stepItems}
					</box>
				)}
			</scrollbox>
		</box>
	)
}

function DetailPanel({ workflowState }: { workflowState: WorkflowState }) {
	const selectedStep = workflowState.steps[workflowState.selectedStepIndex]

	if (!selectedStep) return null

	const statusConfig: Record<string, { color: string; bg: string }> = {
		pending: { color: colors.text.muted, bg: colors.secondary },
		running: { color: colors.accent, bg: colors.secondary },
		success: { color: colors.success, bg: colors.secondary },
		error: { color: colors.error, bg: colors.secondary },
	}

	const config = statusConfig[selectedStep.status] ?? statusConfig.pending

	return (
		<box
			style={{
				flexDirection: 'column',
				paddingLeft: 2,
				paddingRight: 2,
				paddingBottom: 1,
				backgroundColor: colors.secondary,
				borderStyle: 'single',
				borderColor: colors.border,
			}}
		>
			{/* Section header */}
			<box style={{ flexDirection: 'row', marginBottom: 1, marginTop: 1 }}>
				<text fg={colors.warning}>▸ </text>
				<text fg={colors.text.primary}>STEP DETAILS</text>
			</box>

			{/* Separator */}
			<box style={{ marginBottom: 1 }}>
				<text fg={colors.border}>{'─'.repeat(60)}</text>
			</box>

			{/* Details */}
			<box
				style={{
					flexDirection: 'column',
					backgroundColor: colors.background,
					padding: 1,
					borderStyle: 'single',
					borderColor: colors.border,
				}}
			>
				<box style={{ flexDirection: 'row', marginBottom: 1 }}>
					<text fg={colors.text.muted} style={{ width: 8 }}>
						Name:{' '}
					</text>
					<text fg={colors.text.primary}>
						{formatStepName(selectedStep.id)}
					</text>
				</box>

				<box style={{ flexDirection: 'row', marginBottom: 1 }}>
					<text fg={colors.text.muted} style={{ width: 8 }}>
						Status:{' '}
					</text>
					<box
						style={{
							backgroundColor: config!.bg,
							borderStyle: 'single',
							paddingLeft: 1,
							paddingRight: 1,
						}}
					>
						<text fg={config!.color}>{selectedStep.status.toUpperCase()}</text>
					</box>
				</box>

				{selectedStep.duration ? (
					<box style={{ flexDirection: 'row' }}>
						<text fg={colors.text.muted} style={{ width: 8 }}>
							Duration:{' '}
						</text>
						<text fg={colors.warning}>
							{formatDuration(selectedStep.duration)}
						</text>
					</box>
				) : null}
			</box>
		</box>
	)
}

function ResultDisplay({ workflowState }: { workflowState: WorkflowState }) {
	const { height } = useTerminalDimensions()
	const resultHeight = Math.max(8, Math.floor(height * 0.5))

	if (!workflowState.workflowResult) return null

	return (
		<box
			style={{
				flexDirection: 'column',
				paddingLeft: 2,
				paddingRight: 2,
				paddingBottom: 1,
				backgroundColor: colors.secondary,
				borderStyle: 'single',
				borderColor: colors.border,
				height: resultHeight + 6, // Account for header and separator
			}}
		>
			{/* Section header */}
			<box style={{ flexDirection: 'row', marginBottom: 1, marginTop: 1 }}>
				<text fg={colors.success}>▸ </text>
				<text fg={colors.text.primary}>WORKFLOW RESULT</text>
				{workflowState.resultSaved && (
					<text fg={colors.success} style={{ marginLeft: 'auto' }}>
						✓ Saved
					</text>
				)}
			</box>

			{/* Separator */}
			<box style={{ marginBottom: 1 }}>
				<text fg={colors.border}>{'─'.repeat(60)}</text>
			</box>

			{/* Scrollable result content */}
			<scrollbox
				style={{
					rootOptions: {
						backgroundColor: colors.background,
						height: resultHeight,
					},
					wrapperOptions: {
						backgroundColor: colors.background,
					},
					viewportOptions: {
						backgroundColor: colors.background,
					},
					contentOptions: {
						backgroundColor: colors.background,
					},
					scrollbarOptions: {
						showArrows: true,
						trackOptions: {
							foregroundColor: colors.success,
							backgroundColor: colors.secondary,
						},
					},
				}}
			>
				<box
					style={{
						flexDirection: 'column',
						backgroundColor: colors.background,
						padding: 1,
						borderStyle: 'single',
						borderColor: colors.border,
						width: '100%',
					}}
				>
					{workflowState.resultPath && (
						<box style={{ flexDirection: 'row', marginBottom: 1 }}>
							<text fg={colors.text.muted} style={{ width: 8 }}>
								File:{' '}
							</text>
							<text fg={colors.accent}>{workflowState.resultPath}</text>
						</box>
					)}
					<box style={{ flexDirection: 'column' }}>
						<text fg={colors.text.secondary}>
							{workflowState.workflowResult}
						</text>
					</box>
				</box>
			</scrollbox>
		</box>
	)
}

function Footer({ workflowState }: { workflowState: WorkflowState }) {
	const isResultShown = !!workflowState.workflowResult

	return (
		<box
			style={{
				flexDirection: 'row',
				paddingLeft: isResultShown ? 1 : 2,
				paddingRight: isResultShown ? 1 : 2,
				paddingTop: isResultShown ? 0 : 1,
				paddingBottom: isResultShown ? 0 : 1,
				backgroundColor: colors.secondary,
				borderStyle: isResultShown ? undefined : 'single',
				borderColor: colors.border,
				justifyContent: 'space-between',
			}}
		>
			<box style={{ flexDirection: 'row' }}>
				{isResultShown ? (
					<>
						<text fg={colors.text.muted}>Press</text>
						<text fg={colors.accent} style={{ marginLeft: 1 }}>
							Q
						</text>
						<text fg={colors.text.muted} style={{ marginLeft: 1 }}>
							to quit
						</text>
					</>
				) : (
					<>
						<text fg={colors.text.muted}>Navigate:</text>
						<text fg={colors.accent} style={{ marginLeft: 1 }}>
							↑/↓
						</text>
						<text fg={colors.text.muted} style={{ marginLeft: 1 }}>
							•
						</text>
						<text fg={colors.accent} style={{ marginLeft: 1 }}>
							Q
						</text>
						<text fg={colors.text.muted} style={{ marginLeft: 1 }}>
							Quit
						</text>
					</>
				)}
			</box>
			{!isResultShown && (
				<text fg={colors.text.muted}>
					{workflowState.resultSaved
						? `Report saved to ${workflowState.resultPath}`
						: 'Standup Workflow v1.0'}
				</text>
			)}
		</box>
	)
}

function App() {
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

								setWorkflowState((prev) => {
									const newSteps = [...prev.steps]
									const stepIndex = newSteps.findIndex((s) => s.id === stepId)

									if (stepIndex !== -1 && newSteps[stepIndex]) {
										newSteps[stepIndex] = {
											id: newSteps[stepIndex].id,
											status,
											duration,
											startTime: newSteps[stepIndex].startTime,
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
									const fs = await import('fs/promises')
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
			{workflowState.workflowResult ? (
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

render(<App />)
