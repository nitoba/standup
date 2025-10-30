import { useEffect } from 'react'
import { validateEnv } from '@/lib/env/validate'
import {
	EventsLog,
	Header,
	Instructions,
	ReportPreview,
	StatusPanel,
	StepsOverview,
} from './components'
import { COLORS } from './constants/colors'
import { useKeyboardNavigation, useWorkflow } from './hooks'
import { useWorkflowStore } from './store'

validateEnv()

export function App() {
	const {
		events,
		currentEvent,
		isRunning,
		finalResult,
		savedFilePath,
		steps,
		selectedStepIndex,
	} = useWorkflowStore()

	const { executeWorkflow } = useWorkflow()
	useKeyboardNavigation()

	// Calculate progress
	const completedSteps = events.filter((e) => e.type === 'step-complete').length
	const totalSteps = steps.length

	// Start workflow on component mount and when configured
	useEffect(() => {
		executeWorkflow()
	}, [executeWorkflow])

	return (
		<box
			flexDirection="column"
			style={{
				width: '100%',
				height: '100%',
				backgroundColor: COLORS.background,
				padding: 1,
			}}
		>
			{/* Header */}
			<Header isRunning={isRunning} />

			{/* Status Panel */}
			<StatusPanel
				currentEvent={currentEvent}
				totalSteps={totalSteps}
				completedSteps={completedSteps}
			/>

			{/* Steps Overview */}
			<StepsOverview
				steps={steps}
				selectedStepIndex={selectedStepIndex}
				completedSteps={completedSteps}
			/>

			{/* Events Log */}
			{!finalResult && !savedFilePath && (
				<EventsLog events={events} currentEvent={currentEvent} />
			)}

			{/* Footer */}
			{finalResult && savedFilePath && (
				<ReportPreview report={finalResult} filePath={savedFilePath} />
			)}

			{/* Instructions */}
			<Instructions />
		</box>
	)
}
