import { COLORS } from '../constants/colors'

interface StepsOverviewProps {
	steps: string[]
	selectedStepIndex: number
	completedSteps: number
}

export function StepsOverview({
	steps,
	selectedStepIndex,
	completedSteps,
}: StepsOverviewProps) {
	return (
		<box
			title="📋 Workflow Steps"
			border
			borderStyle="single"
			style={{
				backgroundColor: COLORS.surface,
				padding: 1,
			}}
		>
			<box flexDirection="row" flexWrap="wrap">
				{steps.map((step, index) => (
					<text
						key={index}
						fg={
							index === selectedStepIndex
								? COLORS.primary
								: completedSteps > index
									? COLORS.success
									: COLORS.dim
						}
						style={{
							paddingLeft: 1,
							paddingRight: 1,
							marginRight: 1,
						}}
					>
						{index === selectedStepIndex
							? '▶'
							: completedSteps > index
								? '✅'
								: '⏸️'}{' '}
						{step}
					</text>
				))}
			</box>
		</box>
	)
}
