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
			flexDirection="row"
			justifyContent="space-between"
			gap={1}
			style={{
				backgroundColor: COLORS.surface,
				padding: 1,
			}}
		>
			{currentEvent ? (
				<box flexDirection="row" gap={2}>
					{currentEvent.stepType && (
						<box flexDirection="row" gap={1}>
							<text fg={COLORS.dim}>
								{getStepTypeIcon(currentEvent.stepType)}
							</text>
							<text fg={COLORS.dim}>{currentEvent.stepType}</text>
						</box>
					)}
					<box flexDirection="row" gap={1} justifyContent="space-between">
						<text fg={COLORS.text}>
							{getEventIcon(currentEvent.type)} {currentEvent.from}
						</text>
						<text fg={STATUS_COLORS[currentEvent.status]}>
							{currentEvent.status.toUpperCase()}
						</text>
					</box>
				</box>
			) : (
				<text fg={COLORS.dim}>Aguardando início do workflow...</text>
			)}

			<box gap={2} flexDirection="row">
				<text fg={COLORS.text}>Progress: </text>
				<ProgressBar progress={progress} />
			</box>

			<box flexDirection="row" justifyContent="space-between" gap={2}>
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
