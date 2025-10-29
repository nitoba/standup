import { COLORS } from '../constants/colors'

interface HeaderProps {
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
			<text fg={COLORS.dim}>
				Status: {isRunning ? '🟢 Running' : '⚪ Idle'}
			</text>
		</box>
	)
}
