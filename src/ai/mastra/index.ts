import { Mastra } from '@mastra/core'
import { azureDevOpsAgent } from './agents/azure-devops.agent.js'
import { reportFormatterAgent } from './agents/report-formatter.agent.js'
import { statusDeterminationAgent } from './agents/status-determination.agent.js'
import { standupReportWorkflow } from './workflows/standup-report/workflow.js'

// Create and export Mastra instance
export const mastra = new Mastra({
	agents: {
		azureDevOpsAgent,
		statusDeterminationAgent,
		reportFormatterAgent,
	},
	workflows: {
		standupReportWorkflow,
	},
	observability: {
		default: {
			enabled: false,
		},
	},
	logger: false,
})
