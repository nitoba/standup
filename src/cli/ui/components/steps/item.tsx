import { formatDuration, formatStepName } from '../../utils/formatters'
import { colors, type WorkflowStep } from '../../utils/types'
import { Spinner } from '../spinner'

export function StepListItem({
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
