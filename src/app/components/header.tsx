import { formatDuration } from '../utils/formatters'
import { colors, type WorkflowState } from '../utils/types'
import { ProgressBar } from './progress-bar'
import { StatusBadge } from './status-badge'

export function Header({ workflowState }: { workflowState: WorkflowState }) {
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
