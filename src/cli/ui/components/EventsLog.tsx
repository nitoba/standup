import type { WorkflowStreamEvent } from '@/ai/lib/workflow-stream-event.type'
import { COLORS, STATUS_COLORS } from '../constants/colors'
import {
	formatError,
	formatOutput,
	formatTime,
	getEventIcon,
	getStepTypeIcon,
} from '../utils/format'

interface EventItemProps {
	event: WorkflowStreamEvent
	isActive: boolean
}

const EventItem = ({ event, isActive }: EventItemProps) => {
	const time = formatTime(event.timestamp)
	const icon = getEventIcon(event.type)
	const stepIcon = event.stepType ? getStepTypeIcon(event.stepType) : ''
	const color = STATUS_COLORS[event.status] || COLORS.text

	return (
		<box
			flexDirection="column"
			style={{
				backgroundColor: isActive ? COLORS.surface : 'transparent',
				padding: 1,
				marginBottom: 1,
			}}
		>
			<box flexDirection="row" justifyContent="space-between">
				<box flexDirection="row">
					<text>{icon}</text>
					<text> </text>
					<text fg={color}>
						<strong>{isActive && event.from}</strong>
						{!isActive && event.from}
					</text>
					{stepIcon && <text> {stepIcon}</text>}
				</box>
				<text fg={COLORS.dim}>{time}</text>
			</box>

			{event.stepType && <text fg={COLORS.dim}>Type: {event.stepType}</text>}

			{event.output && (
				<box flexDirection="column">
					<text fg={COLORS.info}>Output:</text>
					{formatOutput(event.output).map((line, index) => (
						<text key={index} fg={COLORS.info} style={{ marginLeft: 2 }}>
							{line}
						</text>
					))}
				</box>
			)}

			{event.error && (
				<box flexDirection="column">
					{formatError(event.error).map((line, index) => (
						<text
							key={index}
							fg={COLORS.error}
							style={{ marginLeft: index === 0 ? 0 : 2 }}
						>
							{line}
						</text>
					))}
				</box>
			)}
		</box>
	)
}

interface EventsLogProps {
	events: WorkflowStreamEvent[]
	currentEvent?: WorkflowStreamEvent
}

export function EventsLog({ events, currentEvent }: EventsLogProps) {
	return (
		<box
			title="📋 Workflow Events"
			border
			borderStyle="single"
			style={{
				flexGrow: 1,
				backgroundColor: COLORS.surface,
				padding: 1,
				minHeight: 8,
			}}
		>
			<scrollbox
				style={{
					width: '100%',
					height: '100%',
					backgroundColor: 'transparent',
				}}
			>
				{events.length > 0 ? (
					events.map((event) => (
						<EventItem
							event={event}
							isActive={
								currentEvent?.executionId === event.executionId &&
								currentEvent?.timestamp === event.timestamp
							}
						/>
					))
				) : (
					<text fg={COLORS.dim}>
						Nenhum evento registrado. Inicie o workflow para ver o progresso.
					</text>
				)}
			</scrollbox>
		</box>
	)
}
