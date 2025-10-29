export const COLORS = {
	primary: '#6a5acd',
	secondary: '#4682b4',
	success: '#10b981',
	warning: '#f59e0b',
	error: '#ef4444',
	info: '#3b82f6',
	background: '#1a1b26',
	surface: '#24283b',
	text: '#c0caf5',
	dim: '#9ca3af',
	border: '#414868',
}

export const STATUS_COLORS = {
	pending: COLORS.dim,
	running: COLORS.info,
	success: COLORS.success,
	error: COLORS.error,
	suspended: COLORS.warning,
	cancelled: COLORS.dim,
}
