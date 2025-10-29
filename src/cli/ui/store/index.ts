import { create } from 'zustand'
import type { WorkflowStreamEvent } from '@/ai/lib/workflow-stream-event.type'

interface WorkflowState {
	events: WorkflowStreamEvent[]
	currentEvent: WorkflowStreamEvent | undefined
	isRunning: boolean
	finalResult: string | null
	savedFilePath: string | null
	steps: string[]
	selectedStepIndex: number
}

interface WorkflowActions {
	setEvents: (events: WorkflowStreamEvent[]) => void
	addEvent: (event: WorkflowStreamEvent) => void
	setCurrentEvent: (event: WorkflowStreamEvent | undefined) => void
	setIsRunning: (running: boolean) => void
	setFinalResult: (result: string | null) => void
	setSavedFilePath: (path: string | null) => void
	setSelectedStepIndex: (index: number) => void
	navigateUp: () => void
	navigateDown: () => void
	goToFirstStep: () => void
	goToLastStep: () => void
	reset: () => void
}

const initialState: WorkflowState = {
	events: [],
	currentEvent: undefined,
	isRunning: false,
	finalResult: null,
	savedFilePath: null,
	steps: [
		'repository-discovery',
		'git-analysis',
		'if-there-are-git-results',
		'execute-analysis',
		'report-formatting',
	],
	selectedStepIndex: 0,
}

export const useWorkflowStore = create<WorkflowState & WorkflowActions>(
	(set) => ({
		...initialState,

		setEvents: (events) => set({ events }),

		addEvent: (event) =>
			set((state) => {
				// Check if an event with the same executionId and from already exists
				const existingEventIndex = state.events.findIndex(
					(e) => e.executionId === event.executionId && e.from === event.from
				)

				if (existingEventIndex !== -1) {
					// Update existing event
					const updatedEvents = [...state.events]
					updatedEvents[existingEventIndex] = event
					return { events: updatedEvents }
				}
				// Add new event
				return { events: [...state.events, event] }
			}),

		setCurrentEvent: (event) => set({ currentEvent: event }),

		setIsRunning: (running) => set(() => ({ isRunning: running })),

		setFinalResult: (result) => set({ finalResult: result }),

		setSavedFilePath: (path) => set({ savedFilePath: path }),

		setSelectedStepIndex: (index) => set({ selectedStepIndex: index }),

		navigateUp: () =>
			set((state) => ({
				selectedStepIndex: Math.max(0, state.selectedStepIndex - 1),
			})),

		navigateDown: () =>
			set((state) => ({
				selectedStepIndex: Math.min(
					state.steps.length - 1,
					state.selectedStepIndex + 1
				),
			})),

		goToFirstStep: () => set({ selectedStepIndex: 0 }),

		goToLastStep: () =>
			set((state) => ({
				selectedStepIndex: Math.max(0, state.steps.length - 1),
			})),

		reset: () => set(initialState),
	})
)
