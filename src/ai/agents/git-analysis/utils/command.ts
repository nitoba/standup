function parseCommand(cmd: string): string[] {
	const args: string[] = []
	let current = ''
	let inQuotes = false

	for (let i = 0; i < cmd.length; i++) {
		const char = cmd[i]

		if (char === '"') {
			inQuotes = !inQuotes
		} else if (char === ' ' && !inQuotes) {
			if (current) {
				args.push(current)
				current = ''
			}
		} else {
			current += char
		}
	}

	if (current) {
		args.push(current)
	}

	return args
}

export function executeCommand(cmd: string, cwd?: string) {
	// Se o comando contém pipes, redirecionamentos ou outros recursos de shell,
	// precisamos executá-lo através de um shell
	const needsShell = /[|&;<>()$`\\"]/.test(cmd)

	if (needsShell) {
		// Executa através do shell
		return Bun.spawn(['bash', '-c', cmd], {
			cwd: cwd,
			stdout: 'pipe',
			stderr: 'pipe',
		})
	}
	// Comando simples, pode executar diretamente
	return Bun.spawn(parseCommand(cmd), {
		cwd: cwd,
		stdout: 'pipe',
		stderr: 'pipe',
	})
}
