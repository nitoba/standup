export interface WorkflowStreamEvent {
	/**
	 * Type of the event (e.g., "step-start", "step-complete", "custom", "agent-stream")
	 */
	type:
		| 'workflow-start'
		| 'workflow-suspended'
		| 'workflow-complete'
		| 'workflow-cancelled'
		| 'workflow-error'
		| 'step-start'
		| 'step-complete'
	/**
	 * Unique execution ID for this workflow run
	 */
	executionId: string
	/**
	 * Source of the event (step ID or name)
	 */
	from: string
	/**
	 * Input data for the step/event
	 */
	input?: Record<string, any>
	/**
	 * Output data from the step/event
	 */
	output?: Record<string, any>
	/**
	 * Current status of the step/event
	 */
	status:
		| 'pending'
		| 'running'
		| 'success'
		| 'error'
		| 'suspended'
		| 'cancelled'
	/**
	 * User context passed through the workflow
	 */
	context?: Record<string, any>
	/**
	 * Timestamp of the event
	 */
	timestamp: string
	/**
	 * Current step index in the workflow
	 */
	stepIndex?: number
	/**
	 * Step type for step events
	 */
	stepType?:
		| 'agent'
		| 'func'
		| 'conditional-when'
		| 'parallel-all'
		| 'parallel-race'
		| 'tap'
		| 'workflow'

	metadata?: Record<string, any>
	/**
	 * Error information if status is "error"
	 */
	error?: any
}
