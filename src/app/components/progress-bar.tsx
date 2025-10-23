import { useTerminalDimensions } from '@opentui/react'
import { colors } from '../utils/types'

export function ProgressBar({
	current,
	total,
}: {
	current: number
	total: number
}) {
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
