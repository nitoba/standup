export interface WorkflowStep {
	id: string
	status: 'pending' | 'running' | 'success' | 'error'
	startTime?: number
	duration?: number
	error?: string
}

export interface WorkflowState {
	status: 'idle' | 'running' | 'completed' | 'error'
	steps: WorkflowStep[]
	startTime?: number
	totalDuration?: number
	selectedStepIndex: number
	workflowResult?: string
	resultSaved?: boolean
	resultPath?: string
}

// Modern color palette
export const colors = {
	background: '#0A0E1A',
	secondary: '#1A1F2E',
	accent: '#00D9FF',
	success: '#10B981',
	warning: '#F59E0B',
	error: '#EF4444',
	text: {
		primary: '#FFFFFF',
		secondary: '#E5E7EB',
		muted: '#9CA3AF',
		inverse: '#000000',
	},
	border: '#374151',
	highlight: '#1E293B',
}
