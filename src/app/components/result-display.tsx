import { useTerminalDimensions } from '@opentui/react'
import { colors, type WorkflowState } from '../utils/types'

export function ResultDisplay({
	workflowState,
}: {
	workflowState: WorkflowState
}) {
	const { height } = useTerminalDimensions()
	const resultHeight = Math.max(8, Math.floor(height * 0.5))

	if (!workflowState.workflowResult) return null

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
				height: resultHeight + 6, // Account for header and separator
			}}
		>
			{/* Section header */}
			<box style={{ flexDirection: 'row', marginBottom: 1, marginTop: 1 }}>
				<text fg={colors.success}>▸ </text>
				<text fg={colors.text.primary}>WORKFLOW RESULT</text>
				{workflowState.resultSaved && (
					<text fg={colors.success} style={{ marginLeft: 'auto' }}>
						✓ Saved
					</text>
				)}
			</box>

			{/* Separator */}
			<box style={{ marginBottom: 1 }}>
				<text fg={colors.border}>{'─'.repeat(60)}</text>
			</box>

			{/* Scrollable result content */}
			<scrollbox
				style={{
					rootOptions: {
						backgroundColor: colors.background,
						height: resultHeight,
					},
					wrapperOptions: {
						backgroundColor: colors.background,
					},
					viewportOptions: {
						backgroundColor: colors.background,
					},
					contentOptions: {
						backgroundColor: colors.background,
					},
					scrollbarOptions: {
						showArrows: true,
						trackOptions: {
							foregroundColor: colors.success,
							backgroundColor: colors.secondary,
						},
					},
				}}
			>
				<box
					style={{
						flexDirection: 'column',
						backgroundColor: colors.background,
						padding: 1,
						borderStyle: 'single',
						borderColor: colors.border,
						width: '100%',
					}}
				>
					{workflowState.resultPath && (
						<box style={{ flexDirection: 'row', marginBottom: 1 }}>
							<text fg={colors.text.muted} style={{ width: 8 }}>
								File:{' '}
							</text>
							<text fg={colors.accent}>{workflowState.resultPath}</text>
						</box>
					)}
					<box style={{ flexDirection: 'column' }}>
						<text fg={colors.text.secondary}>
							{workflowState.workflowResult}
						</text>
					</box>
				</box>
			</scrollbox>
		</box>
	)
}
