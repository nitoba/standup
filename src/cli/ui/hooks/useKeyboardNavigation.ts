import { useKeyboard } from '@opentui/react'
import { useWorkflowStore } from '../store'
import { useWorkflow } from './useWorkflow'

export function useKeyboardNavigation() {
	const { navigateUp, navigateDown, goToFirstStep, goToLastStep, isRunning } =
		useWorkflowStore()

	const { abortWorkflow } = useWorkflow()

	useKeyboard((key) => {
		if (key.name === 'up' || key.name === 'k') {
			navigateUp()
		} else if (key.name === 'down' || key.name === 'j') {
			navigateDown()
		} else if (key.name === 'home') {
			goToFirstStep()
		} else if (key.name === 'end') {
			goToLastStep()
		} else if (key.name === 'q' || key.name === 'escape') {
			// Abort the workflow if it's running
			if (isRunning) {
				abortWorkflow()
			}
			process.exit(0)
		}
	})
}
