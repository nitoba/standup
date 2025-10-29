import { COLORS } from '../constants/colors'

export function Instructions() {
	return (
		<box
			style={{
				backgroundColor: COLORS.surface,
				marginTop: 1,
			}}
		>
			<text fg={COLORS.dim}>
				↑/k: Navigate up • ↓/j: Navigate down • Home/End: First/Last step •
				q/Esc: Exit • Workflow runs automatically
			</text>
		</box>
	)
}
