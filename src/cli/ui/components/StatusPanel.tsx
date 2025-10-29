import type { WorkflowStreamEvent } from '@/ai/lib/workflow-stream-event.type'
import { COLORS, STATUS_COLORS } from '../constants/colors'
import { formatTime, getEventIcon, getStepTypeIcon } from '../utils/format'
import { ProgressBar } from './ProgressBar'

interface StatusPanelProps {
	currentEvent?: WorkflowStreamEvent
	totalSteps: number
	completedSteps: number
}

export function StatusPanel({
	currentEvent,
	totalSteps,
	completedSteps,
}: StatusPanelProps) {
	const progress = totalSteps > 0 ? (completedSteps / totalSteps) * 100 : 0

	return (
		<box
			title="📊 Workflow Status"
			border
			borderStyle="single"
			style={{
				backgroundColor: COLORS.surface,
				padding: 1,
			}}
		>
			{currentEvent ? (
				<box flexDirection="column">
					<box flexDirection="row" justifyContent="space-between">
						<text fg={COLORS.text}>
							<strong>
								{getEventIcon(currentEvent.type)} {currentEvent.from}
							</strong>
						</text>
						<text fg={STATUS_COLORS[currentEvent.status]}>
							{currentEvent.status.toUpperCase()}
						</text>
					</box>

					{currentEvent.stepType && (
						<text fg={COLORS.dim}>
							{getStepTypeIcon(currentEvent.stepType)} {currentEvent.stepType}
						</text>
					)}

					<text fg={COLORS.dim}>
						Execution ID: {currentEvent.executionId.slice(-8)}
					</text>
				</box>
			) : (
				<text fg={COLORS.dim}>Aguardando início do workflow...</text>
			)}

			<box>
				<text fg={COLORS.text}>Progress: </text>
				<ProgressBar progress={progress} />
			</box>

			<box flexDirection="row" justifyContent="space-between">
				<text fg={COLORS.text}>
					Steps: {completedSteps}/{totalSteps}
				</text>
				<text fg={COLORS.dim}>
					{currentEvent ? formatTime(currentEvent.timestamp) : '--:--:--'}
				</text>
			</box>
		</box>
	)
}
