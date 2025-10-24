import { colors } from '../utils/types'

export function StatusBadge({ status }: { status: string }) {
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
