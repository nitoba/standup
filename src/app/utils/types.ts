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
	background: '#282A36', // fundo principal Dracula
	secondary: '#1E1F29', // fundo secundário levemente mais escuro
	accent: '#8BE9FD', // ciano característico
	success: '#50FA7B', // verde vibrante Dracula
	warning: '#F1FA8C', // amarelo claro
	error: '#FF5555', // vermelho rosado
	text: {
		primary: '#F8F8F2', // texto principal quase branco
		secondary: '#E2E2DC', // texto secundário levemente acinzentado
		muted: '#6272A4', // azul arroxeado para texto neutro
		inverse: '#000000', // para uso em fundos claros
	},
	border: '#44475A', // bordas suaves
	highlight: '#BD93F9', // roxo icônico do tema
}
