import { formatDuration } from '../utils/formatters'
import { colors, type WorkflowState } from '../utils/types'
import { StatusBadge } from './status-badge'

export function Header({ workflowState }: { workflowState: WorkflowState }) {
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
				{workflowState.totalDuration && (
					<box style={{ flexDirection: 'row' }}>
						<text fg={colors.warning}>⏱ </text>
						<text fg={colors.text.secondary}>
							{formatDuration(workflowState.totalDuration)}
						</text>
					</box>
				)}

				{workflowState.status === 'idle' && (
					<text fg={colors.text.muted}>Initializing...</text>
				)}
			</box>
		</box>
	)
}
