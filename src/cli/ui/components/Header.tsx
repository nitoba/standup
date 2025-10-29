import { COLORS } from '../constants/colors'

type HeaderProps = {
	isRunning: boolean
}

export function Header({ isRunning }: HeaderProps) {
	return (
		<box
			title="🎯 Standup Report Generator | AI-Powered"
			padding={1}
			backgroundColor={COLORS.surface}
			border
			borderStyle="double"
		>
			<box flexDirection="row" gap={1}>
				<text fg={COLORS.dim}>Status</text>
				{isRunning ? (
					<text fg={COLORS.success}>🟢 Running</text>
				) : (
					<text fg={COLORS.dim}>⚪ Idle</text>
				)}
			</box>
		</box>
	)
}
