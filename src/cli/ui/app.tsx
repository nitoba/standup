import { useEffect } from 'react'
import { DetailPanel } from './components/details-panel.js'
import { Footer } from './components/footer.js'
import { Header } from './components/header.js'
import { ResultDisplay } from './components/result-display.js'
import { StepsList } from './components/steps/list.js'
import { useWorkflow } from './hooks/use-workflow.js'
import { colors } from './utils/types.js'

export function App() {
	const { runWorkflow, workflowState } = useWorkflow()

	// biome-ignore lint/correctness/useExhaustiveDependencies: run only once time
	useEffect(() => {
		runWorkflow()
	}, [])

	return (
		<box
			style={{
				flexDirection: 'column',
				flexGrow: 1,
				backgroundColor: colors.background,
			}}
		>
			<Header workflowState={workflowState} />
			{workflowState.workflowResult && workflowState.status === 'completed' ? (
				<ResultDisplay workflowState={workflowState} />
			) : (
				<>
					<StepsList workflowState={workflowState} />
					<DetailPanel workflowState={workflowState} />
				</>
			)}
			<Footer workflowState={workflowState} />
		</box>
	)
}
