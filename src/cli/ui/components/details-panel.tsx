import { formatDuration, formatStepName } from '../utils/formatters'
import { colors, type WorkflowState } from '../utils/types'

export function DetailPanel({
	workflowState,
}: {
	workflowState: WorkflowState
}) {
	const selectedStep = workflowState.steps[workflowState.selectedStepIndex]

	if (!selectedStep) return null

	const statusConfig: Record<string, { color: string; bg: string }> = {
		pending: { color: colors.text.muted, bg: colors.secondary },
		running: { color: colors.accent, bg: colors.secondary },
		success: { color: colors.success, bg: colors.secondary },
		error: { color: colors.error, bg: colors.secondary },
	}

	const config = statusConfig[selectedStep.status] ?? statusConfig.pending

	return (
		<box
			style={{
				flexDirection: 'column',
				paddingLeft: 2,
				paddingRight: 2,
				paddingBottom: 1,
				backgroundColor: colors.secondary,
				borderStyle: 'single',
				borderColor: colors.border,
			}}
		>
			{/* Section header */}
			<box style={{ flexDirection: 'row', marginBottom: 1, marginTop: 1 }}>
				<text fg={colors.warning}>▸ </text>
				<text fg={colors.text.primary}>STEP DETAILS</text>
			</box>

			{/* Separator */}
			<box style={{ marginBottom: 1 }}>
				<text fg={colors.border}>{'─'.repeat(60)}</text>
			</box>

			{/* Details */}
			<box
				style={{
					flexDirection: 'column',
					backgroundColor: colors.background,
					padding: 1,
					borderStyle: 'single',
					borderColor: colors.border,
				}}
			>
				<box style={{ flexDirection: 'row', marginBottom: 1 }}>
					<text fg={colors.text.muted} style={{ width: 8 }}>
						Name:{' '}
					</text>
					<text fg={colors.text.primary}>
						{formatStepName(selectedStep.id)}
					</text>
				</box>

				<box style={{ flexDirection: 'row', marginBottom: 1 }}>
					<text fg={colors.text.muted} style={{ width: 8 }}>
						Status:{' '}
					</text>
					<box
						style={{
							backgroundColor: config!.bg,
							borderStyle: 'single',
							paddingLeft: 1,
							paddingRight: 1,
						}}
					>
						<text fg={config!.color}>{selectedStep.status.toUpperCase()}</text>
					</box>
				</box>

				{selectedStep.duration ? (
					<box style={{ flexDirection: 'row', marginBottom: 1 }}>
						<text fg={colors.text.muted} style={{ width: 8 }}>
							Duration:{' '}
						</text>
						<text fg={colors.warning}>
							{formatDuration(selectedStep.duration)}
						</text>
					</box>
				) : null}

				{selectedStep.error && selectedStep.status === 'error' ? (
					<box style={{ flexDirection: 'column', marginTop: 1 }}>
						<box style={{ flexDirection: 'row', marginBottom: 1 }}>
							<text fg={colors.error}>⚠ ERROR DETAILS</text>
						</box>
						<scrollbox
							style={{
								rootOptions: {
									backgroundColor: colors.secondary,
									height: 10,
								},
								wrapperOptions: {
									backgroundColor: colors.secondary,
								},
								viewportOptions: {
									backgroundColor: colors.secondary,
								},
								contentOptions: {
									backgroundColor: colors.secondary,
								},
								scrollbarOptions: {
									showArrows: true,
									trackOptions: {
										foregroundColor: colors.error,
										backgroundColor: colors.background,
									},
								},
							}}
						>
							<box
								style={{
									backgroundColor: colors.secondary,
									padding: 1,
									borderStyle: 'single',
									borderColor: colors.error,
									width: '100%',
								}}
							>
								<text fg={colors.text.secondary}>{selectedStep.error}</text>
							</box>
						</scrollbox>
					</box>
				) : null}
			</box>
		</box>
	)
}
