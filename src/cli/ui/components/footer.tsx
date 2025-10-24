import { colors, type WorkflowState } from '../utils/types'

export function Footer({ workflowState }: { workflowState: WorkflowState }) {
	const isResultShown = !!workflowState.workflowResult

	return (
		<box
			style={{
				flexDirection: 'row',
				paddingLeft: isResultShown ? 1 : 2,
				paddingRight: isResultShown ? 1 : 2,
				paddingTop: isResultShown ? 0 : 1,
				paddingBottom: isResultShown ? 0 : 1,
				backgroundColor: colors.secondary,
				borderStyle: isResultShown ? undefined : 'single',
				borderColor: colors.border,
				justifyContent: 'space-between',
			}}
		>
			<box style={{ flexDirection: 'row' }}>
				{isResultShown ? (
					<>
						<text fg={colors.text.muted}>Press</text>
						<text fg={colors.accent} style={{ marginLeft: 1 }}>
							Q
						</text>
						<text fg={colors.text.muted} style={{ marginLeft: 1 }}>
							to quit
						</text>
					</>
				) : (
					<>
						<text fg={colors.text.muted}>Navigate:</text>
						<text fg={colors.accent} style={{ marginLeft: 1 }}>
							↑/↓
						</text>
						<text fg={colors.text.muted} style={{ marginLeft: 1 }}>
							•
						</text>
						<text fg={colors.accent} style={{ marginLeft: 1 }}>
							Q
						</text>
						<text fg={colors.text.muted} style={{ marginLeft: 1 }}>
							Quit
						</text>
					</>
				)}
			</box>
			{!isResultShown && (
				<text fg={colors.text.muted}>
					{workflowState.resultSaved
						? `Report saved to ${workflowState.resultPath}`
						: 'Standup Workflow v1.0.7'}
				</text>
			)}
		</box>
	)
}
