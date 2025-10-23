import { useTerminalDimensions } from '@opentui/react'
import { colors, type WorkflowState } from '../../utils/types'
import { Spinner } from '../spinner'
import { StepListItem } from './item'

export function StepsList({ workflowState }: { workflowState: WorkflowState }) {
	const { height } = useTerminalDimensions()

	// Calculate appropriate height for scrollbox (about 40% of terminal height)
	const scrollboxHeight = Math.max(8, Math.floor(height * 0.4))

	// Build step items manually to avoid key issues with OpenTUI
	const stepItems = []
	for (let i = 0; i < workflowState.steps.length; i++) {
		const step = workflowState.steps[i]
		if (step) {
			stepItems.push(
				<StepListItem
					step={step}
					index={i}
					isSelected={i === workflowState.selectedStepIndex}
				/>
			)
		}
	}

	return (
		<box
			style={{
				flexDirection: 'column',
				paddingLeft: 2,
				paddingRight: 2,
				height: scrollboxHeight + 6, // Account for header and separator
			}}
		>
			{/* Section header */}
			<box style={{ flexDirection: 'row', marginBottom: 1, marginTop: 1 }}>
				<text fg={colors.accent}>▸ </text>
				<text fg={colors.text.primary}>WORKFLOW STEPS</text>
				<text style={{ marginLeft: 'auto' }} fg={colors.text.muted}>
					{workflowState.steps.length} total
				</text>
			</box>

			{/* Separator */}
			<box style={{ marginBottom: 1 }}>
				<text fg={colors.border}>{'─'.repeat(60)}</text>
			</box>

			{/* Scrollable steps list with fixed height */}
			<scrollbox
				style={{
					rootOptions: {
						backgroundColor: colors.background,
						height: scrollboxHeight,
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
							foregroundColor: colors.accent,
							backgroundColor: colors.secondary,
						},
					},
				}}
				focused={true}
			>
				{workflowState.steps.length === 0 ? (
					<box
						style={{
							flexDirection: 'row',
							paddingTop: 3,
							paddingBottom: 3,
							justifyContent: 'center',
							width: '100%',
						}}
					>
						<Spinner />
						<text fg={colors.text.muted} style={{ marginLeft: 2 }}>
							Initializing workflow...
						</text>
					</box>
				) : (
					<box style={{ flexDirection: 'column', width: '100%' }}>
						{stepItems}
					</box>
				)}
			</scrollbox>
		</box>
	)
}
