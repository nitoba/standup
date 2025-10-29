import { COLORS } from '../constants/colors'

interface ProgressBarProps {
	progress: number
	width?: number
}

export function ProgressBar({ progress, width = 40 }: ProgressBarProps) {
	const filledWidth = Math.floor((progress / 100) * width)
	const emptyWidth = width - filledWidth

	return (
		<box flexDirection="row">
			<text fg={COLORS.success}>{'█'.repeat(filledWidth)}</text>
			<text fg={COLORS.dim}>{'░'.repeat(emptyWidth)}</text>
			<text fg={COLORS.text}> {Math.round(progress)}%</text>
		</box>
	)
}
