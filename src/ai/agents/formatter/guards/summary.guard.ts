import { createOutputGuardrail } from '@voltagent/core'
import { summarizerAgent } from '../summarize.agent'

// Crie o guardrail
export const summaryGuardrail = createOutputGuardrail({
	id: 'summary-guardrail',
	name: 'Summary Guardrail',
	description: 'Resume o texto se exceder 1500 caracteres.',
	handler: async ({ output }) => {
		if (typeof output === 'string' && output.length > 1800) {
			const summary = await summarizerAgent.generateText(
				`Resuma o seguinte texto: ${output}`
			)
			return {
				pass: true,
				action: 'modify',
				modifiedOutput: summary.text,
				message: 'Texto resumido para atender ao limite de caracteres.',
			}
		}
		return { pass: true }
	},
})
