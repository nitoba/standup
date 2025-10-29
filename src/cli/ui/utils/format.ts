// Format time helper
export const formatTime = (timestamp: string) => {
	const date = new Date(timestamp)
	return date.toLocaleTimeString('pt-BR', {
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit',
	})
}

// Format output content with proper wrapping
export const formatOutput = (output: unknown, maxLineLength = 65): string[] => {
	if (!output) return ['']

	if (typeof output === 'string') {
		return wrapText(output, maxLineLength)
	}

	if (typeof output === 'object') {
		try {
			const jsonString = JSON.stringify(output, null, 2)
			return wrapText(jsonString, maxLineLength)
		} catch {
			return wrapText(String(output), maxLineLength)
		}
	}

	return wrapText(String(output), maxLineLength)
}

// Format error messages with proper wrapping
export const formatError = (error: unknown, maxLineLength = 65): string[] => {
	const errorString = String(error)
	return wrapText(`Error: ${errorString}`, maxLineLength)
}

// Wrap text to fit within specified width
export const wrapText = (text: string, maxLineLength: number): string[] => {
	if (text.length <= maxLineLength) return [text]

	const lines: string[] = []
	const words = text.split(' ')
	let currentLine = ''

	for (const word of words) {
		// If word itself is longer than max length, split it
		if (word.length > maxLineLength) {
			// Add current line if it exists
			if (currentLine.trim()) {
				lines.push(currentLine.trim())
				currentLine = ''
			}

			// Split long word into chunks
			let remainingWord = word
			while (remainingWord.length > maxLineLength) {
				lines.push(remainingWord.substring(0, maxLineLength))
				remainingWord = remainingWord.substring(maxLineLength)
			}

			if (remainingWord) {
				currentLine = remainingWord
			}
			continue
		}

		// Check if adding this word would exceed max length
		if (currentLine.length + word.length + 1 > maxLineLength) {
			if (currentLine.trim()) {
				lines.push(currentLine.trim())
			}
			currentLine = word
		} else {
			currentLine += (currentLine ? ' ' : '') + word
		}
	}

	if (currentLine.trim()) {
		lines.push(currentLine.trim())
	}

	return lines
}

// Get event icon based on type
export const getEventIcon = (type: string) => {
	switch (type) {
		case 'workflow-start':
			return '🚀'
		case 'step-start':
			return '🔄'
		case 'step-complete':
			return '✅'
		case 'workflow-complete':
			return '🎉'
		case 'workflow-error':
			return '💥'
		case 'workflow-suspended':
			return '⏸️'
		case 'workflow-cancelled':
			return '🛑'
		default:
			return '📝'
	}
}

// Get step type icon
export const getStepTypeIcon = (stepType?: string) => {
	switch (stepType) {
		case 'agent':
			return '🤖'
		case 'func':
			return '⚡'
		case 'conditional-when':
			return '🔀'
		case 'parallel-all':
			return '🔀'
		case 'parallel-race':
			return '🏁'
		case 'tap':
			return '📋'
		case 'workflow':
			return '⚙️'
		default:
			return '📄'
	}
}
